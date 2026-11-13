import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ensureLedger } from "@/lib/accounting";
import { period } from "@/lib/period";
import { num } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AccountingTabs, { Period } from "../tabs";

export default async function ProfitLoss({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const s = await getSettings();
  const { from, to } = period(sp);
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const pFrom = new Date(Date.parse(from) - len * 864e5).toISOString().slice(0, 10), pTo = new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10);
  const rows = await q<any>(
    `SELECT a.id, a.code, a.name, a.type, a.system_key,
       COALESCE(sum(CASE WHEN e.date BETWEEN $1 AND $2 THEN (CASE WHEN a.type='income' THEN l.credit - l.debit ELSE l.debit - l.credit END) END),0) cur,
       COALESCE(sum(CASE WHEN e.date BETWEEN $3 AND $4 THEN (CASE WHEN a.type='income' THEN l.credit - l.debit ELSE l.debit - l.credit END) END),0) prev
     FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.entry_id
     WHERE a.type IN ('income','expense') GROUP BY a.id ORDER BY a.code`,
    [from, to, pFrom, pTo],
  );
  const sum = (f: (r: any) => boolean, k: "cur" | "prev") => rows.filter(f).reduce((a, r) => a + Number(r[k]), 0);
  const inc = (k: "cur" | "prev") => sum((r) => r.type === "income", k);
  const cogs = (k: "cur" | "prev") => sum((r) => r.system_key === "cogs", k);
  const exp = (k: "cur" | "prev") => sum((r) => r.type === "expense" && r.system_key !== "cogs", k);
  const line = (label: string, cur: number, prev: number, bold = false) => (
    <tr className={bold ? "font-semibold" : ""}><td className={bold ? "" : "pl-8"}>{label}</td><td className="text-right tabular-nums">{num(cur)}</td><td className="text-right tabular-nums text-slate-500">{num(prev)}</td></tr>
  );
  const shown = (r: any) => Number(r.cur) || Number(r.prev);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Profit & loss" subtitle={`${from} to ${to}, compared with ${pFrom} to ${pTo}`}><PrintButton /></PageHeader>
      <AccountingTabs active="/accounting/pl" />
      <Period from={from} to={to} path="/accounting/pl" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{s.currency}</th><th className="text-right">This period</th><th className="text-right">Previous period</th></tr></thead>
          <tbody>
            <tr><td className="font-semibold" colSpan={3}>Income</td></tr>
            {rows.filter((r) => r.type === "income" && shown(r)).map((r) => <tr key={r.id}><td className="pl-8">{r.code} {r.name}</td><td className="text-right tabular-nums">{num(r.cur)}</td><td className="text-right tabular-nums text-slate-500">{num(r.prev)}</td></tr>)}
            {line("Total income", inc("cur"), inc("prev"), true)}
            {line("Cost of goods sold", cogs("cur"), cogs("prev"))}
            {line("Gross profit", inc("cur") - cogs("cur"), inc("prev") - cogs("prev"), true)}
            <tr><td className="font-semibold" colSpan={3}>Expenses</td></tr>
            {rows.filter((r) => r.type === "expense" && r.system_key !== "cogs" && shown(r)).map((r) => <tr key={r.id}><td className="pl-8">{r.code} {r.name}</td><td className="text-right tabular-nums">{num(r.cur)}</td><td className="text-right tabular-nums text-slate-500">{num(r.prev)}</td></tr>)}
            {line("Total expenses", exp("cur"), exp("prev"), true)}
            <tr className="text-base font-bold"><td>Net profit</td><td className="text-right tabular-nums">{num(inc("cur") - cogs("cur") - exp("cur"))}</td><td className="text-right tabular-nums text-slate-500">{num(inc("prev") - cogs("prev") - exp("prev"))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
