import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { STOCK_SQL } from "@/lib/stock";
import { num, fmtDate, todayDubai, repairLabel } from "@/lib/util";
import { PageHeader, Stat, Badge, repairTone } from "@/components/ui";
import Bars from "@/components/bars";
import { ShoppingCart, Wrench, Recycle } from "lucide-react";

const D = `(s.date AT TIME ZONE 'Asia/Dubai')::date`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayDubai();
  const month = today.slice(0, 8) + "01";
  const showMoney = can(user, "dashboard.money");
  const showProfit = can(user, "dashboard.money") && can(user, "products.cost");

  const sum = (from: string, to: string) =>
    one<{ sales: number; profit: number; n: number }>(
      `SELECT COALESCE(sum(CASE WHEN type='invoice' THEN total ELSE -total END),0) sales,
              COALESCE(sum(CASE WHEN type='invoice' THEN subtotal - cost ELSE -(subtotal - cost) END),0) profit,
              count(*) FILTER (WHERE type='invoice')::int n
       FROM sales s WHERE ${D} BETWEEN $1 AND $2`,
      [from, to],
    );
  const [t, m] = await Promise.all([sum(today, today), sum(month, today)]);
  const days = await q<{ d: string; v: number }>(
    `SELECT to_char(g.d, 'YYYY-MM-DD') d, COALESCE(sum(CASE WHEN s.type='invoice' THEN s.total ELSE -s.total END),0) v
     FROM generate_series($1::date - 13, $1::date, '1 day') g(d)
     LEFT JOIN sales s ON ${D} = g.d::date GROUP BY g.d ORDER BY g.d`,
    [today],
  );
  const repairs = await q<any>("SELECT id, number, device, customer_name, status, promised_at FROM repairs WHERE status NOT IN ('delivered','cancelled') ORDER BY (status='ready') DESC, promised_at NULLS LAST LIMIT 6");
  const repairCount = await one<{ open: number; ready: number }>("SELECT count(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))::int open, count(*) FILTER (WHERE status='ready')::int ready FROM repairs");
  const low = await q<any>(`SELECT * FROM (SELECT p.id, p.name, p.reorder_level, ${STOCK_SQL} stock FROM products p WHERE p.active AND NOT p.is_service) x WHERE reorder_level > 0 AND stock <= reorder_level ORDER BY stock LIMIT 6`);
  const owed = await one<{ v: number }>(`SELECT COALESCE(sum(GREATEST(${OUTSTANDING_SQL},0)),0) v FROM sales s WHERE s.type='invoice'`);
  const recent = await q<any>("SELECT id, number, type, customer_name, total, date FROM sales ORDER BY id DESC LIMIT 6");
  const top = await q<any>(
    `SELECT si.description, sum(si.qty)::int qty, sum(si.total) total FROM sale_items si JOIN sales s ON s.id=si.sale_id
     WHERE s.type='invoice' AND ${D} >= $1 AND si.product_id IS NOT NULL GROUP BY 1 ORDER BY 3 DESC LIMIT 5`,
    [month],
  );
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHeader title={`${greet}, ${user.name.split(" ")[0]}`} subtitle={fmtDate(today)}>
        {can(user, "pos") && <Link href="/pos" className="btn-primary"><ShoppingCart size={16} /> New sale</Link>}
        {can(user, "repairs") && <Link href="/repairs/new" className="btn-ghost"><Wrench size={16} /> Job card</Link>}
        {can(user, "buyback") && <Link href="/buyback/new" className="btn-ghost"><Recycle size={16} /> Buy used</Link>}
      </PageHeader>
      {sp.denied && <div className="card mb-4 bg-amber-50 p-3 text-sm text-amber-800">Your account doesn&apos;t have access to that page.</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showMoney && <Stat label="Today's sales" value={`${s.currency} ${num(t?.sales)}`} hint={`${t?.n ?? 0} invoices${showProfit ? ` · profit ${num(t?.profit)}` : ""}`} href="/reports/day" />}
        {showProfit && <Stat label="This month" value={`${s.currency} ${num(m?.sales)}`} hint={`profit ${num(m?.profit)}`} href="/reports" />}
        <Stat label="Open repairs" value={String(repairCount?.open ?? 0)} hint={`${repairCount?.ready ?? 0} ready for pickup`} href="/repairs" />
        {showMoney && <Stat label="Customers owe" value={`${s.currency} ${num(owed?.v)}`} hint="unpaid invoices" href="/customers?due=1" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {showMoney && (
          <div className="card p-6 xl:col-span-2">
            <div className="mb-4 flex items-baseline justify-between"><h2 className="font-semibold">Sales · last 14 days</h2><span className="text-xs text-slate-400">{s.currency}</span></div>
            <Bars data={days.map((d) => ({ label: d.d.slice(8), value: d.v }))} />
          </div>
        )}
        <div className="card p-6">
          <h2 className="mb-3 font-semibold">Repairs in progress</h2>
          {repairs.length === 0 ? <p className="text-sm text-slate-400">No open jobs.</p> : (
            <ul className="space-y-2.5">
              {repairs.map((r) => (
                <li key={r.id}><Link href={`/repairs/${r.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-accent">
                  <span className="min-w-0"><span className="font-medium">{r.device}</span><span className="block truncate text-xs text-slate-400">{r.number} · {r.customer_name}</span></span>
                  <Badge tone={repairTone(r.status)}>{repairLabel(r.status)}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        {showMoney && (
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Recent invoices</h2>
            <ul className="space-y-2.5 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex justify-between"><Link href={`/sales/${r.id}`} className="hover:text-accent">{r.number} <span className="text-slate-400">{r.customer_name}</span></Link>
                  <span className={`tabular-nums ${r.type === "credit_note" ? "text-red-600" : ""}`}>{r.type === "credit_note" ? "−" : ""}{num(r.total)}</span></li>
              ))}
              {recent.length === 0 && <li className="text-slate-400">No sales yet — make the first one!</li>}
            </ul>
          </div>
        )}
        {showMoney && <div className="card p-6">
          <h2 className="mb-3 font-semibold">Top sellers this month</h2>
          <ul className="space-y-2.5 text-sm">
            {top.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.description}</span><span className="shrink-0 text-slate-500">{p.qty} sold</span></li>)}
            {top.length === 0 && <li className="text-slate-400">Nothing sold yet this month.</li>}
          </ul>
        </div>}
        {showMoney && <div className="card p-6">
          <h2 className="mb-3 font-semibold">Low stock</h2>
          <ul className="space-y-2.5 text-sm">
            {low.map((p) => <li key={p.id} className="flex justify-between gap-2"><Link href={`/products/${p.id}`} className="truncate hover:text-accent">{p.name}</Link><Badge tone={p.stock <= 0 ? "red" : "amber"}>{p.stock}</Badge></li>)}
            {low.length === 0 && <li className="text-slate-400">All good. Set a low-stock alert level on products to track them here.</li>}
          </ul>
        </div>}
      </div>
    </div>
  );
}
