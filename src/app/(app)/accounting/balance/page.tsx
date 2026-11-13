import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ensureLedger } from "@/lib/accounting";
import { num, todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AccountingTabs from "../tabs";

export default async function BalanceSheet({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const s = await getSettings();
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : todayDubai();
  const rows = await q<any>(
    `SELECT a.id, a.code, a.name, a.type, COALESCE(sum(l.debit - l.credit),0) dr FROM accounts a
     LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id
     WHERE e.date IS NULL OR e.date <= $1 GROUP BY a.id ORDER BY a.code`,
    [asOf],
  );
  const by = (t: string) => rows.filter((r) => r.type === t && Math.abs(Number(r.dr)) > 0.004);
  const assets = by("asset"), liab = by("liability"), eq = by("equity");
  const totalA = assets.reduce((a, r) => a + Number(r.dr), 0);
  const totalL = liab.reduce((a, r) => a - Number(r.dr), 0);
  const totalE = eq.reduce((a, r) => a - Number(r.dr), 0);
  const profit = rows.filter((r) => r.type === "income" || r.type === "expense").reduce((a, r) => a - Number(r.dr), 0);
  const section = (title: string, list: any[], sign: number, total: number) => (
    <>
      <tr><td className="font-semibold" colSpan={2}>{title}</td></tr>
      {list.map((r) => <tr key={r.id}><td className="pl-8">{r.code} {r.name}</td><td className="text-right tabular-nums">{num(sign * Number(r.dr))}</td></tr>)}
      <tr className="font-semibold"><td>Total {title.toLowerCase()}</td><td className="text-right tabular-nums">{num(total)}</td></tr>
    </>
  );
  const diff = totalA - (totalL + totalE + profit);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Balance sheet" subtitle={`As of ${asOf}`}><PrintButton /></PageHeader>
      <AccountingTabs active="/accounting/balance" />
      <form className="no-print mb-4 flex items-end gap-2"><div><label className="label">As of</label><input type="date" name="date" defaultValue={asOf} className="input w-40" /></div><button className="btn-dark">Show</button></form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{s.currency}</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {section("Assets", assets, 1, totalA)}
            {section("Liabilities", liab, -1, totalL)}
            {section("Equity", eq, -1, totalE)}
            <tr><td className="pl-8">Profit to date (not yet closed)</td><td className="text-right tabular-nums">{num(profit)}</td></tr>
            <tr className="text-base font-bold"><td>Liabilities + equity</td><td className="text-right tabular-nums">{num(totalL + totalE + profit)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-sm ${Math.abs(diff) < 0.01 ? "text-emerald-700" : "text-red-600"}`}>{Math.abs(diff) < 0.01 ? "Balanced: assets equal liabilities plus equity." : `Out of balance by ${num(diff)}. Check manual journal entries.`}</p>
    </div>
  );
}
