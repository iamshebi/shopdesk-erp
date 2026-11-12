import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";
import { num } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import ReportTabs from "@/components/report-tabs";

export default async function StockReport() {
  await requireUser("reports");
  const VALUE = `CASE WHEN p.track_serial THEN (SELECT COALESCE(sum(u.cost),0) FROM units u WHERE u.product_id=p.id AND u.status='in_stock') ELSE GREATEST(p.stock_qty,0) * p.cost END`;
  const RETAIL = `CASE WHEN p.track_serial THEN (SELECT COALESCE(sum(COALESCE(u.price, p.price)),0) FROM units u WHERE u.product_id=p.id AND u.status='in_stock') ELSE GREATEST(p.stock_qty,0) * p.price END`;
  const cats = await q<any>(
    `SELECT COALESCE(NULLIF(p.category,''),'Uncategorised') cat, count(*)::int products, sum(GREATEST(${STOCK_SQL},0))::int qty, sum(${VALUE}) value, sum(${RETAIL}) retail
     FROM products p WHERE p.active AND NOT p.is_service GROUP BY 1 ORDER BY 4 DESC`,
  );
  const dead = await q<any>(
    `SELECT * FROM (SELECT p.id, p.name, ${STOCK_SQL} stock, ${VALUE} value,
       (SELECT max(s.date) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.type='invoice') last_sold
     FROM products p WHERE p.active AND NOT p.is_service) x
     WHERE stock > 0 AND (last_sold IS NULL OR last_sold < now() - interval '90 days') ORDER BY value DESC LIMIT 30`,
  );
  const negative = await q<any>("SELECT id, name, stock_qty FROM products WHERE active AND NOT track_serial AND NOT is_service AND stock_qty < 0 ORDER BY stock_qty LIMIT 30");
  const total = cats.reduce((a, c) => ({ value: a.value + c.value, retail: a.retail + c.retail, qty: a.qty + c.qty }), { value: 0, retail: 0, qty: 0 });
  return (
    <div>
      <PageHeader title="Stock report" subtitle={`${total.qty} units · cost ${num(total.value)} · retail ${num(total.retail)}`} />
      <ReportTabs active="/reports/stock" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Category</th><th className="text-right">Products</th><th className="text-right">Units</th><th className="text-right">Value at cost</th><th className="text-right">Value at retail</th><th className="text-right">Potential profit</th></tr></thead>
          <tbody>{cats.map((c) => <tr key={c.cat}><td><Link href={`/products?cat=${encodeURIComponent(c.cat === "Uncategorised" ? "" : c.cat)}`} className="hover:text-accent">{c.cat}</Link></td><td className="text-right">{c.products}</td><td className="text-right">{c.qty}</td><td className="text-right tabular-nums">{num(c.value)}</td><td className="text-right tabular-nums">{num(c.retail)}</td><td className="text-right tabular-nums">{num(c.retail - c.value)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">Slow stock — not sold in 90 days</div>
          <table className="tbl"><tbody>{dead.map((d) => <tr key={d.id}><td><Link href={`/products/${d.id}`} className="hover:text-accent">{d.name}</Link></td><td className="text-right">{d.stock}</td><td className="text-right tabular-nums">{num(d.value)}</td></tr>)}
            {dead.length === 0 && <tr><td className="text-slate-400">Nothing slow-moving.</td></tr>}</tbody></table>
        </div>
        <div className="card overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">Negative stock — sold before it was entered</div>
          <table className="tbl"><tbody>{negative.map((d) => <tr key={d.id}><td><Link href={`/products/${d.id}`} className="hover:text-accent">{d.name}</Link></td><td className="text-right text-red-600">{d.stock_qty}</td></tr>)}
            {negative.length === 0 && <tr><td className="text-slate-400">None — stock is clean.</td></tr>}</tbody></table>
        </div>
      </div>
    </div>
  );
}
