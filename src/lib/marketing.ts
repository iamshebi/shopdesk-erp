import "server-only";
import type { Exec } from "./db";
import type { ShopSettings } from "./settings";
import { r2 } from "./util";

export class CouponError extends Error {}

/** Checks a coupon against a cart amount (before coupon). Returns the discount it gives. */
export async function checkCoupon(t: Exec, code: string, gross: number, customerId: number | null) {
  const [c] = await t<any>(
    `SELECT *, (starts_on IS NULL OR starts_on <= (now() AT TIME ZONE 'Asia/Dubai')::date) started, (ends_on IS NULL OR ends_on >= (now() AT TIME ZONE 'Asia/Dubai')::date) not_ended
     FROM coupons WHERE upper(code)=upper($1)`,
    [code.trim()],
  );
  if (!c || !c.active) throw new CouponError("Coupon code not found");
  if (!c.started) throw new CouponError("This coupon has not started yet");
  if (!c.not_ended) throw new CouponError("This coupon has expired");
  if (c.max_uses > 0 && c.uses >= c.max_uses) throw new CouponError("This coupon has been fully used");
  if (c.customer_id && c.customer_id !== customerId) throw new CouponError("This voucher belongs to another customer");
  if (gross + 0.004 < Number(c.min_total)) throw new CouponError(`Minimum spend for this coupon is ${Number(c.min_total).toFixed(2)}`);
  const discount = r2(Math.min(gross, c.type === "percent" ? (gross * Number(c.value)) / 100 : Number(c.value)));
  return { id: c.id as number, code: c.code as string, discount, label: c.type === "percent" ? `${Number(c.value)}% off` : `${Number(c.value).toFixed(2)} off` };
}

export async function loyaltyBalance(t: Exec, customerId: number) {
  const [r] = await t<{ p: number }>("SELECT COALESCE(sum(points),0)::int p FROM loyalty_ledger WHERE customer_id=$1", [customerId]);
  return r.p;
}

/** Points earned on an invoice: floor(total × points per currency unit). */
export async function earnPoints(t: Exec, s: ShopSettings, saleId: number, customerId: number | null, total: number, number: string) {
  const rate = Number(s.loyalty_points_per_unit) || 0;
  if (!customerId) return 0;
  const pts = rate > 0 ? Math.floor(total * rate) : 0;
  const refPts = Math.round(Number(s.referral_points) || 0);
  if (refPts > 0) {
    const [c] = await t<{ referred_by: number | null; n: number }>("SELECT referred_by, (SELECT count(*)::int FROM sales WHERE customer_id=$1 AND type='invoice') n FROM customers WHERE id=$1", [customerId]);
    if (c?.referred_by && c.n === 1) await t("INSERT INTO loyalty_ledger (customer_id, points, sale_id, note) VALUES ($1,$2,$3,$4)", [c.referred_by, refPts, saleId, `Referral reward (${number})`]);
  }
  if (pts > 0) await t("INSERT INTO loyalty_ledger (customer_id, points, sale_id, note) VALUES ($1,$2,$3,$4)", [customerId, pts, saleId, `Earned on ${number}`]);
  return pts;
}
