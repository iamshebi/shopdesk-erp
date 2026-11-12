"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { log } from "@/lib/activity";
import { str, numf } from "@/lib/util";

function productFields(fd: FormData) {
  return [
    str(fd, "name"),
    str(fd, "brand"),
    str(fd, "category"),
    str(fd, "sku"),
    str(fd, "barcode"),
    numf(fd, "cost"),
    numf(fd, "price"),
    fd.get("track_serial") === "on",
    fd.get("is_service") === "on",
    Math.round(numf(fd, "reorder_level")),
  ];
}

export async function createProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const opening = Math.round(numf(fd, "opening_qty"));
  const fields = productFields(fd);
  if (!can(user, "products.cost")) fields[5] = 0;
  const id = await tx(async (t) => {
    const [p] = await t<{ id: number }>(
      `INSERT INTO products (name, brand, category, sku, barcode, cost, price, track_serial, is_service, reorder_level, stock_qty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [...fields, fields[7] || fields[8] ? 0 : opening],
    );
    if (fields[7]) {
      const imeis = str(fd, "opening_imeis").split(/[\s,]+/).filter(Boolean);
      for (const imei of imeis) {
        await t("INSERT INTO units (product_id, imei, cost, source) VALUES ($1, $2, $3, 'opening')", [p.id, imei, fields[5]]);
      }
    }
    return p.id;
  });
  await log(user.id, "Product added", String(fields[0]), `/products/${id}`);
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function updateProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const before = await one<any>("SELECT name, price, cost FROM products WHERE id=$1", [id]);
  const fields = productFields(fd);
  if (!can(user, "products.cost") && before) fields[5] = before.cost;
  await q(
    `UPDATE products SET name=$1, brand=$2, category=$3, sku=$4, barcode=$5, cost=$6, price=$7, track_serial=$8, is_service=$9, reorder_level=$10
     WHERE id=$11`,
    [...fields, id],
  );
  if (before && Number(before.price) !== fields[6]) {
    await log(user.id, "Price changed", `${before.name}: ${before.price} → ${fields[6]}`, `/products/${id}`);
  } else {
    await log(user.id, "Product edited", String(fields[0]), `/products/${id}`);
  }
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}

export async function toggleProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const r = await one<any>("UPDATE products SET active = NOT active WHERE id=$1 RETURNING name, active", [id]);
  if (r) await log(user.id, r.active ? "Product restored" : "Product archived", r.name, `/products/${id}`);
  revalidatePath(`/products/${id}`);
}

export async function adjustStock(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(fd.get("id"));
  const delta = Math.round(numf(fd, "delta"));
  const r = await one<any>("UPDATE products SET stock_qty = stock_qty + $1 WHERE id=$2 RETURNING name, stock_qty", [delta, id]);
  if (r) await log(user.id, "Stock adjusted", `${r.name}: ${delta > 0 ? "+" : ""}${delta} (now ${r.stock_qty})`, `/products/${id}`);
  revalidatePath(`/products/${id}`);
}

export async function addUnits(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(fd.get("id"));
  const p = await one<{ cost: number }>("SELECT cost FROM products WHERE id=$1", [id]);
  const cost = fd.get("cost") ? numf(fd, "cost") : p?.cost ?? 0;
  const imeis = str(fd, "imeis").split(/[\s,]+/).filter(Boolean);
  const dupes: string[] = [];
  for (const imei of imeis) {
    const exists = await one("SELECT 1 FROM units WHERE imei=$1 AND status='in_stock'", [imei]);
    if (exists) {
      dupes.push(imei);
      continue;
    }
    await q("INSERT INTO units (product_id, imei, cost, source) VALUES ($1,$2,$3,'opening')", [id, imei, cost]);
  }
  await log(user.id, "IMEIs added to stock", `${imeis.length - dupes.length} unit(s)`, `/products/${id}`);
  revalidatePath(`/products/${id}`);
  if (dupes.length) redirect(`/products/${id}?err=${encodeURIComponent("Already in stock: " + dupes.join(", "))}`);
}

export async function writeOffUnit(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const unitId = Number(fd.get("unit_id"));
  const u = await one<{ product_id: number }>("UPDATE units SET status='written_off', notes=$2 WHERE id=$1 AND status='in_stock' RETURNING product_id", [
    unitId,
    str(fd, "reason") || "Written off",
  ]);
  if (u) {
    await log(user.id, "Unit written off", `${str(fd, "reason") || "Written off"} (unit #${unitId})`, `/products/${u.product_id}`);
    revalidatePath(`/products/${u.product_id}`);
  }
}

async function readRows(fd: FormData): Promise<string[][]> {
  const file = fd.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0 && /\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v: any) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((r: any) => r.text).join("") ?? "");
        return String(v);
      });
      out.push(vals.map((v) => v.trim()));
    });
    return out;
  }
  let text = str(fd, "csv");
  if (!text && file && typeof file === "object" && "text" in file && file.size > 0) text = await file.text();
  const parse = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if ((c === "," || c === "\t" || c === ";") && !inQ) { out.push(cur.trim()); cur = ""; } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim()).map(parse);
}

// Import products or customers from Excel (.xlsx) or CSV. Columns are matched by header name.
export async function importProducts(_: unknown, fd: FormData) {
  const kind = str(fd, "kind") === "customers" ? "customers" : "products";
  const user = await requireUser(kind === "customers" ? "data" : "products.import");
  let rows = await readRows(fd);
  if (!rows.length) return { error: "Choose an Excel / CSV file or paste the data first", count: 0 };
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const n = (v: string) => {
    const x = parseFloat((v ?? "").replace(/[^\d.\-]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  let count = 0;

  if (kind === "customers") {
    const col = { name: idx(["name", "customer"]), phone: idx(["phone", "mobile", "contact"]), email: idx(["mail"]), trn: idx(["trn", "vat"]), address: idx(["address", "location"]) };
    if (col.name < 0) return { error: "The first row must have a “name” column", count: 0 };
    rows = rows.slice(1);
    await tx(async (t) => {
      for (const r of rows) {
        const name = get(r, col.name);
        if (!name) continue;
        const phone = get(r, col.phone);
        if (phone && (await t("SELECT 1 FROM customers WHERE phone=$1", [phone])).length) continue;
        await t("INSERT INTO customers (name, phone, email, trn, address) VALUES ($1,$2,$3,$4,$5)", [name, phone, get(r, col.email), get(r, col.trn), get(r, col.address)]);
        count++;
      }
    });
    await log(user.id, "Customers imported", `${count} customers`, "/customers");
    revalidatePath("/customers");
    return { error: "", count };
  }

  const hasHeader = idx(["name", "item", "product"]) >= 0;
  const col = hasHeader
    ? {
        name: idx(["name", "item", "product", "description"]),
        brand: idx(["brand", "make"]),
        category: idx(["category", "group", "type"]),
        sku: idx(["sku", "code", "item no"]),
        barcode: idx(["barcode", "ean", "upc"]),
        cost: idx(["cost", "purchase"]),
        price: idx(["price", "selling", "rate", "mrp"]),
        qty: idx(["qty", "quantity", "stock"]),
        serial: idx(["serial", "imei"]),
      }
    : { name: 0, brand: 1, category: 2, sku: 3, barcode: 4, cost: 5, price: 6, qty: 7, serial: 8 };
  if (hasHeader) rows = rows.slice(1);
  const canCost = can(user, "products.cost");
  await tx(async (t) => {
    for (const r of rows) {
      const name = get(r, col.name);
      if (!name) continue;
      const serial = /^(y|yes|true|1)$/i.test(get(r, col.serial));
      await t(
        `INSERT INTO products (name, brand, category, sku, barcode, cost, price, stock_qty, track_serial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [name, get(r, col.brand), get(r, col.category), get(r, col.sku), get(r, col.barcode), canCost ? n(get(r, col.cost)) : 0, n(get(r, col.price)), serial ? 0 : Math.round(n(get(r, col.qty))), serial],
      );
      count++;
    }
  });
  await log(user.id, "Products imported", `${count} products`, "/products");
  revalidatePath("/products");
  return { error: "", count };
}
