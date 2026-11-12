import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, methodLabel, todayDubai, fmtDate } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import ReportTabs from "@/components/report-tabs";
import PrintButton from "@/components/print-button";

const L = (col: string) => `(${col} AT TIME ZONE 'Asia/Dubai')::date = $1`;

export default async function DayClose({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("reports");
  const sp = await searchParams;
  const s = await getSettings();
  const day = sp.day || todayDubai();
  const ins = await q<any>(`SELECT pm.method, sum(pm.amount) v FROM payments pm JOIN sales s ON s.id=pm.sale_id WHERE s.type='invoice' AND ${L("pm.created_at")} GROUP BY 1 ORDER BY 2 DESC`, [day]);
  const refunds = await q<any>(`SELECT pm.method, sum(pm.amount) v FROM payments pm JOIN sales s ON s.id=pm.sale_id WHERE s.type='credit_note' AND ${L("pm.created_at")} GROUP BY 1`, [day]);
  const buy = await q<any>(`SELECT payment_method method, sum(price_paid) v FROM buybacks WHERE ${L("created_at")} GROUP BY 1`, [day]);
  const exps = await q<any>("SELECT method, sum(total) v FROM expenses WHERE date = $1 GROUP BY 1", [day]);
  const sup = await q<any>(`SELECT method, sum(amount) v FROM supplier_payments WHERE ${L("created_at")} GROUP BY 1`, [day]);
  const sales = await one<any>(`SELECT count(*) FILTER (WHERE type='invoice')::int n, COALESCE(sum(CASE WHEN type='invoice' THEN total ELSE -total END),0) v, COALESCE(sum(CASE WHEN type='invoice' THEN vat ELSE -vat END),0) vat FROM sales s WHERE ${L("s.date")}`, [day]);
  const methods = Array.from(new Set([...ins, ...refunds, ...buy, ...exps, ...sup].map((r) => r.method)));
  const get = (arr: any[], m: string) => arr.find((r) => r.method === m)?.v ?? 0;
  const cashNet = get(ins, "cash") - get(refunds, "cash") - get(buy, "cash") - get(exps, "cash") - get(sup, "cash");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Day close" subtitle={fmtDate(day)}>
        <form className="no-print flex gap-2"><input type="date" name="day" defaultValue={day} className="input w-44" /><button className="btn-dark">Go</button></form>
        <PrintButton />
      </PageHeader>
      <div className="no-print"><ReportTabs active="/reports/day" /></div>
      <div className="card mb-6 grid gap-4 p-6 sm:grid-cols-3">
        <div><div className="label">Invoices</div><div className="text-2xl font-semibold">{sales.n}</div></div>
        <div><div className="label">Net sales</div><div className="text-2xl font-semibold tabular-nums">{num(sales.v)}</div></div>
        <div><div className="label">VAT collected</div><div className="text-2xl font-semibold tabular-nums">{num(sales.vat)}</div></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Method</th><th className="text-right">Received</th><th className="text-right">Refunds</th><th className="text-right">Used phones bought</th><th className="text-right">Expenses</th><th className="text-right">Paid suppliers</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            {methods.map((m) => {
              const net = get(ins, m) - get(refunds, m) - get(buy, m) - get(exps, m) - get(sup, m);
              return (
                <tr key={m}><td className="font-medium">{methodLabel(m)}</td><td className="text-right tabular-nums">{num(get(ins, m))}</td><td className="text-right tabular-nums">{num(get(refunds, m))}</td>
                  <td className="text-right tabular-nums">{num(get(buy, m))}</td><td className="text-right tabular-nums">{num(get(exps, m))}</td><td className="text-right tabular-nums">{num(get(sup, m))}</td><td className="text-right font-semibold tabular-nums">{num(net)}</td></tr>
              );
            })}
            {methods.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400">No money movement on this day.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card mt-6 flex items-center justify-between p-6">
        <div><div className="font-semibold">Expected cash in drawer from today</div><div className="text-xs text-slate-500">Cash received − cash refunds − cash paid out. Add your opening float.</div></div>
        <div className="text-3xl font-semibold tabular-nums">{s.currency} {num(cashNet)}</div>
      </div>
    </div>
  );
}
