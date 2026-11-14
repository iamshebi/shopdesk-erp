"use server";
import { revalidatePath } from "next/cache";
import { moveQty, moveUnit, MOVE_TYPES } from "@/lib/inventory";
import { redirect } from "next/navigation";
import { q, one, tx } from "@/lib/db";
import { internalEan13 } from "@/lib/barcode";
import { recordChanges } from "@/lib/product-history";
import { requireUser, can } from "@/lib/auth";
import { log } from "@/lib/activity";
import { str, numf } from "@/lib/util";

const STATUSES = ["active", "draft", "inactive", "pending"];
import { customFields, readCustom } from "@/lib/custom-fields";
import { getSettings } from "@/lib/settings";

/** When approval is on, staff without approval rights can only submit products for review. */
async function gateStatus(user: any, status: string) {
  const s = await getSettings();
  if (s.require_product_approval && status === "active" && !can(user, "products.approve")) return "pending";
  return status;
}

function cleanTags(v: string) {
  return [...new Set(v.split(",").map((t) => t.trim()).filter(Boolean))].join(", ");
}

/** Every editable product field, read from the product form. */
function readProduct(fd: FormData) {
  const discount = str(fd, "discount_price");
  return {
    name: str(fd, "name"),
    brand: str(fd, "brand"),
    category: str(fd, "category"),
    sku: str(fd, "sku"),
    barcode: str(fd, "barcode"),
    cost: numf(fd, "cost"),
    price: numf(fd, "price"),
    track_serial: fd.get("track_serial") === "on",
    is_service: fd.get("is_service") === "on",
    reorder_level: Math.round(numf(fd, "reorder_level")),
    status: STATUSES.includes(str(fd, "status")) ? str(fd, "status") : "active",
    tags: cleanTags(str(fd, "tags")),
    description: str(fd, "description"),
    specs: str(fd, "specs"),
    discount_price: discount ? numf(fd, "discount_price") : null,
    featured: fd.get("featured") === "on",
    website_visible: fd.get("website_visible") === "on",
    seo_title: str(fd, "seo_title"),
    seo_description: str(fd, "seo_description"),
    track_batch: fd.get("track_batch") === "on",
  };
}
type ProductData = ReturnType<typeof readProduct>;
const COLS = Object.keys(readProduct(new FormData())) as (keyof ProductData)[];

export async function createProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const opening = Math.round(numf(fd, "opening_qty"));
  const d = readProduct(fd);
  if (!can(user, "products.cost")) d.cost = 0;
  if (!d.name) redirect("/products/new?err=" + encodeURIComponent("Product name is required"));
  d.status = await gateStatus(user, d.status);
  const cf = readCustom(await customFields("products"), fd);
  if (cf.error) redirect("/products/new?err=" + encodeURIComponent(cf.error));
  const id = await tx(async (t) => {
    const [p] = await t<{ id: number }>(
      `INSERT INTO products (${COLS.join(", ")}, stock_qty) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(", ")}, $${COLS.length + 1}) RETURNING id`,
      [...COLS.map((c) => d[c]), 0],
    );
    const wh = Number(str(fd, "warehouse_id")) || undefined;
    if (!d.track_serial && !d.is_service && opening) await moveQty(t, { productId: p.id, qty: opening, type: "opening", userId: user.id, warehouseId: wh });
    if (!d.sku) await t("UPDATE products SET sku = $2 WHERE id=$1", [p.id, `P${String(p.id).padStart(5, "0")}`]);
    await t("UPDATE products SET custom=$2 WHERE id=$1", [p.id, JSON.stringify(cf.values)]);
    if (d.track_serial) {
      const imeis = str(fd, "opening_imeis").split(/[\s,]+/).filter(Boolean);
      for (const imei of imeis) {
        const [u] = await t<{ id: number }>("INSERT INTO units (product_id, imei, cost, source) VALUES ($1, $2, $3, 'opening') RETURNING id", [p.id, imei, d.cost]);
        await moveUnit(t, { unitId: u.id, productId: p.id, qty: 1, type: "opening", userId: user.id, warehouseId: wh });
      }
    }
    await t("INSERT INTO product_history (product_id, user_id, field, new_value, source) VALUES ($1,$2,'Created',$3,'create')", [p.id, user.id, d.name]);
    return p.id;
  });
  await log(user.id, "Product added", d.name, `/products/${id}`);
  if (d.status === "pending") await (await import("@/lib/notify")).notifyPerm(["products.approve"], `New product needs approval: ${d.name}`, `/products/${id}`, "approval", user.id);
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function updateProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const before = await one<any>(`SELECT ${COLS.join(", ")} FROM products WHERE id=$1`, [id]);
  if (!before) redirect("/products");
  const d = readProduct(fd);
  if (!can(user, "products.cost")) d.cost = before.cost;
  if (d.status !== before.status) d.status = await gateStatus(user, d.status);
  const cf = readCustom(await customFields("products"), fd);
  if (cf.error) redirect(`/products/${id}?err=${encodeURIComponent(cf.error)}`);
  const changed = await tx(async (t) => {
    await t(`UPDATE products SET ${COLS.map((c, i) => `${c}=$${i + 1}`).join(", ")}, custom=$${COLS.length + 2}, updated_at=now() WHERE id=$${COLS.length + 1}`, [...COLS.map((c) => d[c]), id, JSON.stringify(cf.values)]);
    return recordChanges(t, id, user.id, before, d);
  });
  if (Number(before.price) !== d.price) await log(user.id, "Price changed", `${before.name}: ${before.price} → ${d.price}`, `/products/${id}`);
  else if (changed.length) await log(user.id, "Product edited", `${d.name}: ${changed.join(", ")}`, `/products/${id}`);
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}

export async function toggleProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const r = await one<any>("UPDATE products SET active = NOT active, updated_at=now() WHERE id=$1 RETURNING name, active", [id]);
  if (r) {
    await q("INSERT INTO product_history (product_id, user_id, field, old_value, new_value) VALUES ($1,$2,'Archived',$3,$4)", [id, user.id, r.active ? "yes" : "no", r.active ? "no" : "yes"]);
    await log(user.id, r.active ? "Product restored" : "Product archived", r.name, `/products/${id}`);
  }
  revalidatePath(`/products/${id}`);
}

export async function duplicateProduct(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const newId = await tx(async (t) => {
    const keep = COLS.filter((c) => !["sku", "barcode"].includes(c));
    const [p] = await t<{ id: number; name: string }>(
      `INSERT INTO products (${keep.join(", ")}, stock_qty) SELECT ${keep.map((c) => (c === "name" ? "name || ' (copy)'" : c === "status" ? "'draft'" : c)).join(", ")}, 0 FROM products WHERE id=$1 RETURNING id, name`,
      [id],
    );
    await t("UPDATE products SET sku = $2 WHERE id=$1", [p.id, `P${String(p.id).padStart(5, "0")}`]);
    await t("INSERT INTO product_history (product_id, user_id, field, new_value, source) VALUES ($1,$2,'Created',$3,'duplicate')", [p.id, user.id, `Copy of product #${id}`]);
    return p.id;
  });
  await log(user.id, "Product duplicated", `#${id} → #${newId}`, `/products/${newId}`);
  redirect(`/products/${newId}?saved=1&dup=1`);
}

export async function generateBarcode(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const code = internalEan13(id);
  const r = await one<{ barcode: string }>("SELECT barcode FROM products WHERE id=$1", [id]);
  await q("UPDATE products SET barcode=$2, updated_at=now() WHERE id=$1", [id, code]);
  await q("INSERT INTO product_history (product_id, user_id, field, old_value, new_value) VALUES ($1,$2,'Barcode',$3,$4)", [id, user.id, r?.barcode ?? "", code]);
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}

/** Apply one change to many products at once (from the bulk toolbar on the products list). */
export async function bulkProducts(fd: FormData) {
  const op = str(fd, "op");
  const ids = fd.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const back = str(fd, "back") || "/products";
  const done = (msg: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}ok=${encodeURIComponent(msg)}`);
  if (!ids.length) done("Select at least one product first");
  if (op === "labels") redirect(`/print/labels?ids=${ids.join(",")}&copies=${Math.max(1, Math.min(50, Math.round(numf(fd, "copies")) || 1))}`);
  if (op === "export") redirect(`/api/export/products?ids=${ids.join(",")}`);
  if (op === "delete") {
    const u = await requireUser("products.approve");
    let deleted = 0, archived = 0;
    for (const id of ids) {
      const used = await one<{ n: number }>(`SELECT (SELECT count(*) FROM sale_items WHERE product_id=$1) + (SELECT count(*) FROM purchase_items WHERE product_id=$1) + (SELECT count(*) FROM order_items WHERE product_id=$1)
        + (SELECT count(*) FROM units WHERE product_id=$1) + (SELECT count(*) FROM stock_moves WHERE product_id=$1 AND type <> 'opening') + (SELECT count(*) FROM purchase_order_items WHERE product_id=$1) AS n`, [id]);
      if (Number(used?.n) > 0) { await q("UPDATE products SET active=FALSE, updated_at=now() WHERE id=$1", [id]); archived++; continue; }
      await tx(async (t) => {
        for (const tb of ["product_stock", "stock_moves", "product_history", "batches", "stock_transfer_items", "stock_count_items"]) await t(`DELETE FROM ${tb} WHERE product_id=$1`, [id]);
        await t("DELETE FROM files WHERE kind='product' AND owner_id=$1", [id]);
        await t("UPDATE products SET parent_id=NULL WHERE parent_id=$1", [id]);
        await t("DELETE FROM products WHERE id=$1", [id]);
      });
      deleted++;
    }
    await log(u.id, "Products deleted", `${deleted} deleted, ${archived} archived (had history)`, "/products");
    revalidatePath("/products");
    done(`${deleted} deleted${archived ? `, ${archived} archived because they have sales or stock history` : ""}`);
  }
  if (op === "approve") {
    const u = await requireUser("products.approve");
    await q("UPDATE products SET status='active', updated_at=now() WHERE id = ANY($1::int[]) AND status='pending'", [ids]);
    await log(u.id, "Products approved", `${ids.length} product(s)`, "/products");
    revalidatePath("/products");
    done(`${ids.length} product(s) approved`);
  }
  const user = await requireUser("products.edit");
  const rows = await q<any>(`SELECT id, name, ${COLS.join(", ")}, active FROM products WHERE id = ANY($1::int[])`, [ids]);
  let summary = "";
  await tx(async (t) => {
    for (const p of rows) {
      const after: Record<string, any> = {};
      if (op === "status") after.status = STATUSES.includes(str(fd, "status")) ? str(fd, "status") : p.status;
      else if (op === "category") after.category = str(fd, "category");
      else if (op === "brand") after.brand = str(fd, "brand");
      else if (op === "tag_add") after.tags = cleanTags(`${p.tags}, ${str(fd, "tag")}`);
      else if (op === "tag_remove") after.tags = cleanTags(p.tags.split(",").filter((x: string) => x.trim().toLowerCase() !== str(fd, "tag").toLowerCase()).join(","));
      else if (op === "website") after.website_visible = str(fd, "website") === "show";
      else if (op === "archive") after.active = false;
      else if (op === "price") {
        const mode = str(fd, "mode"), v = numf(fd, "value"), round = str(fd, "round");
        let price = Number(p.price);
        if (mode === "percent") price = price * (1 + v / 100);
        else if (mode === "amount") price = price + v;
        else if (mode === "set") price = v;
        else if (mode === "margin") price = Number(p.cost) * (1 + v / 100);
        if (round === "whole") price = Math.round(price);
        else if (round === "99") price = Math.max(0, Math.ceil(price) - 0.01);
        else if (round === "5") price = Math.round(price / 5) * 5;
        after.price = Math.max(0, Math.round(price * 100) / 100);
      } else continue;
      const sets = Object.keys(after);
      await t(`UPDATE products SET ${sets.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=now() WHERE id=$1`, [p.id, ...sets.map((k) => after[k])]);
      await recordChanges(t, p.id, user.id, p, after, "bulk");
    }
  });
  const what: Record<string, string> = {
    status: `Status set to ${str(fd, "status")}`, category: `Category set to “${str(fd, "category")}”`, brand: `Brand set to “${str(fd, "brand")}”`,
    tag_add: `Tag “${str(fd, "tag")}” added`, tag_remove: `Tag “${str(fd, "tag")}” removed`, price: "Prices updated", archive: "Archived",
    website: str(fd, "website") === "show" ? "Shown on website" : "Hidden from website",
  };
  summary = `${what[op] ?? "Updated"} for ${rows.length} product${rows.length === 1 ? "" : "s"}`;
  await log(user.id, op === "price" ? "Bulk price change" : "Bulk product edit", summary, "/products");
  revalidatePath("/products");
  done(summary);
}

export async function adjustStock(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(fd.get("id"));
  const delta = Math.round(numf(fd, "delta"));
  const reason = str(fd, "reason") || "adjust";
  const r = await tx(async (t) => {
    await moveQty(t, { productId: id, qty: delta, type: MOVE_TYPES[reason] ? reason : "adjust", reason: str(fd, "note"), userId: user.id, warehouseId: Number(str(fd, "warehouse_id")) || undefined });
    const [row] = await t<any>("SELECT name, stock_qty FROM products WHERE id=$1", [id]);
    return row;
  });
  if (r) await q("INSERT INTO product_history (product_id, user_id, field, old_value, new_value, source) VALUES ($1,$2,'Stock',$3,$4,'adjust')", [id, user.id, String(r.stock_qty - delta), String(r.stock_qty)]);
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
    await tx(async (t) => {
      const [u] = await t<{ id: number }>("INSERT INTO units (product_id, imei, cost, source) VALUES ($1,$2,$3,'opening') RETURNING id", [id, imei, cost]);
      await moveUnit(t, { unitId: u.id, productId: id, qty: 1, type: "opening", userId: user.id, warehouseId: Number(str(fd, "warehouse_id")) || undefined });
    });
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
    await tx((t) => moveUnit(t, { unitId, productId: u.product_id, qty: -1, type: "writeoff", reason: str(fd, "reason"), userId: user.id }));
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8) RETURNING id`,
        [name, get(r, col.brand), get(r, col.category), get(r, col.sku), get(r, col.barcode), canCost ? n(get(r, col.cost)) : 0, n(get(r, col.price)), serial],
      ).then(async ([np]: any[]) => {
        const qty = serial ? 0 : Math.round(n(get(r, col.qty)));
        if (qty) await moveQty(t, { productId: np.id, qty, type: "import", userId: user.id });
      });
      count++;
    }
  });
  await log(user.id, "Products imported", `${count} products`, "/products");
  revalidatePath("/products");
  return { error: "", count };
}


/** Creates variants (e.g. colours / sizes) of a product as child products with their own SKU and stock. */
export async function addVariants(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(str(fd, "id"));
  const parent = await one<any>("SELECT * FROM products WHERE id=$1", [id]);
  if (!parent) redirect("/products");
  const rootId = parent.parent_id ?? parent.id;
  // "Color: Red, Blue | Size: S, M" -> every combination
  const axes = str(fd, "axes").split("|").map((a) => a.split(":")).filter((a) => a.length === 2)
    .map(([k, v]) => [k.trim(), v.split(",").map((x) => x.trim()).filter(Boolean)] as [string, string[]]).filter(([k, v]) => k && v.length);
  if (!axes.length) redirect(`/products/${id}?err=${encodeURIComponent("Write the options like: Color: Red, Blue | Size: S, M")}`);
  let combos: Record<string, string>[] = [{}];
  for (const [k, vals] of axes) combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [k]: v })));
  if (combos.length > 50) redirect(`/products/${id}?err=${encodeURIComponent("That makes more than 50 variants. Split it up.")}`);
  const price = str(fd, "price") ? numf(fd, "price") : Number(parent.price);
  const status = await gateStatus(user, "active");
  let made = 0;
  await tx(async (t) => {
    const keep = COLS.filter((c) => !["sku", "barcode", "name", "price", "status"].includes(c));
    for (const attrs of combos) {
      const label = Object.values(attrs).join(" / ");
      const [ex] = await t("SELECT id FROM products WHERE parent_id=$1 AND attributes=$2::jsonb", [rootId, JSON.stringify(attrs)]);
      if (ex) continue;
      const [p] = await t<{ id: number }>(
        `INSERT INTO products (${keep.join(", ")}, name, price, status, parent_id, attributes, stock_qty) SELECT ${keep.join(", ")}, $2, $3, $4, $5, $6, 0 FROM products WHERE id=$1 RETURNING id`,
        [rootId, `${parent.parent_id ? parent.name.split(" - ")[0] : parent.name} - ${label}`, price, status, rootId, JSON.stringify(attrs)],
      );
      const [root] = await t<{ sku: string }>("SELECT sku FROM products WHERE id=$1", [rootId]);
      await t("UPDATE products SET sku=$2 WHERE id=$1", [p.id, `${root.sku || "P" + rootId}-${Object.values(attrs).map((v) => v.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()).join("-")}`]);
      await t("INSERT INTO product_history (product_id, user_id, field, new_value, source) VALUES ($1,$2,'Created',$3,'variant')", [p.id, user.id, `Variant of #${rootId}: ${label}`]);
      made++;
    }
  });
  await log(user.id, "Variants added", `${made} of #${rootId}`, `/products/${rootId}`);
  revalidatePath(`/products/${rootId}`);
  redirect(`/products/${rootId}?saved=1&msg=${encodeURIComponent(`${made} variant(s) created`)}`);
}

export async function saveRelated(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(str(fd, "id"));
  const codes = str(fd, "related").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const ids: number[] = [];
  for (const c of codes) {
    const p = await one<{ id: number }>("SELECT id FROM products WHERE id<>$2 AND ((sku<>'' AND lower(sku)=lower($1)) OR lower(name)=lower($1)) LIMIT 1", [c, id]);
    if (p && !ids.includes(p.id)) ids.push(p.id);
  }
  await q("UPDATE products SET related_ids=$2, updated_at=now() WHERE id=$1", [id, ids]);
  await log(user.id, "Related products set", `#${id}: ${ids.length}`, `/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}

export async function approveProduct(fd: FormData) {
  const user = await requireUser("products.approve");
  const id = Number(str(fd, "id"));
  const r = await one<any>("UPDATE products SET status=$2, updated_at=now() WHERE id=$1 RETURNING name", [id, str(fd, "decision") === "reject" ? "draft" : "active"]);
  await q("INSERT INTO product_history (product_id, user_id, field, old_value, new_value) VALUES ($1,$2,'Status','pending',$3)", [id, user.id, str(fd, "decision") === "reject" ? "draft (rejected)" : "active (approved)"]);
  await log(user.id, str(fd, "decision") === "reject" ? "Product rejected" : "Product approved", r?.name ?? "", `/products/${id}`);
  redirect(`/products/${id}?saved=1`);
}
