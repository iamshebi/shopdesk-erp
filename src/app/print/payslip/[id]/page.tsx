import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate } from "@/lib/util";
import PrintButton from "@/components/print-button";

export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("payroll");
  const { id } = await params;
  const s = await getSettings();
  const p = await one<any>(`SELECT p.*, r.month, r.status, r.paid_date, e.name, e.code, e.designation, e.iban, d.name dept FROM payslips p JOIN payroll_runs r ON r.id=p.run_id
    JOIN employees e ON e.id=p.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE p.id=$1`, [Number(id)]);
  if (!p) notFound();
  const Row = ({ l, v, neg }: { l: string; v: number; neg?: boolean }) => Number(v) ? <tr><td className="py-1">{l}</td><td className="py-1 text-right tabular-nums">{neg ? "−" : ""}{num(v)}</td></tr> : null;
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-slate-800">
      <div className="no-print mb-4"><PrintButton /></div>
      <div className="mb-6 flex justify-between border-b pb-4">
        <div><div className="text-lg font-bold">{s.legal_name || s.shop_name}</div><div className="text-slate-500">{s.address}</div></div>
        <div className="text-right"><div className="text-lg font-semibold">Payslip</div><div>{p.month}</div>{p.paid_date && <div className="text-slate-500">Paid {fmtDate(p.paid_date)}</div>}</div>
      </div>
      <table className="mb-6 w-full"><tbody>
        <tr><td className="text-slate-500">Employee</td><td>{p.name} ({p.code})</td><td className="text-slate-500">Department</td><td>{p.dept ?? "—"}</td></tr>
        <tr><td className="text-slate-500">Designation</td><td>{p.designation || "—"}</td><td className="text-slate-500">Days paid</td><td>{Number(p.days_paid)}</td></tr>
        <tr><td className="text-slate-500">IBAN</td><td colSpan={3}>{p.iban || "—"}</td></tr>
      </tbody></table>
      <table className="w-full border-t"><tbody>
        <Row l="Basic salary" v={p.basic} /><Row l="Allowances" v={p.allowances} /><Row l="Overtime" v={p.overtime} /><Row l="Bonus" v={p.bonus} />
        <Row l={`Deductions${Number(p.unpaid_days) ? ` (${Number(p.unpaid_days)} unpaid days)` : ""}`} v={p.deductions} neg />
        <tr className="border-t text-base font-bold"><td className="py-2">Net pay ({s.currency})</td><td className="py-2 text-right">{num(p.net)}</td></tr>
      </tbody></table>
      {p.note && <p className="mt-3 text-slate-500">{p.note}</p>}
      <div className="mt-16 flex justify-between text-slate-500"><div>Employer signature</div><div>Employee signature</div></div>
    </div>
  );
}
