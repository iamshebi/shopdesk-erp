import { OUTSTANDING_SQL } from "./sales";

export const SEGMENTS: Record<string, { label: string; where: string }> = {
  all: { label: "All customers", where: "TRUE" },
  vip: { label: "Top spenders (VIP)", where: "spent >= (SELECT COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY t),0) FROM (SELECT sum(total) t FROM sales WHERE type='invoice' AND customer_id IS NOT NULL GROUP BY customer_id) z) AND spent > 0" },
  repeat: { label: "Repeat buyers (3+ invoices)", where: "invoices >= 3" },
  new: { label: "New (first buy in last 30 days)", where: "first_buy >= now() - interval '30 days'" },
  sleeping: { label: "Sleeping (no buy in 90 days)", where: "last_buy < now() - interval '90 days'" },
  never: { label: "Never bought", where: "invoices = 0" },
  owes: { label: "Owe money", where: "owes > 0.004" },
};
export const SEGMENT_BASE = `SELECT c.*, COALESCE((SELECT sum(CASE WHEN s.type='invoice' THEN s.total ELSE -s.total END) FROM sales s WHERE s.customer_id=c.id),0) spent,
      (SELECT count(*) FROM sales s WHERE s.customer_id=c.id AND s.type='invoice')::int invoices,
      (SELECT min(s.date) FROM sales s WHERE s.customer_id=c.id) first_buy, (SELECT max(s.date) FROM sales s WHERE s.customer_id=c.id) last_buy,
      COALESCE((SELECT sum(${OUTSTANDING_SQL}) FROM sales s WHERE s.customer_id=c.id AND s.type='invoice'),0) owes
    FROM customers c`;
