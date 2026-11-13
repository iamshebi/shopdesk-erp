import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, todayDubai } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../../tabs";
import { savePayslips, setPayrollStatus } from "../../actions";

export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("payroll");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const r = await one<any>("SELECT * FROM payroll_runs WHERE id=$1", [Number(id)]);
  if (!r) notFound();
  const slips = await q<any>("SELECT p.*, e.name, e.code, e.iban FROM payslips p JOIN employees e ON e.id=p.employee_id WHERE run_id=$1 ORDER BY e.name", [r.id]);
  const draft = r.status === "draft";
  const tot = (k: string) => num(slips.reduce((a, p) => a + Number(p[k]), 0));
  return (
    <div>
      <PageHeader title={`Payroll ${r.month}`} subtitle={`${slips.length} employees · net ${s.currency} ${num(r.total)}`}><Badge tone={draft ? "amber" : r.status === "paid" ? "green" : "blue"}>{r.status}</Badge></PageHeader>
      <HrTabs active="/hr/payroll" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={savePayslips} className="card mb-6 overflow-x-auto">
        <input type="hidden" name="run_id" value={r.id} />
        <table className="tbl">
          <thead><tr><th>Employee</th><th className="text-right">Days paid</th><th className="text-right">Basic</th><th className="text-right">Allowances</th><th className="text-right">Overtime</th><th className="text-right">Bonus</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {slips.map((p) => (
              <tr key={p.id}>
                <td><input type="hidden" name="slip" value={p.id} />{p.name}<div className="text-xs text-slate-400">{p.code}{!p.iban && " · no IBAN"}</div></td>
                <td className="text-right">{Number(p.days_paid)}{Number(p.unpaid_days) > 0 && <div className="text-xs text-red-500">−{Number(p.unpaid_days)} unpaid</div>}</td>
                <td className="text-right tabular-nums">{num(p.basic)}</td><td className="text-right tabular-nums">{num(p.allowances)}</td><td className="text-right tabular-nums">{num(p.overtime)}</td>
                <td className="text-right">{draft ? <input name={`bonus_${p.id}`} defaultValue={Number(p.bonus) || ""} className="input w-24 text-right" inputMode="decimal" /> : num(p.bonus)}</td>
                <td className="text-right">{draft ? <input name={`ded_${p.id}`} defaultValue={Number(p.deductions) || ""} className="input w-24 text-right" inputMode="decimal" /> : num(p.deductions)}</td>
                <td className="text-right font-semibold tabular-nums">{num(p.net)}</td>
                <td>{draft ? <input name={`note_${p.id}`} defaultValue={p.note} className="input w-36" /> : p.note}</td>
                <td><a href={`/print/payslip/${p.id}`} target="_blank" className="text-xs text-accent">Payslip</a></td>
              </tr>
            ))}
            <tr className="font-semibold"><td>Total</td><td></td><td className="text-right">{tot("basic")}</td><td className="text-right">{tot("allowances")}</td><td className="text-right">{tot("overtime")}</td><td className="text-right">{tot("bonus")}</td><td className="text-right">{tot("deductions")}</td><td className="text-right">{tot("net")}</td><td colSpan={2}></td></tr>
          </tbody>
        </table>
        {draft && <div className="p-4"><Submit className="btn-dark">Save changes</Submit></div>}
      </form>
      <div className="flex flex-wrap gap-3">
        {draft && <form action={setPayrollStatus}><input type="hidden" name="run_id" value={r.id} /><input type="hidden" name="status" value="approved" /><Submit>Approve payroll</Submit></form>}
        {r.status === "approved" && <>
          <form action={setPayrollStatus} className="card flex flex-wrap items-end gap-2 p-4"><input type="hidden" name="run_id" value={r.id} /><input type="hidden" name="status" value="paid" />
            <div><label className="label">Paid from</label><select name="method" className="input w-32"><option value="bank">Bank</option><option value="cash">Cash</option></select></div>
            <div><label className="label">Date</label><input type="date" name="paid_date" defaultValue={todayDubai()} className="input w-40" /></div>
            <Submit>Mark as paid</Submit></form>
          <form action={setPayrollStatus}><input type="hidden" name="run_id" value={r.id} /><input type="hidden" name="status" value="draft" /><Submit className="btn-ghost">Back to draft</Submit></form>
        </>}
        {!draft && (
          <form action={`/api/wps/${r.id}`} method="get" className="card flex flex-wrap items-end gap-2 p-4">
            <div><label className="label">Employer ID (MOHRE)</label><input name="employer" defaultValue={s.wps_employer_id ?? ""} className="input w-40" /></div>
            <div><label className="label">Employer bank routing</label><input name="bank" defaultValue={s.wps_bank_routing ?? ""} className="input w-40" /></div>
            <button className="btn-ghost">Download WPS SIF file</button>
          </form>
        )}
      </div>
    </div>
  );
}
