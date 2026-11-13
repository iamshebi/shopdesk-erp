import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STAGES } from "@/lib/crm";
import { num, fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Stat } from "@/components/ui";
import LeadForm from "@/components/lead-form";
import CrmTabs from "./tabs";
import { saveLead } from "./actions";

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("crm");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayDubai();
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const params: unknown[] = [];
  let where = "TRUE";
  if (sp.owner) { params.push(Number(sp.owner)); where = `l.owner_id = $1`; }
  const leads = await q<any>(`SELECT l.*, to_char(l.next_followup,'YYYY-MM-DD') nf, u.name owner FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE ${where} AND (l.stage NOT IN ('won','lost') OR l.updated_at > now() - interval '30 days') ORDER BY l.updated_at DESC`, params);
  const stats = await one<any>(
    `SELECT count(*) FILTER (WHERE stage NOT IN ('won','lost'))::int open, COALESCE(sum(value) FILTER (WHERE stage NOT IN ('won','lost')),0) pipeline,
            count(*) FILTER (WHERE stage='won' AND updated_at >= date_trunc('month', now()))::int won_month,
            count(*) FILTER (WHERE stage='won')::int won, count(*) FILTER (WHERE stage IN ('won','lost'))::int closed
     FROM leads`,
  );
  return (
    <div>
      <PageHeader title="CRM" subtitle="Leads from walk-ins, calls, WhatsApp and social media, through to customers" />
      <CrmTabs active="/crm" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open leads" value={String(stats.open)} hint={`possible ${s.currency} ${num(stats.pipeline)}`} />
        <Stat label="Won this month" value={String(stats.won_month)} />
        <Stat label="Win rate" value={stats.closed ? `${Math.round((stats.won / stats.closed) * 100)}%` : "—"} hint="of closed leads" />
        <Stat label="Follow-ups due" value={String(leads.filter((l) => l.nf && l.nf <= today && !["won", "lost"].includes(l.stage)).length)} href="/crm/followups" />
      </div>
      <details className="card mb-6 p-5" open={!!sp.add}>
        <summary className="cursor-pointer font-semibold">+ Add a lead</summary>
        <div className="mt-4"><LeadForm action={saveLead} users={users} /></div>
      </details>
      <form className="mb-3 flex gap-2"><select name="owner" defaultValue={sp.owner ?? ""} className="input w-48"><option value="">Everyone&apos;s leads</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="btn-dark">Show</button></form>
      <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((st) => {
          const list = leads.filter((l) => l.stage === st.id);
          return (
            <div key={st.id} className="min-w-[200px] rounded-2xl bg-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{st.label}<span className="text-xs font-normal text-slate-500">{list.length} · {num(list.reduce((a, l) => a + Number(l.value), 0))}</span></div>
              <div className="space-y-2">
                {list.map((l) => (
                  <Link key={l.id} href={`/crm/leads/${l.id}`} className="card block p-3 text-sm transition hover:shadow-md">
                    <div className="font-medium">{l.name}</div>
                    {l.interest && <div className="text-xs text-slate-500">{l.interest}</div>}
                    <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{l.owner ?? l.source}</span>{Number(l.value) > 0 && <span>{num(l.value)}</span>}</div>
                    {l.nf && !["won", "lost"].includes(l.stage) && <div className={`mt-1 text-xs ${l.nf <= today ? "font-medium text-red-600" : "text-slate-400"}`}>Follow up {fmtDate(l.nf)}</div>}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
