import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";


const PO_TONE: Record<string, string> = { request: "amber", approved: "blue", ordered: "violet", partial: "amber", received: "green", rejected: "red", cancelled: "slate" };
const PO_LABEL: Record<string, string> = { request: "Waiting approval", approved: "Approved", ordered: "Sent to supplier", partial: "Partly received", received: "Received", rejected: "Rejected", cancelled: "Cancelled" };

export default async function POList({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("purchases");
  const sp = await searchParams;
  const rows = await q<any>(`SELECT o.*, s.name supplier, u.name by_name FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN users u ON u.id=o.requested_by
    ${sp.status ? "WHERE o.status=$1" : ""} ORDER BY o.id DESC LIMIT 300`, sp.status ? [sp.status] : []);
  return (
    <div>
      <PageHeader title="Purchase orders" subtitle="Requests, approvals and orders to suppliers">
        <Link href="/purchases" className="btn-ghost">Purchases (bills)</Link>
        <Link href="/purchases/orders/new" className="btn-primary">New request</Link>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2 text-sm"><Link href="/purchases/orders" className={`rounded-full border px-3 py-1 ${!sp.status ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>All</Link>{Object.entries(PO_LABEL).map(([k, v]) => <Link key={k} href={`/purchases/orders?status=${k}`} className={`rounded-full border px-3 py-1 ${sp.status === k ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>{v}</Link>)}</div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>No.</th><th>Supplier</th><th>Requested by</th><th>Needed by</th><th className="text-right">Value</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((o) => <tr key={o.id}><td><Link href={`/purchases/orders/${o.id}`} className="font-medium hover:text-accent">{o.number}</Link><div className="text-xs text-slate-400">{fmtDate(o.created_at)}</div></td><td>{o.supplier ?? "—"}</td><td>{o.by_name ?? "—"}</td><td>{o.expected_date ? fmtDate(o.expected_date) : "—"}</td><td className="text-right tabular-nums">{num(o.subtotal)}</td><td><Badge tone={PO_TONE[o.status]}>{PO_LABEL[o.status] ?? o.status}</Badge></td></tr>)}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">No purchase orders</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
