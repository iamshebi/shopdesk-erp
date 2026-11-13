import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ATT_STATUSES } from "@/lib/hr";
import { todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../tabs";
import { saveAttendance } from "../actions";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("hr");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : todayDubai();
  const month = (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) ? sp.month : date.slice(0, 7);
  const rows = await q<any>(`SELECT e.id, e.name, e.code, a.status, a.check_in, a.check_out, a.overtime_hours FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND a.date=$1 WHERE e.active ORDER BY e.name`, [date]);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const grid = await q<any>(`SELECT employee_id, extract(day FROM date)::int d, status FROM attendance WHERE to_char(date,'YYYY-MM')=$1`, [month]);
  const cell = (e: number, d: number) => grid.find((g) => g.employee_id === e && g.d === d)?.status;
  const short = (st?: string) => ATT_STATUSES.find((x) => x.id === st);
  const color: Record<string, string> = { green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-700", slate: "bg-slate-100 text-slate-500" };
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark who came in, late, absent or on leave" />
      <HrTabs active="/hr/attendance" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form className="mb-3 flex gap-2"><input type="date" name="date" defaultValue={date} className="input w-44" /><button className="btn-dark">Open day</button></form>
      <form action={saveAttendance} className="card mb-8 overflow-x-auto">
        <input type="hidden" name="date" value={date} />
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th>Overtime h</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><input type="hidden" name="emp" value={r.id} />{r.name}<div className="text-xs text-slate-400">{r.code}</div></td>
                <td><select name={`status_${r.id}`} defaultValue={r.status ?? ""} className="input w-36"><option value="">— not marked —</option>{ATT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
                <td><input type="time" name={`in_${r.id}`} defaultValue={r.check_in ?? ""} className="input w-32" /></td>
                <td><input type="time" name={`out_${r.id}`} defaultValue={r.check_out ?? ""} className="input w-32" /></td>
                <td><input name={`ot_${r.id}`} defaultValue={Number(r.overtime_hours) || ""} className="input w-20" inputMode="decimal" /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">Add employees first</td></tr>}
          </tbody>
        </table>
        {rows.length > 0 && <div className="p-4"><Submit>Save attendance</Submit></div>}
      </form>
      <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Month view {month}</h3>
        <form className="flex gap-2"><input type="month" name="month" defaultValue={month} className="input w-40" /><input type="hidden" name="date" value={date} /><button className="btn-ghost btn-sm">Show</button></form></div>
      <div className="card overflow-x-auto p-3">
        <table className="text-xs">
          <thead><tr><th className="pr-3 text-left">Employee</th>{Array.from({ length: days }, (_, i) => <th key={i} className="w-7 text-center font-normal text-slate-400">{i + 1}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="whitespace-nowrap pr-3">{r.name}</td>
              {Array.from({ length: days }, (_, i) => { const st = short(cell(r.id, i + 1)); return <td key={i} className="p-0.5 text-center">{st ? <span className={`block rounded px-0.5 py-0.5 ${color[st.tone]}`}>{st.short}</span> : <span className="text-slate-200">·</span>}</td>; })}
            </tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-xs text-slate-400">{ATT_STATUSES.map((s) => `${s.short} = ${s.label}`).join(" · ")}</p>
      </div>
    </div>
  );
}
