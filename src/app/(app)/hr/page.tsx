import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import EmployeeForm from "@/components/employee-form";
import HrTabs from "./tabs";
import { saveEmployee } from "./actions";

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("hr");
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayDubai();
  const departments = await q<any>("SELECT * FROM departments ORDER BY name");
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const rows = await q<any>(
    `SELECT e.*, d.name dept, a.status today_status FROM employees e LEFT JOIN departments d ON d.id=e.department_id
     LEFT JOIN attendance a ON a.employee_id=e.id AND a.date=$1
     WHERE ${sp.all ? "TRUE" : "e.active"} ${sp.dept ? "AND e.department_id=$2" : ""} ORDER BY e.active DESC, e.name`,
    sp.dept ? [today, Number(sp.dept)] : [today],
  );
  const st = await one<any>(`SELECT count(*) FILTER (WHERE active)::int n, COALESCE(sum(basic_salary+allowances) FILTER (WHERE active),0) payroll,
    (SELECT count(*)::int FROM attendance WHERE date=$1 AND status IN ('present','late','half')) here,
    (SELECT count(*)::int FROM leave_requests WHERE status='pending') pending FROM employees`, [today]);
  return (
    <div>
      <PageHeader title="HR" subtitle="Staff records, attendance, leave and payroll" />
      <HrTabs active="/hr" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active employees" value={String(st.n)} />
        <Stat label="In today" value={`${st.here} / ${st.n}`} href="/hr/attendance" />
        <Stat label="Leave requests waiting" value={String(st.pending)} href="/hr/leave" />
        <Stat label="Monthly salaries" value={`${s.currency} ${num(st.payroll)}`} href="/hr/payroll" />
      </div>
      <details className="card mb-6 p-5" open={!!sp.add}>
        <summary className="cursor-pointer font-semibold">+ Add employee</summary>
        <div className="mt-4"><EmployeeForm action={saveEmployee} departments={departments} users={users} /></div>
      </details>
      <form className="mb-3 flex gap-2"><select name="dept" defaultValue={sp.dept ?? ""} className="input w-48"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="all" defaultChecked={!!sp.all} /> Include former staff</label><button className="btn-dark">Show</button></form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Department</th><th>Joined</th><th className="text-right">Salary ({s.currency})</th><th>Today</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                <td><Link href={`/hr/${e.id}`} className="font-medium hover:text-accent">{e.name}</Link><div className="text-xs text-slate-400">{e.code} · {e.designation}</div></td>
                <td>{e.dept ?? "—"}</td><td className="text-slate-500">{e.join_date ? fmtDate(e.join_date) : "—"}</td>
                <td className="text-right tabular-nums">{num(Number(e.basic_salary) + Number(e.allowances))}</td>
                <td>{e.today_status ? <Badge tone={e.today_status === "absent" ? "red" : e.today_status === "leave" ? "blue" : "green"}>{e.today_status}</Badge> : <span className="text-xs text-slate-400">not marked</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">No employees yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
