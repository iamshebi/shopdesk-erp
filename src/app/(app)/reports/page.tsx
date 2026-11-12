import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { num, methodLabel } from "@/lib/util";
import { PageHeader, Stat } from "@/components/ui";
import ReportTabs, { monthRange } from "@/components/report-tabs";

const D = `(s.date AT TIME ZONE 'Asia/Dubai')::date`;
const SIGN = `CASE WHEN s.type='invoice' THEN 1 ELSE -1 END`;

export default async function SalesReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("reports");
  const sp = await searchParams;
  const s = await getSettings();
  const { from, to } = monthRange(sp);
  const P = [from, to];
  const tot = await one<any>(
    `SELECT COALESCE(sum(total) FILTER (WHERE type='invoice'),0) gross, COALESCE(sum(total) FILTER (WHERE type='credit_note'),0) returns,
            COALESCE(sum(${SIGN} * vat),0) vat, COALESCE(sum(${SIGN} * subtotal),0) net, COALESCE(sum(${SIGN} * cost),0) cost,
            COALESCE(sum(discount) FILTER (WHERE type='invoice'),0) discount, count(*) FILTER (WHERE type='invoice')::int n
     FROM sales s WHERE ${D} BETWEEN $1 AND $2`, P);
  const exp = await one<{ v: number }>("SELECT COALESCE(sum(amount),0) v FROM expenses WHERE date BETWEEN $1 AND $2", P);
  const gp = tot.net - tot.cost;
  const np = gp - (exp?.v ?? 0);
  const byCat = await q<any>(
    `SELECT COALESCE(NULLIF(p.category,''), CASE WHEN si.product_id IS NULL THEN 'Repairs & services' ELSE 'Uncategorised' END) cat,
            sum(${SIGN} * si.qty)::int qty, sum(${SIGN} * si.net) net, sum(${SIGN} * (si.net - si.cost)) profit
     FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id
     WHERE ${D} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`, P);
  const byMethod = await q<any>(
    `SELECT pm.method, sum(CASE WHEN s.type='invoice' THEN pm.amount ELSE -pm.amount END) v
     FROM payments pm JOIN sales s ON s.id = pm.sale_id WHERE (pm.created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, P);
  const byStaff = await q<any>(
    `SELECT u.name, count(*) FILTER (WHERE s.type='invoice')::int n, sum(${SIGN} * s.total) v FROM sales s LEFT JOIN users u ON u.id=s.created_by
     WHERE ${D} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`, P);
  const top = await q<any>(
    `SELECT si.product_id, si.description, sum(${SIGN} * si.qty)::int qty, sum(${SIGN} * si.total) total, sum(${SIGN} * (si.net - si.cost)) profit
     FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${D} BETWEEN $1 AND $2 AND si.product_id IS NOT NULL
     GROUP BY 1,2 ORDER BY 4 DESC LIMIT 15`, P);
  const recv = await one<{ v: number }>(`SELECT COALESCE(sum(GREATEST(${OUTSTANDING_SQL},0)),0) v FROM sales s WHERE s.type='invoice'`);
  const pay = await one<{ v: number }>("SELECT COALESCE(sum(total - paid),0) v FROM purchases");
  const buy = await one<{ v: number; n: number }>("SELECT COALESCE(sum(price_paid),0) v, count(*)::int n FROM buybacks WHERE (created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2", P);

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${from} to ${to}`} />
      <ReportTabs active="/reports" from={from} to={to} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net sales (incl. VAT)" value={`${s.currency} ${num(tot.gross - tot.returns)}`} hint={`${tot.n} invoices · returns ${num(tot.returns)}`} />
        <Stat label="Gross profit" value={`${s.currency} ${num(gp)}`} hint={`margin ${tot.net ? ((gp / tot.net) * 100).toFixed(1) : "0"}% · VAT excluded`} />
        <Stat label="Expenses" value={`${s.currency} ${num(exp?.v)}`} hint="excl. VAT" href="/expenses" />
        <Stat label="Net profit" value={`${s.currency} ${num(np)}`} hint="gross profit − expenses" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Customers owe you" value={num(recv?.v)} href="/customers?due=1" />
        <Stat label="You owe suppliers" value={num(pay?.v)} href="/suppliers" />
        <Stat label="Used devices bought" value={num(buy?.v)} hint={`${buy?.n ?? 0} devices`} href="/buyback" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">By category</div>
          <table className="tbl"><thead><tr><th>Category</th><th className="text-right">Qty</th><th className="text-right">Sales (excl. VAT)</th><th className="text-right">Profit</th></tr></thead>
            <tbody>{byCat.map((c) => <tr key={c.cat}><td>{c.cat}</td><td className="text-right">{c.qty}</td><td className="text-right tabular-nums">{num(c.net)}</td><td className="text-right tabular-nums">{num(c.profit)}</td></tr>)}</tbody></table>
        </div>
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 font-semibold">Money received by method</div>
            {byMethod.map((m) => <div key={m.method} className="flex justify-between py-1 text-sm"><span>{methodLabel(m.method)}</span><span className="tabular-nums">{num(m.v)}</span></div>)}
            {byMethod.length === 0 && <p className="text-sm text-slate-400">Nothing yet.</p>}
          </div>
          <div className="card p-5">
            <div className="mb-3 font-semibold">By staff</div>
            {byStaff.map((m, i) => <div key={i} className="flex justify-between py-1 text-sm"><span>{m.name ?? "—"} <span className="text-slate-400">({m.n})</span></span><span className="tabular-nums">{num(m.v)}</span></div>)}
          </div>
        </div>
        <div className="card overflow-x-auto xl:col-span-2">
          <div className="p-5 pb-2 font-semibold">Top products</div>
          <table className="tbl"><thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
            <tbody>{top.map((t) => <tr key={t.product_id}><td><Link href={`/products/${t.product_id}`} className="hover:text-accent">{t.description}</Link></td><td className="text-right">{t.qty}</td><td className="text-right tabular-nums">{num(t.total)}</td><td className="text-right tabular-nums">{num(t.profit)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
