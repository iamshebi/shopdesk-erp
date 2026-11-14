import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../tabs";
import { saveCommissionRates } from "../actions";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("payroll");
  const sp = await searchParams;
  const s = await getSettings();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayDubai().slice(0, 7);
  const rows = await q<any>(
    `SELECT u.id, u.name, u.commission_rate, u.commission_base,
       COALESCE(sum(CASE WHEN s.type='invoice' THEN s.total - s.vat ELSE -(s.total - s.vat) END),0)::float net,
       COALESCE(sum(CASE WHEN s.type='invoice' THEN s.total - s.vat - s.cost ELSE -(s.total - s.vat - s.cost) END),0)::float profit,
       count(s.id) FILTER (WHERE s.type='invoice')::int invoices
     FROM users u LEFT JOIN sales s ON COALESCE(s.sales_rep_id, s.created_by) = u.id AND to_char(s.date AT TIME ZONE 'Asia/Dubai','YYYY-MM') = $1
     WHERE u.active GROUP BY u.id ORDER BY net DESC`,
    [month],
  );
  const comm = (r: any) => Math.max(0, (r.commission_base === "sales" ? r.net : r.profit) * Number(r.commission_rate) / 100);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Sales commissions" subtitle="Commission per sales person from their invoices, less returns">
        <form><input type="month" name="month" defaultValue={month} className="input w-44" /></form>
      </PageHeader>
      <HrTabs active="/hr/commissions" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <form action={saveCommissionRates} className="card overflow-x-auto">
        <input type="hidden" name="month" value={month} />
        <table className="tbl">
          <thead><tr><th>Sales person</th><th className="text-right">Invoices</th><th className="text-right">Net sales</th><th className="text-right">Gross profit</th><th>Rate %</th><th>On</th><th className="text-right">Commission ({s.currency})</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td className="font-medium"><input type="hidden" name="uid" value={r.id} />{r.name}</td><td className="text-right">{r.invoices}</td><td className="text-right tabular-nums">{num(r.net)}</td><td className="text-right tabular-nums">{num(r.profit)}</td>
                <td><input name={`rate_${r.id}`} defaultValue={Number(r.commission_rate) || ""} className="input h-8 w-20" inputMode="decimal" /></td>
                <td><select name={`base_${r.id}`} defaultValue={r.commission_base} className="input h-8 w-28"><option value="profit">Profit</option><option value="sales">Net sales</option></select></td>
                <td className="text-right font-semibold tabular-nums">{num(comm(r))}</td></tr>
            ))}
            <tr className="font-semibold"><td colSpan={6} className="text-right">Total commission</td><td className="text-right tabular-nums">{num(rows.reduce((a, r) => a + comm(r), 0))}</td></tr>
          </tbody>
        </table>
        <div className="p-4"><Submit className="btn-dark">Save rates</Submit><span className="ml-3 text-xs text-slate-500">Add the commission as a bonus on the payroll for this month.</span></div>
      </form>
    </div>
  );
}
