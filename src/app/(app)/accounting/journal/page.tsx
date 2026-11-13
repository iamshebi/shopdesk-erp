import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ensureLedger } from "@/lib/accounting";
import { period } from "@/lib/period";
import { num, fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import JournalForm from "@/components/journal-form";
import AccountingTabs, { Period } from "../tabs";
import { saveJournal, deleteJournal } from "../actions";

export default async function Journal({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const { from, to } = period(sp);
  const accounts = await q<any>("SELECT id, code, name FROM accounts WHERE active ORDER BY code");
  const entries = await q<any>(
    `SELECT e.*, u.name by_name, (SELECT json_agg(json_build_object('a', a.code || ' ' || a.name, 'd', l.debit, 'c', l.credit) ORDER BY l.id) FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.entry_id=e.id) lines
     FROM journal_entries e LEFT JOIN users u ON u.id=e.created_by WHERE e.date BETWEEN $1 AND $2 ${sp.manual ? "AND e.source=''" : ""} ORDER BY e.date DESC, e.id DESC LIMIT 300`,
    [from, to],
  );
  return (
    <div className="max-w-6xl">
      <PageHeader title="Journal entries" subtitle="Automatic entries from documents, plus your own (owner money, loans, card settlements, corrections)" />
      <AccountingTabs active="/accounting/journal" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6"><JournalForm action={saveJournal} accounts={accounts} today={todayDubai()} /></div>
      <Period from={from} to={to} path="/accounting/journal" extra={<label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="manual" value="1" defaultChecked={!!sp.manual} /> Manual only</label>} />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Number</th><th>Description</th><th>Lines</th><th></th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDate(e.date)}</td>
                <td className="font-mono text-xs">{e.number}{!e.source && <div><Badge tone="violet">manual</Badge></div>}</td>
                <td>{e.memo}{e.by_name && <div className="text-xs text-slate-400">{e.by_name}</div>}</td>
                <td className="text-xs">{(e.lines ?? []).map((l: any, i: number) => <div key={i} className="flex justify-between gap-4"><span className={Number(l.c) ? "pl-4" : ""}>{l.a}</span><span className="tabular-nums">{Number(l.d) ? `Dr ${num(l.d)}` : `Cr ${num(l.c)}`}</span></div>)}</td>
                <td>{!e.source && <form action={deleteJournal}><input type="hidden" name="id" value={e.id} /><Submit className="btn-ghost btn-sm" confirm="Delete this journal entry?">Delete</Submit></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
