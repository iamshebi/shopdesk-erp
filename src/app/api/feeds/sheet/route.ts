import crypto from "node:crypto";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { OUTSTANDING_SQL } from "@/lib/sales";

const FEEDS: Record<string, string> = {
  products: `SELECT p.sku, p.name, p.brand, p.category, p.price, p.cost, ${STOCK_SQL} AS stock, p.status FROM products p WHERE p.active ORDER BY p.name`,
  sales: `SELECT s.number, to_char(s.date AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD') date, s.type, s.customer_name, s.total, s.vat, s.paid, ${OUTSTANDING_SQL} AS due FROM sales s ORDER BY s.id DESC LIMIT 5000`,
  customers: `SELECT c.name, c.phone, c.email, c.group_name, c.tags FROM customers c ORDER BY c.name`,
  orders: `SELECT number, kind, status, customer_name, customer_phone, total, source, to_char(created_at AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD') date FROM orders ORDER BY id DESC LIMIT 5000`,
  expenses: `SELECT to_char(date,'YYYY-MM-DD') date, category, description, amount, vat, total, method FROM expenses WHERE status='approved' ORDER BY date DESC LIMIT 5000`,
  stock: `SELECT p.sku, p.name, w.name warehouse, ps.qty, ps.location FROM product_stock ps JOIN products p ON p.id=ps.product_id JOIN warehouses w ON w.id=ps.warehouse_id WHERE ps.qty <> 0 ORDER BY p.name`,
};

/** CSV for Google Sheets / Excel: =IMPORTDATA("…/api/feeds/sheet?ds=sales&token=…"). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const s = await getSettings();
  const token = u.searchParams.get("token") ?? "";
  if (!s.sheet_token || token.length !== s.sheet_token.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(s.sheet_token))) return new Response("Invalid link", { status: 401 });
  const sql = FEEDS[u.searchParams.get("ds") ?? ""];
  if (!sql) return new Response(`Use ds=${Object.keys(FEEDS).join("|")}`, { status: 400 });
  const rows = await q<any>(sql);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => { const v = r[c] instanceof Date ? r[c].toISOString() : String(r[c] ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
}
