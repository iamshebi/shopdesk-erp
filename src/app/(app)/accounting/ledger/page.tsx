import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureLedger } from "@/lib/accounting";
import { period } from "@/lib/period";
import { num, fmtDate } from "@/lib/util";
import { PageHeader, Empty } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AccountingTabs, { Period } from "../tabs";

const SOURCE_LINK: Record<string, (id: string) => string> = {
  sale: (id) => `/sales/${id}`, purchase: (id) => `/purchases/${id}`, expense: () => `/expenses`, buyback: (id) => `/print/buyback/${id}`, move: () => `/inventory/moves`,
};

export default async function Ledger({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const { from, to } = period(sp);
  const accounts = await q<any>("SELECT id, code, name FROM accounts WHERE active ORDER BY code");
  const acc = accounts.find((a) => String(a.id) === sp.account_id || a.name === sp.account) ?? accounts[0];
  const opening = acc ? await one<{ v: number }>("SELECT COALESCE(sum(l.debit - l.credit),0) v FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=$1 AND e.date < $2", [acc.id, from]) : null;
  const rows = acc ? await q<any>(
    `SELECT l.*, e.date, e.number, e.memo emo, e.source FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id
     WHERE l.account_id=$1 AND e.date BETWEEN $2 AND $3 ORDER BY e.date, e.id, l.id`,
    [acc.id, from, to],
  ) : [];
  let run = Number(opening?.v ?? 0);
  return (
    <div className="max-w-6xl">
      <PageHeader title="General ledger" subtitle={acc ? `${acc.code} ${acc.name}` : ""}><PrintButton /></PageHeader>
      <AccountingTabs active="/accounting/ledger" />
      <Period from={from} to={to} path="/accounting/ledger" extra={<div><label className="label">Account</label><select name="account_id" defaultValue={acc?.id} className="input w-72">{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></div>} />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            <tr className="text-slate-500"><td colSpan={5}>Opening balance</td><td className="text-right tabular-nums">{num(run)}</td></tr>
            {rows.length === 0 && <tr><td colSpan={6}><Empty>No entries in this period.</Empty></td></tr>}
            {rows.map((r) => {
              run += Number(r.debit) - Number(r.credit);
              const [kind, id] = String(r.source).split(":");
              const href = SOURCE_LINK[kind]?.(id);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(r.date)}</td>
                  <td className="font-mono text-xs">{href ? <Link href={href} className="hover:text-accent">{r.number}</Link> : r.number}</td>
                  <td>{r.memo || r.emo}</td>
                  <td className="text-right tabular-nums">{Number(r.debit) ? num(r.debit) : ""}</td>
                  <td className="text-right tabular-nums">{Number(r.credit) ? num(r.credit) : ""}</td>
                  <td className="text-right tabular-nums font-medium">{num(run)}</td>
                </tr>
              );
            })}
            <tr className="font-semibold"><td colSpan={5}>Closing balance (debit +, credit −)</td><td className="text-right tabular-nums">{num(run)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
