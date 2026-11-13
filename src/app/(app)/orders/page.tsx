import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { statusInfo, ORDER_STATUSES, QUOTE_STATUSES } from "@/lib/orders";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty, Stat } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("orders");
  const sp = await searchParams;
  const s = await getSettings();
  const kind = sp.kind === "quote" ? "quote" : "order";
  const params: unknown[] = [kind];
  const where = ["o.kind = $1"];
  if (sp.status === "open") where.push(kind === "quote" ? "o.status IN ('draft','sent','accepted')" : "o.status IN ('draft','confirmed','packed','shipped')");
  else if (sp.status) { params.push(sp.status); where.push(`o.status = $${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(o.number ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.customer_phone ILIKE $${params.length} OR o.tracking_no ILIKE $${params.length})`); }
  const rows = await q<any>(
    `SELECT o.*, u.name rep, s.number invoice_no, (s.total - s.paid) due FROM orders o LEFT JOIN users u ON u.id=o.sales_rep_id LEFT JOIN sales s ON s.id=o.sale_id
     WHERE ${where.join(" AND ")} ORDER BY o.id DESC LIMIT 300`,
    params,
  );
  const counts = await q<{ status: string; n: number; v: number }>("SELECT status, count(*)::int n, COALESCE(sum(total),0) v FROM orders WHERE kind=$1 GROUP BY 1", [kind]);
  const c = (st: string[]) => counts.filter((x) => st.includes(x.status)).reduce((a, x) => ({ n: a.n + x.n, v: a.v + Number(x.v) }), { n: 0, v: 0 });
  const statuses = kind === "quote" ? QUOTE_STATUSES : ORDER_STATUSES;
  const tab = (k: string, label: string) => <Link href={`/orders?kind=${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${kind === k ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{label}</Link>;
  return (
    <div>
      <PageHeader title="Orders & quotations" subtitle="Phone, WhatsApp, website and delivery orders, and price quotations">
        <Link href="/orders/new?kind=quote" className="btn-ghost"><Plus size={16} /> Quotation</Link>
        <Link href="/orders/new" className="btn-primary"><Plus size={16} /> Sales order</Link>
      </PageHeader>
      <div className="mb-4 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">{tab("order", "Sales orders")}{tab("quote", "Quotations")}</div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kind === "order" ? <>
          <Stat label="Waiting to confirm" value={String(c(["draft"]).n)} hint={`${s.currency} ${num(c(["draft"]).v)}`} href="/orders?status=draft" />
          <Stat label="Pending (confirmed, packed)" value={String(c(["confirmed", "packed"]).n)} hint={`${s.currency} ${num(c(["confirmed", "packed"]).v)} · stock reserved`} href="/orders?status=confirmed" />
          <Stat label="Out for delivery" value={String(c(["shipped"]).n)} hint={`${s.currency} ${num(c(["shipped"]).v)}`} href="/orders?status=shipped" />
          <Stat label="Completed" value={String(c(["delivered"]).n)} hint={`${s.currency} ${num(c(["delivered"]).v)} invoiced`} href="/orders?status=delivered" />
        </> : <>
          <Stat label="Open quotations" value={String(c(["draft", "sent"]).n)} hint={`${s.currency} ${num(c(["draft", "sent"]).v)}`} href="/orders?kind=quote&status=open" />
          <Stat label="Accepted" value={String(c(["accepted"]).n)} hint="ready to turn into orders" href="/orders?kind=quote&status=accepted" />
          <Stat label="Converted" value={String(c(["converted"]).n)} hint={`${s.currency} ${num(c(["converted"]).v)}`} href="/orders?kind=quote&status=converted" />
          <Stat label="Declined" value={String(c(["declined"]).n)} hint="lost offers" href="/orders?kind=quote&status=declined" />
        </>}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input name="q" defaultValue={sp.q} placeholder="Number, customer, phone or tracking no." className="input max-w-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="input w-48"><option value="">All statuses</option><option value="open">Open only</option>{statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <button className="btn-dark">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>{kind === "quote" ? "No quotations yet." : "No orders yet."}</Empty> : (
          <table className="tbl">
            <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Source</th><th>Status</th><th>Sales person</th><th className="text-right">Total</th><th>Invoice</th></tr></thead>
            <tbody>
              {rows.map((o) => {
                const st = statusInfo(o.kind, o.status);
                return (
                  <tr key={o.id}>
                    <td><Link href={`/orders/${o.id}`} className="font-medium hover:text-accent">{o.number}</Link></td>
                    <td className="text-slate-500">{fmtDate(o.created_at)}</td>
                    <td>{o.customer_name || o.customer_phone}<div className="text-xs text-slate-400">{o.customer_phone}</div></td>
                    <td className="capitalize text-slate-500">{o.source}{o.delivery_method === "delivery" && " · delivery"}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="text-slate-500">{o.rep ?? "—"}</td>
                    <td className="text-right tabular-nums font-medium">{num(o.total)}{Number(o.advance) > 0 && !o.sale_id && <div className="text-xs font-normal text-slate-400">advance {num(o.advance)}</div>}</td>
                    <td>{o.invoice_no ? <Link href={`/sales/${o.sale_id}`} className="link">{o.invoice_no}</Link> : "—"}{o.invoice_no && Number(o.due) > 0.004 && <div className="text-xs text-red-600">due {num(o.due)}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
