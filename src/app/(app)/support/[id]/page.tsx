import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TICKET_STATUSES, PRIORITIES, tStatus, tPriority } from "@/lib/support";
import { fmtDate, waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { updateTicket, replyTicket } from "../actions";
import { MessageCircle } from "lucide-react";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("support");
  const { id } = await params;
  const sp = await searchParams;
  const t = await one<any>("SELECT * FROM tickets WHERE id=$1", [Number(id)]);
  if (!t) notFound();
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const msgs = await q<any>("SELECT m.*, u.name FROM ticket_messages m LEFT JOIN users u ON u.id=m.user_id WHERE ticket_id=$1 ORDER BY m.id", [t.id]);
  const kb = await q<any>("SELECT id, title FROM kb_articles WHERE published ORDER BY updated_at DESC LIMIT 8");
  return (
    <div className="max-w-5xl">
      <PageHeader title={`${t.number} · ${t.subject}`} subtitle={`${t.category} · via ${t.channel} · opened ${fmtDate(t.created_at, true)}${t.reference ? ` · ref ${t.reference}` : ""}`}>
        <Badge tone={tPriority(t.priority).tone}>{tPriority(t.priority).label}</Badge>
        <Badge tone={tStatus(t.status).tone}>{tStatus(t.status).label}</Badge>
        {t.customer_phone && <a href={waLink(t.customer_phone, `Hello ${t.customer_name}, about your request ${t.number}: `)} target="_blank" className="btn-ghost"><MessageCircle size={15} /> WhatsApp</a>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {msgs.map((m) => (
            <div key={m.id} className={`card p-4 text-sm ${m.internal ? "border-dashed bg-amber-50/60" : ""}`}>
              <div className="mb-1 text-xs text-slate-400">{m.name ?? "—"} · {fmtDate(m.created_at, true)}{m.internal && " · internal note"}</div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
          {msgs.length === 0 && <div className="card p-4 text-sm text-slate-400">No messages yet.</div>}
          <form action={replyTicket} className="card space-y-2 p-4">
            <input type="hidden" name="id" value={t.id} />
            <textarea name="body" rows={3} className="input" placeholder="Reply / what was done…" />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="internal" /> Internal note</label>
              <select name="then" className="input w-48"><option value="">Keep status</option>{TICKET_STATUSES.map((s) => <option key={s.id} value={s.id}>Set: {s.label}</option>)}</select>
              <Submit className="btn-dark">Add</Submit>
            </div>
          </form>
        </div>
        <div className="space-y-4">
          <form action={updateTicket} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={t.id} />
            <div><label className="label">Status</label><select name="status" defaultValue={t.status} className="input">{TICKET_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label className="label">Priority</label><select name="priority" defaultValue={t.priority} className="input">{PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div><label className="label">Assigned to</label><select name="assignee_id" defaultValue={t.assignee_id ?? ""} className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <Submit className="btn-dark">Update</Submit>
          </form>
          <div className="card p-5 text-sm">
            <div className="font-semibold">Customer</div>
            <div className="mt-1">{t.customer_name || "—"}</div><div className="text-slate-500">{t.customer_phone}</div>
            {t.customer_id && <Link href={`/customers/${t.customer_id}`} className="mt-2 inline-block text-accent hover:underline">Open profile</Link>}
          </div>
          {kb.length > 0 && <div className="card p-5 text-sm"><div className="mb-2 font-semibold">Knowledge base</div>{kb.map((a) => <Link key={a.id} href={`/support/kb#a${a.id}`} className="block py-0.5 text-accent hover:underline">{a.title}</Link>)}</div>}
        </div>
      </div>
    </div>
  );
}
