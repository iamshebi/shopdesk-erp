import type { Exec } from "./db";

/** Store credit = refunds given as credit (on credit notes) minus credit spent (on invoices). */
export async function storeCreditBalance(t: Exec, customerId: number) {
  const [r] = await t<{ b: number }>(
    `SELECT COALESCE(sum(CASE WHEN s.type='credit_note' THEN p.amount ELSE -p.amount END),0)::float b
     FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.method='store_credit' AND s.customer_id=$1`,
    [customerId],
  );
  return Math.round(r.b * 100) / 100;
}
