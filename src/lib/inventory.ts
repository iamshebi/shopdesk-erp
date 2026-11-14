import "server-only";
import type { Exec } from "./db";

// Every stock change goes through here, so the total on the product, the quantity per warehouse
// and the movement history always agree.

export const MOVE_TYPES: Record<string, string> = {
  opening: "Opening stock", purchase: "Purchase", sale: "Sale", return: "Customer return", buyback: "Bought used",
  adjust: "Adjustment", damaged: "Damaged", lost: "Lost / stolen", found: "Found", writeoff: "Written off",
  transfer_out: "Transfer out", transfer_in: "Transfer in", count: "Stock count", supplier_return: "Returned to supplier", purchase_return: "Purchase return (debit note)", import: "Import",
};

export async function defaultWarehouseId(t: Exec): Promise<number> {
  const [w] = await t<{ id: number }>("SELECT id FROM warehouses WHERE is_default AND active ORDER BY id LIMIT 1");
  if (w) return w.id;
  const [any] = await t<{ id: number }>("SELECT id FROM warehouses ORDER BY id LIMIT 1");
  if (any) return any.id;
  const [made] = await t<{ id: number }>("INSERT INTO warehouses (name, code, is_default) VALUES ('Main shop', 'MAIN', TRUE) RETURNING id");
  return made.id;
}

interface Move {
  productId: number;
  qty: number; // + in, − out
  type: string;
  warehouseId?: number | null;
  reason?: string;
  ref?: string;
  userId?: number | null;
}

/** Quantity-tracked products (not IMEI): change stock in one warehouse and record the movement. */
export async function moveQty(t: Exec, m: Move) {
  if (!m.qty) return;
  const wh = m.warehouseId || (await defaultWarehouseId(t));
  const [p] = await t<{ is_service: boolean; track_serial: boolean }>("SELECT is_service, track_serial FROM products WHERE id=$1", [m.productId]);
  if (!p || p.is_service || p.track_serial) return;
  await t(
    `INSERT INTO product_stock (product_id, warehouse_id, qty) VALUES ($1,$2,$3)
     ON CONFLICT (product_id, warehouse_id) DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty`,
    [m.productId, wh, m.qty],
  );
  await t("UPDATE products SET stock_qty = stock_qty + $1, updated_at = now() WHERE id=$2", [m.qty, m.productId]);
  await t("INSERT INTO stock_moves (product_id, warehouse_id, qty, type, reason, ref, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    m.productId, wh, m.qty, m.type, m.reason ?? "", m.ref ?? "", m.userId ?? null,
  ]);
}

/** IMEI / serial units: record one unit coming in (+1) or going out (−1). */
export async function moveUnit(t: Exec, m: Move & { unitId: number }) {
  const [u] = await t<{ product_id: number; warehouse_id: number | null }>("SELECT product_id, warehouse_id FROM units WHERE id=$1", [m.unitId]);
  if (!u) return;
  let wh = m.warehouseId || u.warehouse_id;
  if (!wh) {
    wh = await defaultWarehouseId(t);
    await t("UPDATE units SET warehouse_id=$2 WHERE id=$1", [m.unitId, wh]);
  }
  await t("INSERT INTO stock_moves (product_id, warehouse_id, unit_id, qty, type, reason, ref, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    u.product_id, wh, m.unitId, m.qty, m.type, m.reason ?? "", m.ref ?? "", m.userId ?? null,
  ]);
}

/** SQL: quantity of product p in warehouse w (works for both kinds of product). */
export const WH_STOCK_SQL = (p: string, w: string) => `CASE WHEN ${p}.is_service THEN NULL WHEN ${p}.track_serial
  THEN (SELECT count(*)::int FROM units u WHERE u.product_id = ${p}.id AND u.status = 'in_stock' AND u.warehouse_id = ${w})
  ELSE COALESCE((SELECT ps.qty FROM product_stock ps WHERE ps.product_id = ${p}.id AND ps.warehouse_id = ${w}), 0) END`;

/** Batch-tracked products: take stock out of the batch that expires first (FEFO), or put it back. */
export async function moveBatches(t: Exec, productId: number, qty: number) {
  const [p] = await t<{ track_batch: boolean }>("SELECT track_batch FROM products WHERE id=$1", [productId]);
  if (!p?.track_batch || !qty) return;
  if (qty > 0) {
    await t("UPDATE batches SET qty = qty + $2 WHERE id = (SELECT id FROM batches WHERE product_id=$1 ORDER BY expiry_date DESC NULLS FIRST, id DESC LIMIT 1)", [productId, qty]);
    return;
  }
  let need = -qty;
  for (const b of await t<{ id: number; qty: number }>("SELECT id, qty FROM batches WHERE product_id=$1 AND qty > 0 ORDER BY expiry_date NULLS LAST, id", [productId])) {
    if (need <= 0) break;
    const take = Math.min(need, b.qty);
    await t("UPDATE batches SET qty = qty - $2 WHERE id=$1", [b.id, take]);
    need -= take;
  }
}
