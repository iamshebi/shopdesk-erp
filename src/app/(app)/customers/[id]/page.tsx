import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { fmtDate, num, repairLabel, waLink } from "@/lib/util";
import { PageHeader, Badge, Field, repairTone } from "@/components/ui";
import Submit from "@/components/submit";
import { MessageCircle } from "lucide-react";
import { updateCustomer } from "../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("customers");
  const { id } = await params;
  const c = await one<any>("SELECT * FROM customers WHERE id=$1", [Number(id)]);
  if (!c) notFound();
  const sales = await q<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE customer_id=$1 ORDER BY date DESC`, [c.id]);
  const repairs = await q<any>("SELECT * FROM repairs WHERE customer_id=$1 ORDER BY created_at DESC", [c.id]);
  const owes = sales.filter((s) => s.type === "invoice").reduce((a, s) => a + Math.max(0, s.outstanding), 0);
  const orders = await q<any>("SELECT id, number, kind, status, total, created_at FROM orders WHERE customer_id=$1 ORDER BY id DESC LIMIT 20", [c.id]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={c.name} subtitle={`${c.phone}${c.trn ? ` · TRN ${c.trn}` : ""} · customer since ${fmtDate(c.created_at)}`}>
        {owes > 0.004 && <Badge tone="red">Owes {num(owes)}</Badge>}
        {c.phone && <a href={waLink(c.phone, `Hello ${c.name}, `)} target="_blank" className="btn-ghost"><MessageCircle size={16} /> WhatsApp</a>}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <div className="p-5 pb-2 font-semibold">Invoices</div>
            <table className="tbl">
              <thead><tr><th>No.</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Status</th></tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/sales/${s.id}`} className="font-medium hover:text-accent">{s.number}</Link></td>
                    <td className="text-slate-500">{fmtDate(s.date, true)}</td>
                    <td className="text-right tabular-nums">{s.type === "credit_note" ? "−" : ""}{num(s.total)}</td>
                    <td className="text-right">{s.type === "credit_note" ? <Badge tone="red">Return</Badge> : s.outstanding > 0.004 ? <Badge tone="amber">Due {num(s.outstanding)}</Badge> : <Badge tone="green">Paid</Badge>}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400">No invoices</td></tr>}
              </tbody>
            </table>
          </div>
          {repairs.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="p-5 pb-2 font-semibold">Repairs</div>
              <table className="tbl"><tbody>
                {repairs.map((r) => (
                  <tr key={r.id}><td><Link href={`/repairs/${r.id}`} className="font-medium hover:text-accent">{r.number}</Link></td><td>{r.device}</td><td className="text-slate-500">{fmtDate(r.created_at)}</td><td><Badge tone={repairTone(r.status)}>{repairLabel(r.status)}</Badge></td></tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
        <form action={updateCustomer} className="card h-fit space-y-3 p-5">
          <h3 className="font-semibold">Details</h3>
          <input type="hidden" name="id" value={c.id} />
          <Field label="Name"><input name="name" defaultValue={c.name} className="input" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={c.phone} className="input" /></Field>
          <Field label="Email"><input name="email" defaultValue={c.email} className="input" /></Field>
          <Field label="TRN (business customers)"><input name="trn" defaultValue={c.trn} className="input" /></Field>
          <Field label="Address"><textarea name="address" defaultValue={c.address} rows={2} className="input" /></Field>
          <Submit className="btn-dark">Save</Submit>
        </form>
      </div>
      {orders.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">Orders &amp; quotations</div>
          <table className="tbl">
            <thead><tr><th>Number</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}><td><Link href={`/orders/${o.id}`} className="font-medium hover:text-accent">{o.number}</Link> <span className="text-xs text-slate-400">{o.kind === "quote" ? "quotation" : "order"}</span></td>
                <td className="text-slate-500">{fmtDate(o.created_at)}</td><td className="capitalize">{o.status}</td><td className="text-right tabular-nums">{num(o.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
