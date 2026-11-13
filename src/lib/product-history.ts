import "server-only";
import type { Exec } from "./db";

const LABELS: Record<string, string> = {
  name: "Name", brand: "Brand", category: "Category", sku: "SKU", barcode: "Barcode", cost: "Cost", price: "Price", track_serial: "IMEI tracking",
  is_service: "Service", reorder_level: "Low-stock level", status: "Status", tags: "Tags", description: "Description", specs: "Specifications",
  discount_price: "Discount price", featured: "Featured", website_visible: "On website", seo_title: "SEO title", seo_description: "SEO description",
  stock_qty: "Stock", active: "Archived",
};
const fmt = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const same = (a: unknown, b: unknown) => {
  if ((a === null || a === "") && (b === null || b === "")) return true;
  if (typeof b === "number" || typeof a === "number") return Number(a) === Number(b);
  return fmt(a) === fmt(b);
};

/** Write one history row per changed field. */
export async function recordChanges(t: Exec, productId: number, userId: number, before: Record<string, any>, after: Record<string, any>, source = "edit") {
  const changed: string[] = [];
  for (const k of Object.keys(after)) {
    if (!(k in before) || same(before[k], after[k])) continue;
    changed.push(LABELS[k] ?? k);
    await t("INSERT INTO product_history (product_id, user_id, field, old_value, new_value, source) VALUES ($1,$2,$3,$4,$5,$6)", [
      productId, userId, LABELS[k] ?? k, fmt(before[k]), fmt(after[k]), source,
    ]);
  }
  return changed;
}

