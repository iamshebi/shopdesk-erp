"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Submit from "./submit";

interface L { account_id: string; debit: string; credit: string; memo: string }
const n = (v: string) => Number(v) || 0;

export default function JournalForm({ action, accounts, today }: { action: (fd: FormData) => Promise<void>; accounts: { id: number; code: string; name: string }[]; today: string }) {
  const [lines, setLines] = useState<L[]>([{ account_id: "", debit: "", credit: "", memo: "" }, { account_id: "", debit: "", credit: "", memo: "" }]);
  const dr = lines.reduce((a, l) => a + n(l.debit), 0), cr = lines.reduce((a, l) => a + n(l.credit), 0);
  const set = (i: number, p: Partial<L>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div><label className="label">Date</label><input type="date" name="date" defaultValue={today} className="input" required /></div>
        <div><label className="label">Description</label><input name="memo" className="input" placeholder="e.g. Owner put cash into the business / Card settlement to bank" /></div>
      </div>
      <table className="tbl">
        <thead><tr><th>Account</th><th className="w-36">Debit</th><th className="w-36">Credit</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><select value={l.account_id} onChange={(e) => set(i, { account_id: e.target.value })} className="input"><option value="">Choose account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
              <td><input value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="input" inputMode="decimal" /></td>
              <td><input value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="input" inputMode="decimal" /></td>
              <td><input value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} className="input" /></td>
              <td>{lines.length > 2 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="btn-ghost btn-sm" aria-label="Remove line"><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td>Totals</td><td className="tabular-nums">{dr.toFixed(2)}</td><td className="tabular-nums">{cr.toFixed(2)}</td><td colSpan={2} className={Math.abs(dr - cr) < 0.005 && dr > 0 ? "text-emerald-700" : "text-red-600"}>{Math.abs(dr - cr) < 0.005 && dr > 0 ? "Balanced" : `Difference ${(dr - cr).toFixed(2)}`}</td></tr>
        </tbody>
      </table>
      <div className="flex gap-2">
        <button type="button" onClick={() => setLines((ls) => [...ls, { account_id: "", debit: "", credit: "", memo: "" }])} className="btn-ghost btn-sm"><Plus size={14} /> Line</button>
        <Submit>Save entry</Submit>
      </div>
    </form>
  );
}
