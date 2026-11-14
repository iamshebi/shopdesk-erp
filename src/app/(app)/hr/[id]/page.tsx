import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import EmployeeForm from "@/components/employee-form";
import HrTabs from "../tabs";
import { saveEmployee } from "../actions";
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
