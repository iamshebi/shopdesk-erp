import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ensureLedger } from "@/lib/accounting";
import { period } from "@/lib/period";
import { num } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AccountingTabs, { Period } from "../tabs";

const GROUPS: Record<string, string> = {
  sale: "Customer receipts", payment: "Customer receipts", sp: "Paid to suppliers", purchase: "Paid to suppliers", expense: "Expenses paid",
  buyback: "Used devices bought", move: "Stock adjustments", "": "Owner, loans and other (manual entries)",
};

export default async function CashFlow({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const s = await getSettings();
  const { from, to } = period(sp);
  const cashAcc = "(a.is_bank OR a.system_key IN ('cash','card','bank','tabby','tamara'))";
  const [open] = await q<{ v: number }>(`SELECT COALESCE(sum(l.debit - l.credit),0) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE ${cashAcc} AND e.date < $1`, [from]);
  const rows = await q<any>(
    `SELECT split_part(e.source, ':', 1) kind, sum(l.debit) inflow, sum(l.credit) outflow FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
     WHERE ${cashAcc} AND e.date BETWEEN $1 AND $2
       AND NOT EXISTS (SELECT 1 FROM journal_lines l2 JOIN accounts a2 ON a2.id=l2.account_id WHERE l2.entry_id=e.id AND l2.id<>l.id AND (a2.is_bank OR a2.system_key IN ('cash','card','bank','tabby','tamara')) AND e.source='')
     GROUP BY 1`,
    [from, to],
  );
  const grouped: Record<string, { in: number; out: number }> = {};
  for (const r of rows) {
    const g = GROUPS[r.kind] ?? "Other";
    grouped[g] = grouped[g] ?? { in: 0, out: 0 };
    grouped[g].in += Number(r.inflow); grouped[g].out += Number(r.outflow);
  }
  const net = Object.values(grouped).reduce((a, g) => a + g.in - g.out, 0);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Cash flow" subtitle={`Money in and out of cash, card, Tabby/Tamara and bank accounts · ${from} to ${to}`}><PrintButton /></PageHeader>
      <AccountingTabs active="/accounting/cashflow" />
      <Period from={from} to={to} path="/accounting/cashflow" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{s.currency}</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            <tr className="text-slate-500"><td>Opening balance</td><td colSpan={2}></td><td className="text-right tabular-nums">{num(open.v)}</td></tr>
            {Object.entries(grouped).map(([g, v]) => <tr key={g}><td>{g}</td><td className="text-right tabular-nums">{num(v.in)}</td><td className="text-right tabular-nums">{num(v.out)}</td><td className="text-right tabular-nums">{num(v.in - v.out)}</td></tr>)}
            <tr className="font-semibold"><td>Net change</td><td colSpan={2}></td><td className="text-right tabular-nums">{num(net)}</td></tr>
            <tr className="text-base font-bold"><td>Closing balance</td><td colSpan={2}></td><td className="text-right tabular-nums">{num(Number(open.v) + net)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">Moves between your own money accounts (e.g. card settlement to bank) are left out, so they don&apos;t count as money in and out.</p>
    </div>
  );
}
