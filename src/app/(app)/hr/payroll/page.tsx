import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../tabs";
import { buildPayroll } from "../actions";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("payroll");
  const sp = await searchParams;
  const s = await getSettings();
  const runs = await q<any>("SELECT r.*, (SELECT count(*)::int FROM payslips p WHERE p.run_id=r.id) n FROM payroll_runs r ORDER BY month DESC");
  const tone: Record<string, string> = { draft: "amber", approved: "blue", paid: "green" };
  return (
    <div className="max-w-4xl">
      <PageHeader title="Payroll" subtitle="Monthly salaries from attendance, unpaid leave and overtime, with WPS file" />
      <HrTabs active="/hr/payroll" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={buildPayroll} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div><label className="label">Month</label><input type="month" name="month" defaultValue={todayDubai().slice(0, 7)} className="input w-44" /></div>
        <Submit>Prepare payroll</Submit>
        <p className="text-xs text-slate-500">Daily rate = monthly gross ÷ 30. Absences and unpaid leave are deducted; overtime is paid at 125% of basic hourly rate.</p>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Month</th><th>Employees</th><th className="text-right">Net total ({s.currency})</th><th>Status</th><th>Paid</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}><td><Link href={`/hr/payroll/${r.id}`} className="font-medium hover:text-accent">{r.month}</Link></td><td>{r.n}</td>
                <td className="text-right tabular-nums">{num(r.total)}</td><td><Badge tone={tone[r.status]}>{r.status}</Badge></td><td className="text-slate-500">{r.paid_date ? fmtDate(r.paid_date) : "—"}</td></tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">No payroll yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
