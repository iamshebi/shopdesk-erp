import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_TYPES } from "@/lib/crm";
import { fmtDate, todayDubai, waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import CrmTabs from "../tabs";
import { completeActivity } from "../actions";

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("crm");
  const sp = await searchParams;
  const today = todayDubai();
  const mine = sp.mine === "1";
  const rows = await q<any>(
    `SELECT a.*, to_char(a.due_date,'YYYY-MM-DD') due, l.name lead_name, l.phone lead_phone, c.name cust_name, c.phone cust_phone, u.name by_name
     FROM crm_activities a LEFT JOIN leads l ON l.id=a.lead_id LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN users u ON u.id=a.user_id
     WHERE a.type='followup' AND NOT a.done ${mine ? "AND a.user_id=$1" : ""} ORDER BY a.due_date NULLS LAST, a.id`,
    mine ? [user.id] : [],
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Follow-ups" subtitle="Reminders to call back leads and customers" />
      <CrmTabs active="/crm/followups" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <div className="mb-3 flex gap-2 text-sm"><Link href="/crm/followups" className={!mine ? "font-semibold" : "text-slate-500"}>Everyone</Link>·<Link href="/crm/followups?mine=1" className={mine ? "font-semibold" : "text-slate-500"}>Mine</Link></div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Due</th><th>Who</th><th>What</th><th>Added by</th><th></th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const name = a.cust_name ?? a.lead_name, phone = a.cust_phone ?? a.lead_phone;
              const href = a.customer_id ? `/customers/${a.customer_id}` : `/crm/leads/${a.lead_id}`;
              return (
                <tr key={a.id}>
                  <td>{a.due ? <Badge tone={a.due < today ? "red" : a.due === today ? "amber" : "slate"}>{a.due < today ? "Overdue " : ""}{fmtDate(a.due)}</Badge> : "—"}</td>
                  <td><Link href={href} className="font-medium hover:text-accent">{name ?? "—"}</Link>{phone && <a href={waLink(phone, `Hello ${name}, `)} target="_blank" className="ml-2 text-xs text-emerald-600">WhatsApp</a>}</td>
                  <td>{a.body}</td>
                  <td className="text-slate-500">{a.by_name ?? "—"}</td>
                  <td className="text-right"><form action={completeActivity}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value="/crm/followups" /><Submit className="btn-ghost btn-sm">Done</Submit></form></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">Nothing to follow up. Add reminders from a lead or customer page.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">Types: {ACTIVITY_TYPES.map(([, v]) => v).join(", ")}</p>
    </div>
  );
}
