"use server";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";

export interface ProductHit {
  id: number;
  name: string;
  brand: string;
  category: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number;
  track_serial: boolean;
  is_service: boolean;
  track_batch?: boolean;
  stock: number | null;
  match_unit?: { id: number; imei: string; cost: number; margin_scheme: boolean; price: number | null } | null;
}

export async function searchProducts(term: string): Promise<ProductHit[]> {
  await requireUser();
  const t = term.trim();
  if (!t) {
    return q<ProductHit>(`SELECT p.id, p.name, p.brand, p.category, p.sku, p.barcode, p.price, p.cost, p.track_serial, p.is_service, p.track_batch, ${STOCK_SQL} AS stock
      FROM products p WHERE p.active AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 12`);
  }
  // Exact IMEI scan -> return that product with the unit pre-selected.
  const unit = await q<any>(
    `SELECT u.id, u.imei, u.cost, u.margin_scheme, u.price, u.product_id FROM units u WHERE u.imei = $1 AND u.status='in_stock' LIMIT 1`,
    [t],
  );
  const words = t.split(/\s+/).filter(Boolean).slice(0, 5);
  const params: unknown[] = [t];
  const conds = words.map((w) => {
    params.push(`%${w}%`);
    const i = params.length;
    return `(p.name ILIKE $${i} OR p.brand ILIKE $${i} OR p.sku ILIKE $${i} OR p.category ILIKE $${i})`;
  });
  const rows = await q<ProductHit>(
    `SELECT p.id, p.name, p.brand, p.category, p.sku, p.barcode, p.price, p.cost, p.track_serial, p.is_service, p.track_batch, ${STOCK_SQL} AS stock
     FROM products p
     WHERE p.active AND p.status = 'active' AND (p.barcode = $1 OR p.sku = $1 OR (${conds.join(" AND ") || "false"}) ${unit[0] ? `OR p.id = ${Number(unit[0].product_id)}` : ""})
     ORDER BY (p.barcode = $1 OR p.sku = $1) DESC, p.name LIMIT 20`,
    params,
  );
  if (unit[0]) {
    const u = unit[0];
    rows.sort((a, b) => (a.id === u.product_id ? -1 : b.id === u.product_id ? 1 : 0));
    rows[0].match_unit = { id: u.id, imei: u.imei, cost: u.cost, margin_scheme: u.margin_scheme, price: u.price };
  }
  return rows;
}

export async function availableUnits(productId: number) {
  await requireUser();
  return q<{ id: number; imei: string; cost: number; margin_scheme: boolean; price: number | null }>(
    "SELECT id, imei, cost, margin_scheme, price FROM units WHERE product_id=$1 AND status='in_stock' ORDER BY created_at",
    [productId],
  );
}

export async function searchCustomers(term: string) {
  await requireUser();
  const t = term.trim();
  if (!t) return [];
  return q<{ id: number; name: string; phone: string; trn: string; address: string }>(
    "SELECT id, name, phone, trn, address FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY name LIMIT 8",
    [`%${t}%`],
  );
}

export async function customerTermsFor(id: number) {
  await requireUser();
  const { customerTerms } = await import("@/lib/customer-pricing");
  return customerTerms(q, id);
}
