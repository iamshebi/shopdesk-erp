import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num, REPAIR_STATUSES, repairLabel, waLink, PAYMENT_METHODS } from "@/lib/util";
import { PageHeader, Badge, Field, repairTone } from "@/components/ui";
import Submit from "@/components/submit";
import { Printer, MessageCircle } from "lucide-react";
import { updateRepairStatus, updateRepairDetails, deliverRepair } from "../actions";

export default async function RepairPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("repairs");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const r = await one<any>("SELECT r.*, sa.number sale_no FROM repairs r LEFT JOIN sales sa ON sa.id = r.sale_id WHERE r.id=$1", [Number(id)]);
  if (!r) notFound();
  const logs = await q<any>("SELECT l.*, u.name FROM repair_logs l LEFT JOIN users u ON u.id=l.user_id WHERE repair_id=$1 ORDER BY l.created_at DESC", [r.id]);
  const techs = await q<{ id: number; name: string }>("SELECT id, name FROM users WHERE active ORDER BY name");
  const charge = r.final_charge ?? r.estimate;
  const messages: Record<string, string> = {
    received: `Hello ${r.customer_name}, we have received your ${r.device} for repair. Job no. ${r.number}. We'll update you soon. — ${s.shop_name}`,
    waiting_parts: `Hello ${r.customer_name}, the parts for your ${r.device} (job ${r.number}) are on order. We'll let you know as soon as they arrive. — ${s.shop_name}`,
    ready: `Hello ${r.customer_name}, good news! Your ${r.device} is ready for pickup (job ${r.number}). Amount: ${s.currency} ${num(charge)}${r.advance > 0 ? `, advance paid ${num(r.advance)}` : ""}. — ${s.shop_name}`,
    quote: `Hello ${r.customer_name}, we checked your ${r.device} (job ${r.number}). Repair cost: ${s.currency} ${num(charge)}. Please reply to confirm. — ${s.shop_name}`,
  };
  const open = !["delivered", "cancelled"].includes(r.status);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`${r.number} · ${r.device}`} subtitle={`${r.customer_name} · ${r.customer_phone} · received ${fmtDate(r.created_at, true)}`}>
        <Badge tone={repairTone(r.status)}>{repairLabel(r.status)}</Badge>
        <a href={`/print/repair/${r.id}${sp.new ? "?auto=1" : ""}`} target="_blank" className="btn-ghost"><Printer size={16} /> Job card</a>
      </PageHeader>
      {sp.new && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">Job card created. Print it for the customer and stick the tag on the device.</div>}
      {sp.saved && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">Saved.</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="card grid gap-4 p-6 sm:grid-cols-2 text-sm">
            <div><div className="label">Problem</div>{r.issue}</div>
            <div><div className="label">IMEI / serial</div><span className="font-mono">{r.imei || "—"}</span></div>
            <div><div className="label">Accessories</div>{r.accessories || "—"}</div>
            <div><div className="label">Condition</div>{r.condition_notes || "—"}</div>
            <div><div className="label">Passcode</div>{r.passcode || "—"}</div>
            <div><div className="label">Advance paid</div>{num(r.advance)} {r.advance > 0 && `(${r.advance_method})`}</div>
            {r.sale_no && <div><div className="label">Invoice</div><Link href={`/sales/${r.sale_id}`} className="link">{r.sale_no}</Link></div>}
          </div>

          {open && (
            <form action={updateRepairDetails} className="card space-y-4 p-6">
              <h3 className="font-semibold">Job details</h3>
              <input type="hidden" name="id" value={r.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Technician"><select name="technician_id" defaultValue={r.technician_id ?? ""} className="input"><option value="">Unassigned</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                <Field label="Estimate"><input name="estimate" defaultValue={r.estimate} className="input" inputMode="decimal" /></Field>
                <Field label="Final charge"><input name="final_charge" defaultValue={r.final_charge ?? ""} className="input" inputMode="decimal" /></Field>
                <Field label="Parts cost (for profit)"><input name="parts_cost" defaultValue={r.parts_cost} className="input" inputMode="decimal" /></Field>
                <Field label="Promised date"><input name="promised_at" type="date" defaultValue={r.promised_at ?? ""} className="input" /></Field>
              </div>
              <Field label="Problem / work notes"><textarea name="issue" defaultValue={r.issue} rows={2} className="input" /></Field>
              <Submit className="btn-dark">Save details</Submit>
            </form>
          )}

          <div className="card p-6">
            <h3 className="mb-4 font-semibold">History</h3>
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {logs.map((l) => (
                <li key={l.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <div className="font-medium">{repairLabel(l.status)}</div>
                  {l.note && <div className="text-slate-600">{l.note}</div>}
                  <div className="text-xs text-slate-400">{fmtDate(l.created_at, true)} · {l.name}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          {open && (
            <form action={updateRepairStatus} className="card space-y-3 p-5">
              <h3 className="font-semibold">Update status</h3>
              <input type="hidden" name="id" value={r.id} />
              <select name="status" defaultValue={r.status} className="input">
                {REPAIR_STATUSES.filter((x) => x.id !== "delivered").map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <input name="note" placeholder="Note (optional)" className="input" />
              <Submit className="btn-dark">Update</Submit>
            </form>
          )}
          {r.customer_phone && (
            <div className="card space-y-2 p-5">
              <h3 className="mb-1 flex items-center gap-2 font-semibold"><MessageCircle size={16} /> WhatsApp customer</h3>
              {[["received", "Device received"], ["quote", "Send quote"], ["waiting_parts", "Waiting for parts"], ["ready", "Ready for pickup"]].map(([k, label]) => (
                <a key={k} href={waLink(r.customer_phone, messages[k])} target="_blank" className="btn-ghost btn-sm w-full justify-start">{label}</a>
              ))}
            </div>
          )}
          {open && (
            <form action={deliverRepair} className="card space-y-3 border-accent/30 p-5">
              <h3 className="font-semibold">Deliver & invoice</h3>
              <input type="hidden" name="id" value={r.id} />
              <Field label="Charge (incl. VAT)"><input name="charge" defaultValue={charge} className="input" inputMode="decimal" required /></Field>
              {r.advance > 0 && <p className="text-xs text-slate-500">Advance of {num(r.advance)} will be deducted.</p>}
              <Field label="Balance paid by">
                <select name="method" className="input">{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </Field>
              <Submit confirm="Mark as delivered and create the invoice?">Deliver & create invoice</Submit>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
