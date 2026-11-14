import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, todayDubai } from "@/lib/util";
import { PageHeader, Stat } from "@/components/ui";
import ReportTabs from "@/components/report-tabs";
import PrintButton from "@/components/print-button";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("reports");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayDubai();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : today.slice(0, 8) + "01", to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const P = [from, to];
  const D = (c: string) => `(${c} AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1::date AND $2::date`;
  const staff = await q<any>(`SELECT u.id, u.name,
      (SELECT COALESCE(sum(CASE WHEN type='invoice' THEN total ELSE -total END),0) FROM sales x WHERE COALESCE(x.sales_rep_id, x.created_by)=u.id AND ${D("x.date")}) sales,
      (SELECT count(*)::int FROM sales x WHERE COALESCE(x.sales_rep_id, x.created_by)=u.id AND x.type='invoice' AND ${D("x.date")}) invoices,
      (SELECT count(*)::int FROM orders o WHERE o.created_by=u.id AND ${D("o.created_at")}) orders,
      (SELECT count(*)::int FROM tasks t WHERE t.assignee_id=u.id AND t.status='done' AND ${D("t.done_at")}) tasks,
      (SELECT count(*)::int FROM tickets t WHERE t.assignee_id=u.id AND ${D("t.resolved_at")}) tickets,
      (SELECT count(*)::int FROM leads l WHERE l.owner_id=u.id AND l.stage='won' AND ${D("l.updated_at")}) leads_won,
      (SELECT count(*)::int FROM activity a WHERE a.user_id=u.id AND ${D("a.created_at")}) actions
    FROM users u WHERE u.active ORDER BY sales DESC`, P);
  const sup = await one<any>(`SELECT count(*)::int opened, count(*) FILTER (WHERE resolved_at IS NOT NULL)::int resolved, COALESCE(round(avg(extract(epoch FROM resolved_at - created_at)/3600) FILTER (WHERE resolved_at IS NOT NULL))::int,0) avg_h,
      count(*) FILTER (WHERE status IN ('open','pending'))::int still_open FROM tickets t WHERE ${D("t.created_at")}`, P);
  const supCat = await q<any>(`SELECT category, count(*)::int n FROM tickets t WHERE ${D("t.created_at")} GROUP BY 1 ORDER BY 2 DESC`, P);
  const ship = await one<any>(`SELECT count(*)::int total, count(*) FILTER (WHERE status='delivered')::int delivered, count(*) FILTER (WHERE status IN ('failed','returned'))::int failed, COALESCE(sum(cost),0) cost,
      COALESCE(round(avg(extract(epoch FROM delivered_at - shipped_at)/86400.0) FILTER (WHERE delivered_at IS NOT NULL AND shipped_at IS NOT NULL), 1),0) days, COALESCE(sum(cod_amount) FILTER (WHERE cod_collected),0) cod FROM shipments sh WHERE ${D("sh.created_at")}`, P);
  const byCourier = await q<any>(`SELECT COALESCE(NULLIF(courier,''),'—') courier, count(*)::int n, count(*) FILTER (WHERE status='delivered')::int ok, COALESCE(sum(cost),0) cost FROM shipments sh WHERE ${D("sh.created_at")} GROUP BY 1 ORDER BY 2 DESC`, P);
  const web = await one<any>(`SELECT count(*)::int orders, COALESCE(sum(total),0) value, count(*) FILTER (WHERE status='cancelled')::int cancelled, count(*) FILTER (WHERE sale_id IS NOT NULL)::int invoiced,
      (SELECT count(*)::int FROM web_carts c WHERE ${D("c.created_at")}) carts, (SELECT count(*)::int FROM web_carts c WHERE c.status='ordered' AND ${D("c.created_at")}) carts_done FROM orders o WHERE o.source='website' AND ${D("o.created_at")}`, P);
  const src = await q<any>(`SELECT source, count(*)::int n, COALESCE(sum(total),0) v FROM orders o WHERE kind='order' AND ${D("o.created_at")} GROUP BY 1 ORDER BY 3 DESC`, P);
  return (
    <div>
      <PageHeader title="Reports" subtitle={`Team, support, delivery and website results · ${from} to ${to}`}><span className="no-print"><PrintButton /></span></PageHeader>
      <div className="no-print"><ReportTabs active="/reports/performance" /></div>
      <form className="no-print mb-6 flex flex-wrap gap-2"><input type="date" name="from" defaultValue={from} className="input w-44" /><input type="date" name="to" defaultValue={to} className="input w-44" /><button className="btn-dark">Show</button></form>
      <div className="card mb-6 overflow-x-auto"><div className="p-5 pb-2 font-semibold">Employee performance</div>
        <table className="tbl"><thead><tr><th>Staff</th><th className="text-right">Sales ({s.currency})</th><th className="text-right">Invoices</th><th className="text-right">Orders taken</th><th className="text-right">Leads won</th><th className="text-right">Tasks done</th><th className="text-right">Tickets solved</th><th className="text-right">Actions</th></tr></thead>
          <tbody>{staff.map((u) => <tr key={u.id}><td className="font-medium">{u.name}</td><td className="text-right tabular-nums">{num(u.sales)}</td><td className="text-right">{u.invoices}</td><td className="text-right">{u.orders}</td><td className="text-right">{u.leads_won}</td><td className="text-right">{u.tasks}</td><td className="text-right">{u.tickets}</td><td className="text-right">{u.actions}</td></tr>)}</tbody></table></div>
      <h3 className="mb-2 font-semibold">Customer support</h3>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Tickets opened" value={String(sup.opened)} hint={supCat.map((c) => `${c.category} ${c.n}`).join(" · ")} /><Stat label="Resolved" value={String(sup.resolved)} hint={sup.opened ? `${Math.round((sup.resolved / sup.opened) * 100)}%` : ""} /><Stat label="Average time to resolve" value={`${sup.avg_h} h`} /><Stat label="Still open" value={String(sup.still_open)} /></div>
      <h3 className="mb-2 font-semibold">Delivery</h3>
      <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Shipments" value={String(ship.total)} hint={`${ship.delivered} delivered · ${ship.failed} failed or returned`} /><Stat label="Average delivery time" value={`${Number(ship.days)} days`} /><Stat label="Shipping cost" value={`${s.currency} ${num(ship.cost)}`} /><Stat label="COD collected" value={`${s.currency} ${num(ship.cod)}`} /></div>
      <div className="card mb-6 overflow-x-auto"><table className="tbl"><thead><tr><th>Courier</th><th className="text-right">Shipments</th><th className="text-right">Delivered</th><th className="text-right">Cost</th></tr></thead><tbody>{byCourier.map((c) => <tr key={c.courier}><td>{c.courier}</td><td className="text-right">{c.n}</td><td className="text-right">{c.ok}</td><td className="text-right tabular-nums">{num(c.cost)}</td></tr>)}{byCourier.length === 0 && <tr><td className="text-slate-400">No shipments in this period</td></tr>}</tbody></table></div>
      <h3 className="mb-2 font-semibold">Website</h3>
      <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Website orders" value={String(web.orders)} hint={`${web.invoiced} invoiced · ${web.cancelled} cancelled`} /><Stat label="Website order value" value={`${s.currency} ${num(web.value)}`} /><Stat label="Carts started" value={String(web.carts)} /><Stat label="Carts that became orders" value={web.carts ? `${Math.round((web.carts_done / web.carts) * 100)}%` : "—"} /></div>
      <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Orders by source</th><th className="text-right">Orders</th><th className="text-right">Value</th></tr></thead><tbody>{src.map((x) => <tr key={x.source}><td className="capitalize">{x.source}</td><td className="text-right">{x.n}</td><td className="text-right tabular-nums">{num(x.v)}</td></tr>)}{src.length === 0 && <tr><td className="text-slate-400">No orders in this period</td></tr>}</tbody></table></div>
      <p className="no-print mt-3 text-xs text-slate-400">Visitor numbers and page views come from Google Analytics: add your ID under Website → Banners, pages, SEO.</p>
    </div>
  );
}
