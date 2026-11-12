"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
  await requireUser("products");
  const opening = Math.round(numf(fd, "opening_qty"));
  const fields = productFields(fd);
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
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function updateProduct(fd: FormData) {
  await requireUser("products");
  const id = Number(fd.get("id"));
  await q(
    `UPDATE products SET name=$1, brand=$2, category=$3, sku=$4, barcode=$5, cost=$6, price=$7, track_serial=$8, is_service=$9, reorder_level=$10
     WHERE id=$11`,
    [...productFields(fd), id],
  );
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}

export async function toggleProduct(fd: FormData) {
  await requireUser("products");
  const id = Number(fd.get("id"));
  await q("UPDATE products SET active = NOT active WHERE id=$1", [id]);
  revalidatePath(`/products/${id}`);
}

export async function adjustStock(fd: FormData) {
  const user = await requireUser("products");
  if (user.role === "cashier") redirect("/products?denied=1");
  const id = Number(fd.get("id"));
  const delta = Math.round(numf(fd, "delta"));
  await q("UPDATE products SET stock_qty = stock_qty + $1 WHERE id=$2", [delta, id]);
  revalidatePath(`/products/${id}`);
}

export async function addUnits(fd: FormData) {
  const user = await requireUser("products");
  if (user.role === "cashier") redirect("/products?denied=1");
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
  revalidatePath(`/products/${id}`);
  if (dupes.length) redirect(`/products/${id}?err=${encodeURIComponent("Already in stock: " + dupes.join(", "))}`);
}

export async function writeOffUnit(fd: FormData) {
  const user = await requireUser("products");
  if (user.role === "cashier") redirect("/products?denied=1");
  const unitId = Number(fd.get("unit_id"));
  const u = await one<{ product_id: number }>("UPDATE units SET status='written_off', notes=$2 WHERE id=$1 AND status='in_stock' RETURNING product_id", [
    unitId,
    str(fd, "reason") || "Written off",
  ]);
  if (u) revalidatePath(`/products/${u.product_id}`);
}

// CSV import: name,brand,category,sku,barcode,cost,price,qty,serial(yes/no)
export async function importProducts(_: unknown, fd: FormData) {
  await requireUser("products");
  const text = str(fd, "csv");
  if (!text) return { error: "Paste or choose a CSV file first", count: 0 };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const parse = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if ((c === "," || c === "\t" || c === ";") && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  let rows = lines.map(parse);
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
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
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  const n = (v: string) => {
    const x = parseFloat(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  let count = 0;
  await tx(async (t) => {
    for (const r of rows) {
      const name = get(r, col.name);
      if (!name) continue;
      const serial = /^(y|yes|true|1)$/i.test(get(r, col.serial));
      await t(
        `INSERT INTO products (name, brand, category, sku, barcode, cost, price, stock_qty, track_serial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [name, get(r, col.brand), get(r, col.category), get(r, col.sku), get(r, col.barcode), n(get(r, col.cost)), n(get(r, col.price)), serial ? 0 : Math.round(n(get(r, col.qty))), serial],
      );
      count++;
    }
  });
  revalidatePath("/products");
  return { error: "", count };
}
