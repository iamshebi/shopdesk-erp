import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num, waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import PrintButton from "@/components/print-button";
import { setPOStatus } from "../../actions";

const TONE: Record<string, string> = { request: "amber", approved: "blue", ordered: "violet", partial: "amber", received: "green", rejected: "red", cancelled: "slate" };
const LABEL: Record<string, string> = { request: "Waiting approval", approved: "Approved", ordered: "Sent to supplier", partial: "Partly received", received: "Received", rejected: "Rejected", cancelled: "Cancelled" };

export default async function POPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("purchases");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const o = await one<any>(`SELECT o.*, s.name supplier, s.phone sphone, u.name by_name, a.name approver, w.name wh FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id
    LEFT JOIN users u ON u.id=o.requested_by LEFT JOIN users a ON a.id=o.approved_by LEFT JOIN warehouses w ON w.id=o.warehouse_id WHERE o.id=$1`, [Number(id)]);
  if (!o) notFound();
  const items = await q<any>("SELECT i.*, p.name, p.sku FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE po_id=$1 ORDER BY i.id", [o.id]);
  const bills = await q<any>("SELECT id, number, total, date FROM purchases WHERE po_id=$1 ORDER BY id", [o.id]);
  const btn = (status: string, label: string, cls = "btn-ghost", confirm?: string) => <form action={setPOStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={status} /><Submit className={cls} confirm={confirm}>{label}</Submit></form>;
  const msg = `${s.shop_name} purchase order ${o.number}:\n${items.map((i) => `${i.qty} × ${i.name}`).join("\n")}\nPlease confirm price and delivery date.`;
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Purchase order ${o.number}`} subtitle={`${o.supplier ?? "No supplier yet"} · requested by ${o.by_name ?? "—"} on ${fmtDate(o.created_at)}${o.approver ? ` · approved by ${o.approver}` : ""}`}>
        <Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>
        <span className="no-print"><PrintButton /></span>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700 no-print">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700 no-print">{sp.err}</div>}
      <div className="card no-print mb-6 flex flex-wrap items-center gap-2 p-4">
        {o.status === "request" && (can(user, "purchases.approve") ? <>{btn("approved", "Approve", "btn-primary")}{btn("rejected", "Reject")}</> : <span className="text-sm text-slate-500">Waiting for a manager to approve.</span>)}
        {o.status === "approved" && <>{btn("ordered", "Mark as sent to supplier", "btn-primary")}{o.sphone && <a href={waLink(o.sphone, msg)} target="_blank" className="btn-ghost">Send by WhatsApp</a>}</>}
        {["approved", "ordered", "partial"].includes(o.status) && <Link href={`/purchases/new?po=${o.id}`} className="btn-dark">Receive goods</Link>}
        {o.status === "partial" && btn("received", "Close (nothing more coming)")}
        {o.status === "rejected" && btn("request", "Ask again")}
        {["request", "approved", "ordered"].includes(o.status) && btn("cancelled", "Cancel", "btn-ghost", "Cancel this purchase order?")}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Unit cost</th><th className="text-right">Total</th></tr></thead>
          <tbody>{items.map((i) => <tr key={i.id}><td><Link href={`/products/${i.product_id}`} className="font-medium hover:text-accent">{i.name}</Link><div className="text-xs text-slate-400">{i.sku}</div></td><td className="text-right">{i.qty}</td><td className="text-right">{i.received_qty}</td><td className="text-right tabular-nums">{num(i.unit_cost)}</td><td className="text-right tabular-nums">{num(i.qty * i.unit_cost)}</td></tr>)}
            <tr className="font-semibold"><td colSpan={4} className="text-right">Total excl. VAT ({s.currency})</td><td className="text-right tabular-nums">{num(o.subtotal)}</td></tr></tbody>
        </table>
      </div>
      <div className="mt-4 text-sm text-slate-600">
        {o.expected_date && <div>Needed by: {fmtDate(o.expected_date)}</div>}{o.wh && <div>Deliver to: {o.wh}</div>}{o.supplier_quote_ref && <div>Supplier quotation: {o.supplier_quote_ref}</div>}{o.notes && <div>Notes: {o.notes}</div>}
      </div>
      {bills.length > 0 && <div className="card no-print mt-6 p-5 text-sm"><h3 className="mb-2 font-semibold">Goods received</h3>{bills.map((b) => <div key={b.id} className="flex justify-between"><Link href={`/purchases/${b.id}`} className="text-accent">{b.number}</Link><span>{fmtDate(b.date)} · {num(b.total)}</span></div>)}</div>}
    </div>
  );
}
