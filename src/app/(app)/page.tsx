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

  // Period filter with comparison to the period just before it.
  const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const period = sp.period || "month";
  let from = month, to = today;
  if (period === "today") from = today;
  else if (period === "week") from = addDays(today, -6);
  else if (period === "year") from = today.slice(0, 4) + "-01-01";
  else if (period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "")) { from = sp.from; to = sp.to < sp.from ? sp.from : sp.to; }
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const prevTo = addDays(from, -1), prevFrom = addDays(from, -len);

  const sum = (f: string, t2: string) =>
    one<{ sales: number; profit: number; n: number }>(
      `SELECT COALESCE(sum(CASE WHEN type='invoice' THEN total ELSE -total END),0) sales,
              COALESCE(sum(CASE WHEN type='invoice' THEN subtotal - cost ELSE -(subtotal - cost) END),0) profit,
              count(*) FILTER (WHERE type='invoice')::int n
       FROM sales s WHERE ${D} BETWEEN $1 AND $2`,
      [f, t2],
    );
  const exp = (f: string, t2: string) => one<{ v: number }>("SELECT COALESCE(sum(amount),0) v FROM expenses WHERE date BETWEEN $1 AND $2", [f, t2]);
  const [t, prev, e, ePrev] = await Promise.all([sum(from, to), sum(prevFrom, prevTo), exp(from, to), exp(prevFrom, prevTo)]);
  const byMonth = len > 62;
  const days = await q<{ d: string; v: number }>(
    byMonth
      ? `SELECT to_char(g.d, 'Mon YY') d, COALESCE(sum(CASE WHEN s.type='invoice' THEN s.total ELSE -s.total END),0) v
         FROM generate_series(date_trunc('month', $1::date), $2::date, '1 month') g(d)
         LEFT JOIN sales s ON date_trunc('month', ${D}) = g.d AND ${D} BETWEEN $1 AND $2 GROUP BY g.d ORDER BY g.d`
      : `SELECT to_char(g.d, 'DD Mon') d, COALESCE(sum(CASE WHEN s.type='invoice' THEN s.total ELSE -s.total END),0) v
         FROM generate_series($1::date, $2::date, '1 day') g(d)
         LEFT JOIN sales s ON ${D} = g.d::date GROUP BY g.d ORDER BY g.d`,
    [from, to],
  );
  const biz = await one<any>(
    `SELECT (SELECT count(*)::int FROM products WHERE active) products,
            (SELECT count(DISTINCT NULLIF(category,''))::int FROM products WHERE active) categories,
            (SELECT count(DISTINCT NULLIF(brand,''))::int FROM products WHERE active) brands,
            (SELECT count(*)::int FROM customers) customers,
            (SELECT count(*)::int FROM customers WHERE (created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2) new_customers,
            (SELECT COALESCE(sum(cost),0) FROM units WHERE status='in_stock') + (SELECT COALESCE(sum(GREATEST(stock_qty,0) * cost),0) FROM products WHERE active AND NOT track_serial AND NOT is_service) stock_value,
            (SELECT count(*)::int FROM (SELECT ${STOCK_SQL} st FROM products p WHERE p.active AND NOT p.is_service) x WHERE st <= 0) out_of_stock`,
    [from, to],
  );
  const ord = await one<any>(`SELECT count(*) FILTER (WHERE status IN ('draft','confirmed','packed','shipped'))::int pending, count(*) FILTER (WHERE status='delivered' AND (updated_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2)::int done FROM orders WHERE kind='order'`, [from, to]);
  const pct = (a: number, b: number) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(0)}% vs previous` : a ? "▲ new this period" : "no change");
  const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "This month"], ["year", "This year"]];
  const repairs = await q<any>("SELECT id, number, device, customer_name, status, promised_at FROM repairs WHERE status NOT IN ('delivered','cancelled') ORDER BY (status='ready') DESC, promised_at NULLS LAST LIMIT 6");
  const repairCount = await one<{ open: number; ready: number }>("SELECT count(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))::int open, count(*) FILTER (WHERE status='ready')::int ready FROM repairs");
  const low = await q<any>(`SELECT * FROM (SELECT p.id, p.name, p.reorder_level, ${STOCK_SQL} stock FROM products p WHERE p.active AND NOT p.is_service) x WHERE reorder_level > 0 AND stock <= reorder_level ORDER BY stock LIMIT 6`);
  const owed = await one<{ v: number }>(`SELECT COALESCE(sum(GREATEST(${OUTSTANDING_SQL},0)),0) v FROM sales s WHERE s.type='invoice'`);
  const recent = await q<any>("SELECT id, number, type, customer_name, total, date FROM sales ORDER BY id DESC LIMIT 6");
  const top = await q<any>(
    `SELECT si.description, sum(si.qty)::int qty, sum(si.total) total FROM sale_items si JOIN sales s ON s.id=si.sale_id
     WHERE s.type='invoice' AND ${D} BETWEEN $1 AND $2 AND si.product_id IS NOT NULL GROUP BY 1 ORDER BY 3 DESC LIMIT 5`,
    [from, to],
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

      {showMoney && (
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {PERIODS.map(([id, label]) => (
              <Link key={id} href={`/?period=${id}`} className={`rounded-lg px-3 py-1.5 text-sm ${period === id ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{label}</Link>
            ))}
          </div>
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" defaultValue={from} className="input h-9 w-40" />
          <input type="date" name="to" defaultValue={to} className="input h-9 w-40" />
          <button className="btn-ghost btn-sm h-9">Apply</button>
          <span className="text-xs text-slate-400">{fmtDate(from)} to {fmtDate(to)}, compared with {fmtDate(prevFrom)} to {fmtDate(prevTo)}</span>
        </form>
      )}

      {showMoney && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Sales" value={`${s.currency} ${num(t?.sales)}`} hint={pct(t?.sales ?? 0, prev?.sales ?? 0)} href="/sales" />
          <Stat label="Invoices" value={String(t?.n ?? 0)} hint={`average ${num((t?.sales ?? 0) / Math.max(1, t?.n ?? 0))} · ${pct(t?.n ?? 0, prev?.n ?? 0)}`} href="/sales" />
          {showProfit && <Stat label="Gross profit" value={`${s.currency} ${num(t?.profit)}`} hint={pct(t?.profit ?? 0, prev?.profit ?? 0)} href="/reports" />}
          {showProfit && <Stat label="Net profit (after expenses)" value={`${s.currency} ${num((t?.profit ?? 0) - (e?.v ?? 0))}`} hint={`expenses ${num(e?.v)} · ${pct((t?.profit ?? 0) - (e?.v ?? 0), (prev?.profit ?? 0) - (ePrev?.v ?? 0))}`} href="/expenses" />}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Products" value={String(biz.products)} hint={`${biz.categories} categories · ${biz.brands} brands · ${biz.out_of_stock} out of stock`} href="/products" />
        <Stat label="Customers" value={String(biz.customers)} hint={`${biz.new_customers} new in this period`} href="/customers" />
        <Stat label="Orders pending" value={String(ord?.pending ?? 0)} hint={`${ord?.done ?? 0} delivered in this period`} href="/orders?status=open" />
        {showProfit ? <Stat label="Stock value (at cost)" value={`${s.currency} ${num(biz.stock_value)}`} hint="everything in stock now" href="/reports/stock" /> : <Stat label="Open repairs" value={String(repairCount?.open ?? 0)} hint={`${repairCount?.ready ?? 0} ready for pickup`} href="/repairs" />}
        {showMoney ? <Stat label="Customers owe" value={`${s.currency} ${num(owed?.v)}`} hint={`unpaid invoices · ${repairCount?.open ?? 0} open repairs`} href="/customers?due=1" /> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {showMoney && (
          <div className="card p-6 xl:col-span-2">
            <div className="mb-4 flex items-baseline justify-between"><h2 className="font-semibold">Sales by {byMonth ? "month" : "day"}</h2><span className="text-xs text-slate-400">{s.currency}</span></div>
            <Bars data={days.map((d) => ({ label: d.d, value: Number(d.v) }))} />
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
          <h2 className="mb-3 font-semibold">Top sellers in this period</h2>
          <ul className="space-y-2.5 text-sm">
            {top.map((p, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.description}</span><span className="shrink-0 text-slate-500">{p.qty} sold</span></li>)}
            {top.length === 0 && <li className="text-slate-400">Nothing sold in this period.</li>}
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
