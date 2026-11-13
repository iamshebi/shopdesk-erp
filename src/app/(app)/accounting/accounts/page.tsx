import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureLedger, ACCOUNT_TYPES } from "@/lib/accounting";
import { num } from "@/lib/util";
import { PageHeader, Badge, Field } from "@/components/ui";
import Submit from "@/components/submit";
import AccountingTabs from "../tabs";
import { saveAccount } from "../actions";
import Link from "next/link";

export default async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const rows = await q<any>(
    `SELECT a.*, COALESCE(sum(l.debit - l.credit),0) dr, count(l.id)::int n FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id GROUP BY a.id ORDER BY a.code`,
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Chart of accounts" subtitle="Accounts the books are kept in. Expense categories get their own account automatically." />
      <AccountingTabs active="/accounting/accounts" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="card mb-6 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="text-right">Entries</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {ACCOUNT_TYPES.map((t) => (
              rows.filter((r) => r.type === t.id).map((r) => {
                const bal = ["asset", "expense"].includes(r.type) ? Number(r.dr) : -Number(r.dr);
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                    <td className="font-mono text-xs">{r.code}</td>
                    <td><Link href={`/accounting/ledger?account_id=${r.id}&from=2000-01-01`} className="font-medium hover:text-accent">{r.name}</Link>{r.system_key && <span className="ml-2 text-xs text-slate-400">built-in</span>}{r.is_bank && <span className="ml-2"><Badge tone="blue">bank</Badge></span>}</td>
                    <td>{t.label}</td>
                    <td className="text-right text-slate-500">{r.n}</td>
                    <td className="text-right tabular-nums">{num(bal)}</td>
                  </tr>
                );
              })
            ))}
          </tbody>
        </table>
      </div>
      <form action={saveAccount} className="card grid gap-3 p-6 sm:grid-cols-5">
        <h2 className="font-semibold sm:col-span-5">Add an account</h2>
        <Field label="Code"><input name="code" className="input" placeholder="e.g. 1021" required /></Field>
        <Field label="Name" className="sm:col-span-2"><input name="name" className="input" placeholder="e.g. Emirates NBD current account" required /></Field>
        <Field label="Type"><select name="type" className="input">{ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
        <div className="flex items-end gap-3"><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_bank" /> Bank</label><Submit>Add</Submit></div>
      </form>
    </div>
  );
}
