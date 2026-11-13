import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEAVE_TYPES } from "@/lib/hr";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../tabs";
import { requestLeave, decideLeave } from "../actions";

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("hr");
  const sp = await searchParams;
  const emps = await q<any>("SELECT id, name FROM employees WHERE active ORDER BY name");
  const rows = await q<any>("SELECT l.*, e.name, u.name decided FROM leave_requests l JOIN employees e ON e.id=l.employee_id LEFT JOIN users u ON u.id=l.decided_by ORDER BY (l.status='pending') DESC, l.from_date DESC LIMIT 200");
  const tone: Record<string, string> = { pending: "amber", approved: "green", rejected: "red", cancelled: "slate" };
  return (
    <div className="max-w-5xl">
      <PageHeader title="Leave" subtitle="Requests, approvals and leave calendar" />
      <HrTabs active="/hr/leave" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={requestLeave} className="card mb-6 grid gap-3 p-5 sm:grid-cols-6">
        <div className="sm:col-span-2"><label className="label">Employee</label><select name="employee_id" className="input" required><option value="">—</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        <div><label className="label">Type</label><select name="type" className="input">{LEAVE_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">From</label><input type="date" name="from_date" className="input" required /></div>
        <div><label className="label">To</label><input type="date" name="to_date" className="input" /></div>
        <div><label className="label">Days</label><input name="days" className="input" placeholder="auto" inputMode="decimal" /></div>
        <div className="sm:col-span-5"><label className="label">Reason</label><input name="reason" className="input" /></div>
        <div className="flex items-end"><Submit>Add request</Submit></div>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/hr/${l.employee_id}`} className="font-medium hover:text-accent">{l.name}</Link>{l.reason && <div className="text-xs text-slate-400">{l.reason}</div>}</td>
                <td className="capitalize">{l.type}</td><td>{fmtDate(l.from_date)} – {fmtDate(l.to_date)}</td><td>{Number(l.days)}</td>
                <td><Badge tone={tone[l.status]}>{l.status}</Badge>{l.decided && <div className="text-xs text-slate-400">by {l.decided}</div>}</td>
                <td className="text-right">{l.status === "pending" ? <div className="flex justify-end gap-1">
                  <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="approved" /><Submit className="btn-primary btn-sm">Approve</Submit></form>
                  <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="rejected" /><Submit className="btn-ghost btn-sm">Reject</Submit></form></div>
                  : l.status === "approved" ? <form action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="cancelled" /><Submit className="btn-ghost btn-sm">Cancel</Submit></form> : null}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">No leave requests</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
