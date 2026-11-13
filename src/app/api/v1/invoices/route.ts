import { q } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { OUTSTANDING_SQL } from "@/lib/sales";

export async function GET(req: Request) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? "2000-01-01", to = u.searchParams.get("to") ?? "2999-12-31";
  const rows = await q(`SELECT s.id, s.number, s.type, s.date, s.customer_name, s.customer_phone, s.subtotal, s.discount, s.vat, s.total, s.paid, ${OUTSTANDING_SQL} outstanding
    FROM sales s WHERE (s.date AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1::date AND $2::date ORDER BY s.id DESC LIMIT 1000`, [from, to]);
  return Response.json({ data: rows });
}
