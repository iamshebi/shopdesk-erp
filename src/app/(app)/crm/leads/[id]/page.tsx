import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STAGES, stageInfo, ACTIVITY_TYPES } from "@/lib/crm";
import { fmtDate, waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import LeadForm from "@/components/lead-form";
import { saveLead, setStage, convertLead, addActivity, completeActivity } from "../../actions";
import { MessageCircle, Phone } from "lucide-react";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("crm");
  const { id } = await params;
  const sp = await searchParams;
  const l = await one<any>("SELECT *, to_char(next_followup,'YYYY-MM-DD') next_followup FROM leads WHERE id=$1", [Number(id)]);
  if (!l) notFound();
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const acts = await q<any>("SELECT a.*, u.name FROM crm_activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.lead_id=$1 ORDER BY a.id DESC", [l.id]);
  const st = stageInfo(l.stage);
  const back = `/crm/leads/${l.id}`;
  return (
    <div className="max-w-5xl">
      <PageHeader title={l.name} subtitle={`${l.company ? l.company + " · " : ""}${l.source} · added ${fmtDate(l.created_at)}`}>
        <Badge tone={st.tone}>{st.label}</Badge>
        {l.phone && <a href={`tel:${l.phone}`} className="btn-ghost"><Phone size={15} /> Call</a>}
        {l.phone && <a href={waLink(l.phone, `Hello ${l.name}, `)} target="_blank" className="btn-ghost"><MessageCircle size={15} /> WhatsApp</a>}
        {l.customer_id && <Link href={`/customers/${l.customer_id}`} className="btn-ghost">Customer profile</Link>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="card mb-6 flex flex-wrap items-center gap-2 p-4">
        <span className="mr-2 text-sm text-slate-500">Move to:</span>
        {STAGES.filter((x) => x.id !== l.stage && x.id !== "lost").map((x) => (
          <form key={x.id} action={setStage}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="stage" value={x.id} /><Submit className="btn-ghost btn-sm">{x.label}</Submit></form>
        ))}
        {l.stage !== "lost" && <form action={setStage} className="flex gap-1"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="stage" value="lost" /><input name="lost_reason" placeholder="Why lost?" className="input h-8 w-36 text-xs" /><Submit className="btn-danger btn-sm">Lost</Submit></form>}
        {!l.customer_id && <>
          <form action={convertLead}><input type="hidden" name="id" value={l.id} /><Submit className="btn-primary btn-sm">Convert to customer</Submit></form>
          <form action={convertLead}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="quote" value="1" /><Submit className="btn-ghost btn-sm">Convert &amp; make quotation</Submit></form>
        </>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card p-6"><LeadForm action={saveLead} lead={l} users={users} /></div>
        <div className="space-y-4">
          <form action={addActivity} className="card space-y-2 p-5">
            <input type="hidden" name="lead_id" value={l.id} /><input type="hidden" name="back" value={back} />
            <h3 className="font-semibold">Log activity</h3>
            <select name="type" className="input">{ACTIVITY_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <textarea name="body" rows={2} className="input" placeholder="What happened / what to do" />
            <input type="date" name="due_date" className="input" title="Due date (for follow-up reminders)" />
            <Submit className="btn-dark btn-sm">Add</Submit>
          </form>
          <div className="card p-5 text-sm">
            <h3 className="mb-3 font-semibold">Timeline</h3>
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {acts.map((a) => (
                <li key={a.id}>
                  <div className="flex items-center gap-2"><Badge tone={a.type === "followup" ? (a.done ? "green" : "amber") : "slate"}>{ACTIVITY_TYPES.find(([k]) => k === a.type)?.[1] ?? a.type}</Badge>
                    {a.type === "followup" && !a.done && <form action={completeActivity}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><Submit className="text-xs text-accent hover:underline">Done</Submit></form>}</div>
                  <div className="mt-1">{a.body}</div>
                  <div className="text-xs text-slate-400">{fmtDate(a.created_at, true)} · {a.name ?? "—"}{a.due_date && ` · due ${fmtDate(a.due_date)}`}</div>
                </li>
              ))}
              {acts.length === 0 && <li className="text-slate-400">No activity yet.</li>}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
