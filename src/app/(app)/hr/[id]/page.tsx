import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import EmployeeForm from "@/components/employee-form";
import HrTabs from "../tabs";
import { saveEmployee, saveReview, saveOnboarding } from "../actions";
import Submit from "@/components/submit";
import Attachments from "@/components/attachments";

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("hr");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const e = await one<any>("SELECT *, to_char(join_date,'YYYY-MM-DD') join_date FROM employees WHERE id=$1", [Number(id)]);
  if (!e) notFound();
  const departments = await q<any>("SELECT * FROM departments ORDER BY name");
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const year = new Date().getFullYear();
  const leave = await one<any>(`SELECT COALESCE(sum(days) FILTER (WHERE type='annual' AND status='approved' AND extract(year FROM from_date)=$2),0) used,
    COALESCE(sum(days) FILTER (WHERE type='sick' AND status='approved' AND extract(year FROM from_date)=$2),0) sick FROM leave_requests WHERE employee_id=$1`, [e.id, year]);
  const att = await one<any>(`SELECT count(*) FILTER (WHERE status IN ('present','late'))::int present, count(*) FILTER (WHERE status='late')::int late, count(*) FILTER (WHERE status='absent')::int absent
    FROM attendance WHERE employee_id=$1 AND date >= date_trunc('month', now())`, [e.id]);
  const slips = await q<any>("SELECT p.*, r.month, r.status FROM payslips p JOIN payroll_runs r ON r.id=p.run_id WHERE p.employee_id=$1 ORDER BY r.month DESC LIMIT 12", [e.id]);
  const reviews = await q<any>("SELECT r.*, u.name reviewer FROM employee_reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.employee_id=$1 ORDER BY r.id DESC LIMIT 10", [e.id]);
  const hours = await one<any>(`SELECT COALESCE(sum(CASE WHEN check_in ~ '^\\d\\d:\\d\\d' AND check_out ~ '^\\d\\d:\\d\\d' THEN GREATEST(0, extract(epoch FROM (check_out::time - check_in::time))/3600) ELSE 0 END),0)::float h, COALESCE(sum(overtime_hours),0)::float ot,
    count(*) FILTER (WHERE $2 <> '' AND check_in > $2)::int late_in FROM attendance WHERE employee_id=$1 AND date >= date_trunc('month', now())`, [e.id, e.shift_start ?? ""]);
  const perf = e.user_id ? await one<any>(`SELECT (SELECT COALESCE(sum(total),0) FROM sales WHERE COALESCE(sales_rep_id, created_by)=$1 AND type='invoice' AND date >= date_trunc('month', now())) sales,
    (SELECT count(*)::int FROM tasks WHERE assignee_id=$1 AND status='done' AND done_at >= date_trunc('month', now())) tasks, (SELECT count(*)::int FROM tickets WHERE assignee_id=$1 AND resolved_at >= date_trunc('month', now())) tickets,
    (SELECT count(*)::int FROM activity WHERE user_id=$1 AND created_at >= date_trunc('month', now())) actions`, [e.user_id]) : null;
  const STEPS = ["Contract signed", "Visa / labour card", "Emirates ID copy", "Bank account for WPS", "Login account created", "Uniform / tools given", "Training done"];
  const leaves = await q<any>("SELECT * FROM leave_requests WHERE employee_id=$1 ORDER BY from_date DESC LIMIT 10", [e.id]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={e.name} subtitle={`${e.code} · ${e.designation || "—"}${e.join_date ? ` · joined ${fmtDate(e.join_date)}` : ""}`}>{!e.active && <Badge tone="slate">Inactive</Badge>}</PageHeader>
      <HrTabs active="/hr" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Annual leave left (${year})`} value={`${num(Number(e.annual_leave_days) - Number(leave.used)).replace(/\.00$/, "")} days`} hint={`${Number(leave.used)} used of ${Number(e.annual_leave_days)}`} />
        <Stat label="Sick days this year" value={String(Number(leave.sick))} />
        <Stat label="This month" value={`${att.present} present`} hint={`${att.late} late · ${att.absent} absent`} />
        <Stat label="Monthly gross" value={`${s.currency} ${num(Number(e.basic_salary) + Number(e.allowances))}`} />
      </div>
      <div className="card mb-6 p-6"><EmployeeForm action={saveEmployee} e={e} departments={departments} users={users} /></div>
      <div className="mb-6"><Attachments kind="employee" ownerId={e.id} back={`/hr/${e.id}`} title="Documents (passport, visa, Emirates ID, contract)" /></div>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 text-sm"><h3 className="mb-2 font-semibold">This month</h3>
          <div className="flex justify-between"><span>Hours worked</span><span>{Math.round(hours.h * 10) / 10} h</span></div><div className="flex justify-between"><span>Overtime</span><span>{hours.ot} h</span></div>{e.shift_start && <div className="flex justify-between"><span>Arrived after {e.shift_start}</span><span>{hours.late_in} days</span></div>}
          {perf && <><div className="mt-2 flex justify-between"><span>Sales made</span><span>{num(perf.sales)}</span></div><div className="flex justify-between"><span>Tasks finished</span><span>{perf.tasks}</span></div><div className="flex justify-between"><span>Tickets solved</span><span>{perf.tickets}</span></div><div className="flex justify-between"><span>Actions in the system</span><span>{perf.actions}</span></div></>}
          {!perf && <p className="mt-2 text-xs text-slate-400">Link a login account above to see sales, tasks and activity.</p>}
        </div>
        <form action={saveOnboarding} className="card space-y-1 p-5 text-sm"><h3 className="mb-2 font-semibold">Onboarding checklist</h3><input type="hidden" name="employee_id" value={e.id} />
          {STEPS.map((st) => <label key={st} className="flex items-center gap-2"><input type="checkbox" name="step" value={st} defaultChecked={!!e.onboarding?.[st]} /> {st}</label>)}<Submit className="btn-ghost btn-sm">Save checklist</Submit></form>
        <div className="card p-5 text-sm"><h3 className="mb-2 font-semibold">Performance reviews</h3>
          {reviews.map((r) => <div key={r.id} className="mb-2 border-b border-slate-100 pb-2"><div className="font-medium">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} <span className="text-xs font-normal text-slate-400">{r.period} · {r.reviewer}</span></div>{r.strengths && <div>{r.strengths}</div>}{r.improve && <div className="text-slate-500">To improve: {r.improve}</div>}</div>)}
          <form action={saveReview} className="space-y-1"><input type="hidden" name="employee_id" value={e.id} /><div className="flex gap-1"><input name="period" placeholder="Period, e.g. 2026 H2" className="input" /><select name="rating" defaultValue="4" className="input w-20">{[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}</select></div>
            <input name="strengths" placeholder="Did well" className="input" /><input name="improve" placeholder="To improve" className="input" /><Submit className="btn-ghost btn-sm">Add review</Submit></form>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto"><div className="p-5 pb-2 font-semibold">Payslips</div>
          <table className="tbl"><tbody>{slips.map((p) => <tr key={p.id}><td>{p.month}</td><td className="capitalize text-slate-500">{p.status}</td><td className="text-right tabular-nums">{num(p.net)}</td><td className="text-right"><a href={`/print/payslip/${p.id}`} target="_blank" className="text-accent">Print</a></td></tr>)}
            {slips.length === 0 && <tr><td className="text-slate-400">No payslips yet</td></tr>}</tbody></table></div>
        <div className="card overflow-x-auto"><div className="p-5 pb-2 font-semibold">Leave</div>
          <table className="tbl"><tbody>{leaves.map((l) => <tr key={l.id}><td className="capitalize">{l.type}</td><td>{fmtDate(l.from_date)} – {fmtDate(l.to_date)}</td><td>{Number(l.days)} d</td><td className="capitalize">{l.status}</td></tr>)}
            {leaves.length === 0 && <tr><td className="text-slate-400">No leave taken</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
