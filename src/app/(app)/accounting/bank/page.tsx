import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureLedger } from "@/lib/accounting";
import { num, fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import AccountingTabs from "../tabs";
import { saveReconciliation } from "../actions";

export default async function BankRec({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const banks = await q<any>("SELECT id, code, name FROM accounts WHERE active AND (is_bank OR system_key IN ('cash','card','bank','tabby','tamara')) ORDER BY is_bank DESC, code");
  const acc = banks.find((b) => String(b.id) === sp.account_id) ?? banks.find((b) => b.name.toLowerCase().includes("bank")) ?? banks[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.statement_date ?? "") ? sp.statement_date : todayDubai();
  const lines = acc ? await q<any>(
    `SELECT l.*, e.date, e.number, e.memo emo FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
     WHERE l.account_id=$1 AND l.reconciliation_id IS NULL AND e.date <= $2 ORDER BY e.date, l.id`,
    [acc.id, date],
  ) : [];
  const cleared = acc ? await one<{ v: number }>("SELECT COALESCE(sum(debit - credit),0) v FROM journal_lines WHERE account_id=$1 AND reconciliation_id IS NOT NULL", [acc.id]) : null;
  const book = acc ? await one<{ v: number }>("SELECT COALESCE(sum(l.debit - l.credit),0) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=$1 AND e.date <= $2", [acc.id, date]) : null;
  const history = acc ? await q<any>("SELECT r.*, u.name FROM bank_reconciliations r LEFT JOIN users u ON u.id=r.created_by WHERE r.account_id=$1 ORDER BY r.id DESC LIMIT 10", [acc.id]) : [];
  return (
    <div className="max-w-5xl">
      <PageHeader title="Bank reconciliation" subtitle="Tick the items that appear on your bank or card statement until the balances match" />
      <AccountingTabs active="/accounting/bank" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div><label className="label">Account</label><select name="account_id" defaultValue={acc?.id} className="input w-64">{banks.map((b) => <option key={b.id} value={b.id}>{b.code} {b.name}</option>)}</select></div>
        <div><label className="label">Statement date</label><input type="date" name="statement_date" defaultValue={date} className="input w-40" /></div>
        <button className="btn-dark">Load</button>
      </form>
      {acc && (
        <form action={saveReconciliation} className="space-y-4">
          <input type="hidden" name="account_id" value={acc.id} /><input type="hidden" name="statement_date" value={date} />
          <div className="card grid gap-4 p-5 sm:grid-cols-3 text-sm">
            <div><div className="text-xs text-slate-500">Balance in the books on {fmtDate(date)}</div><div className="text-lg font-semibold">{num(book?.v)}</div></div>
            <div><div className="text-xs text-slate-500">Already reconciled</div><div className="text-lg font-semibold">{num(cleared?.v)}</div></div>
            <div><label className="label">Statement ending balance</label><input name="statement_balance" defaultValue={sp.statement_balance ?? ""} className="input" inputMode="decimal" required /></div>
          </div>
          <div className="card overflow-x-auto">
            {lines.length === 0 ? <Empty>Nothing waiting to be reconciled up to this date.</Empty> : (
              <table className="tbl">
                <thead><tr><th className="w-10"></th><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" name="line" value={l.id} className="h-4 w-4" /></td>
                    <td className="text-slate-500">{fmtDate(l.date)}</td>
                    <td className="font-mono text-xs">{l.number}</td>
                    <td>{l.memo || l.emo}</td>
                    <td className="text-right tabular-nums">{Number(l.debit) ? num(l.debit) : ""}</td>
                    <td className="text-right tabular-nums">{Number(l.credit) ? num(l.credit) : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <Submit>Save reconciliation</Submit>
          <p className="text-xs text-slate-400">It saves only when the reconciled total plus the ticked items equals the statement balance.</p>
        </form>
      )}
      {history.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">Past reconciliations</div>
          <table className="tbl"><thead><tr><th>Statement date</th><th className="text-right">Balance</th><th>By</th><th>Saved</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td>{fmtDate(h.statement_date)}</td><td className="text-right tabular-nums">{num(h.statement_balance)}</td><td>{h.name}</td><td className="text-slate-500">{fmtDate(h.created_at, true)}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
