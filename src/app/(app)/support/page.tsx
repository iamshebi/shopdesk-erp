import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TICKET_STATUSES, PRIORITIES, CATEGORIES, CHANNELS, tStatus, tPriority } from "@/lib/support";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import Submit from "@/components/submit";
import { createTicket } from "./actions";

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("support");
  const sp = await searchParams;
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const params: unknown[] = [];
  const where: string[] = [];
  const view = sp.view ?? "active";
  if (view === "active") where.push("t.status IN ('open','pending')");
  else if (view === "mine") { params.push(user.id); where.push(`t.assignee_id=$${params.length} AND t.status IN ('open','pending')`); }
  else if (view === "unassigned") where.push("t.assignee_id IS NULL AND t.status IN ('open','pending')");
  else if (view !== "all") { params.push(view); where.push(`t.status=$${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(t.number ILIKE $${params.length} OR t.subject ILIKE $${params.length} OR t.customer_name ILIKE $${params.length} OR t.customer_phone ILIKE $${params.length})`); }
  const rows = await q<any>(
    `SELECT t.*, u.name assignee FROM tickets t LEFT JOIN users u ON u.id=t.assignee_id ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 300`,
    params,
  );
  const st = await one<any>(`SELECT count(*) FILTER (WHERE status='open')::int open, count(*) FILTER (WHERE status='pending')::int pending,
    count(*) FILTER (WHERE status IN ('open','pending') AND priority IN ('high','urgent'))::int hot,
    COALESCE(round(avg(extract(epoch FROM resolved_at - created_at)/3600) FILTER (WHERE resolved_at > now() - interval '30 days'))::int, 0) avg_h FROM tickets`);
  const views = [["active", "Active"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All"]];
  return (
    <div>
      <PageHeader title="Support" subtitle="Customer questions, complaints, warranty and returns">
        <Link href="/support/kb" className="btn-ghost">Knowledge base</Link>
      </PageHeader>
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={String(st.open)} /><Stat label="Waiting on customer" value={String(st.pending)} />
        <Stat label="High / urgent" value={String(st.hot)} /><Stat label="Avg. time to resolve" value={st.avg_h ? `${st.avg_h} h` : "—"} hint="last 30 days" />
      </div>
      <details className="card mb-6 p-5" open={!!sp.new}>
        <summary className="cursor-pointer font-semibold">+ New ticket</summary>
        <form action={createTicket} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="customer_id" value={sp.customer ?? ""} />
          <div><label className="label">Customer name</label><input name="customer_name" defaultValue={sp.name} className="input" /></div>
          <div><label className="label">Phone</label><input name="customer_phone" defaultValue={sp.phone} className="input" inputMode="tel" /></div>
          <div><label className="label">Reference (invoice / order / IMEI)</label><input name="reference" className="input" /></div>
          <div className="sm:col-span-3"><label className="label">Subject</label><input name="subject" className="input" required /></div>
          <div><label className="label">Category</label><select name="category" className="input capitalize">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Priority</label><select name="priority" defaultValue="normal" className="input">{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          <div><label className="label">Channel</label><select name="channel" className="input capitalize">{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Assign to</label><select name="assignee_id" className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div className="sm:col-span-3"><label className="label">Details</label><textarea name="body" rows={3} className="input" /></div>
          <div className="sm:col-span-3"><Submit>Open ticket</Submit></div>
        </form>
      </details>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {views.map(([k, v]) => <Link key={k} href={`/support?view=${k}`} className={`rounded-full border px-3 py-1 text-sm ${view === k ? "border-accent bg-accent/10 font-medium text-accent" : "border-slate-200 text-slate-600"}`}>{v}</Link>)}
        <form className="ml-auto"><input type="hidden" name="view" value={view} /><input name="q" defaultValue={sp.q} placeholder="Search tickets…" className="input w-56" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Ticket</th><th>Customer</th><th>Category</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/support/${t.id}`} className="font-medium hover:text-accent">{t.number}</Link><div className="text-xs text-slate-500">{t.subject}</div></td>
                <td>{t.customer_name || "—"}<div className="text-xs text-slate-400">{t.customer_phone}</div></td>
                <td className="capitalize">{t.category}</td>
                <td><Badge tone={tPriority(t.priority).tone}>{tPriority(t.priority).label}</Badge></td>
                <td><Badge tone={tStatus(t.status).tone}>{tStatus(t.status).label}</Badge></td>
                <td>{t.assignee ?? <span className="text-slate-400">—</span>}</td>
                <td className="text-slate-500">{fmtDate(t.updated_at, true)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400">No tickets here</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Statuses: {TICKET_STATUSES.map((s) => s.label).join(" → ")}</p>
    </div>
  );
}
