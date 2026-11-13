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
import { addActivity, completeActivity, saveCustomerCrm } from "../../crm/actions";
import { ACTIVITY_TYPES } from "@/lib/crm";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("customers");
  const { id } = await params;
  const sp = await searchParams;
  const c = await one<any>("SELECT * FROM customers WHERE id=$1", [Number(id)]);
  if (!c) notFound();
  const sales = await q<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE customer_id=$1 ORDER BY date DESC`, [c.id]);
  const repairs = await q<any>("SELECT * FROM repairs WHERE customer_id=$1 ORDER BY created_at DESC", [c.id]);
  const owes = sales.filter((s) => s.type === "invoice").reduce((a, s) => a + Math.max(0, s.outstanding), 0);
  const acts = await q<any>("SELECT a.*, u.name uname FROM crm_activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.customer_id=$1 ORDER BY a.id DESC LIMIT 50", [c.id]);
  const tickets = await q<any>("SELECT id, number, subject, status FROM tickets WHERE customer_id=$1 ORDER BY id DESC LIMIT 20", [c.id]);
  const back = `/customers/${c.id}`;
  const orders = await q<any>("SELECT id, number, kind, status, total, created_at FROM orders WHERE customer_id=$1 ORDER BY id DESC LIMIT 20", [c.id]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={c.name} subtitle={`${c.phone}${c.trn ? ` · TRN ${c.trn}` : ""} · customer since ${fmtDate(c.created_at)}`}>
        {c.group_name && <Badge tone="violet">{c.group_name}</Badge>}
        {owes > 0.004 && <Badge tone="red">Owes {num(owes)}{Number(c.credit_limit) > 0 ? ` / limit ${num(c.credit_limit)}` : ""}</Badge>}
        {c.phone && <a href={waLink(c.phone, `Hello ${c.name}, `)} target="_blank" className="btn-ghost"><MessageCircle size={16} /> WhatsApp</a>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 font-semibold">Timeline &amp; follow-ups</div>
            <form action={addActivity} className="mb-4 flex flex-wrap gap-2">
              <input type="hidden" name="customer_id" value={c.id} /><input type="hidden" name="back" value={back} />
              <select name="type" className="input w-40">{ACTIVITY_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="body" className="input min-w-[200px] flex-1" placeholder="Note, call summary or reminder" />
              <input type="date" name="due_date" className="input w-40" title="Due date for follow-up reminders" />
              <Submit className="btn-dark">Add</Submit>
            </form>
            <ol className="space-y-2 text-sm">
              {acts.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <Badge tone={a.type === "followup" ? (a.done ? "green" : "amber") : "slate"}>{ACTIVITY_TYPES.find(([k]) => k === a.type)?.[1] ?? a.type}</Badge>
                  <div className="flex-1">{a.body}<div className="text-xs text-slate-400">{fmtDate(a.created_at, true)} · {a.uname ?? "—"}{a.due_date && ` · due ${fmtDate(a.due_date)}`}</div></div>
                  {a.type === "followup" && !a.done && <form action={completeActivity}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><Submit className="text-xs text-accent">Done</Submit></form>}
                </li>
              ))}
              {acts.length === 0 && <li className="text-slate-400">No notes yet.</li>}
            </ol>
          </div>
          {tickets.length > 0 && (
            <div className="card overflow-x-auto"><div className="p-5 pb-2 font-semibold">Support tickets</div>
              <table className="tbl"><tbody>{tickets.map((t) => <tr key={t.id}><td><Link href={`/support/${t.id}`} className="font-medium hover:text-accent">{t.number}</Link></td><td>{t.subject}</td><td className="text-right capitalize">{t.status}</td></tr>)}</tbody></table>
            </div>
          )}
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
        <div className="space-y-6">
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
        <form action={saveCustomerCrm} className="card h-fit space-y-3 p-5">
          <h3 className="font-semibold">Group, tags &amp; credit</h3>
          <input type="hidden" name="id" value={c.id} />
          <Field label="Customer group"><input name="group_name" defaultValue={c.group_name} className="input" placeholder="e.g. Wholesale, VIP, Corporate" /></Field>
          <Field label="Tags (comma separated)"><input name="tags" defaultValue={c.tags} className="input" /></Field>
          <Field label="Credit limit (0 = no credit check)"><input name="credit_limit" defaultValue={Number(c.credit_limit) || ""} className="input" inputMode="decimal" /></Field>
          <Field label="Internal notes"><textarea name="notes" defaultValue={c.notes} rows={3} className="input" /></Field>
          <Submit className="btn-dark">Save</Submit>
        </form>
        </div>
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
