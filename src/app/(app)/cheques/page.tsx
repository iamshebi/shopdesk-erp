import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, todayDubai } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import PrintButton from "@/components/print-button";
import { addCheque, setChequeStatus } from "./actions";

const TONE: Record<string, string> = { pending: "blue", deposited: "violet", cleared: "green", bounced: "red", returned: "slate", cancelled: "slate" };
const ACTIONS: Record<string, { status: string; label: string }[]> = {
  pending: [{ status: "deposited", label: "Deposited" }, { status: "cleared", label: "Cleared" }, { status: "bounced", label: "Bounced" }, { status: "returned", label: "Returned" }, { status: "cancelled", label: "Cancel" }],
  deposited: [{ status: "cleared", label: "Cleared" }, { status: "bounced", label: "Bounced" }],
  bounced: [{ status: "deposited", label: "Deposit again" }, { status: "returned", label: "Returned" }, { status: "cancelled", label: "Cancel" }],
};

export default async function ChequesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("cheques");
  const sp = await searchParams;
  const dir = sp.dir === "issued" ? "issued" : "received";
  const status = sp.status || "open";
  const today = todayDubai();
  const where = status === "open" ? "status IN ('pending','deposited','bounced')" : status === "all" ? "TRUE" : "status = $2";
  const rows = await q<any>(`SELECT * FROM cheques WHERE direction=$1 AND ${where} ORDER BY due_date, id LIMIT 300`, status === "open" || status === "all" ? [dir] : [dir, status]);
  const sum = async (sql: string) => (await one<{ n: number; v: number }>(sql, [today]))!;
  const dueWeek = await sum("SELECT count(*)::int n, COALESCE(sum(amount),0) v FROM cheques WHERE direction='received' AND status='pending' AND due_date BETWEEN $1::date AND $1::date + 7");
  const overdue = await sum("SELECT count(*)::int n, COALESCE(sum(amount),0) v FROM cheques WHERE direction='received' AND status='pending' AND due_date < $1::date");
  const toPay = await sum("SELECT count(*)::int n, COALESCE(sum(amount),0) v FROM cheques WHERE direction='issued' AND status IN ('pending','deposited') AND due_date <= $1::date + 7");
  const bounced = await sum("SELECT count(*)::int n, COALESCE(sum(amount),0) v FROM cheques WHERE status='bounced' AND $1::date IS NOT NULL");
  const names = await q<{ name: string }>(dir === "received" ? "SELECT name FROM customers ORDER BY name LIMIT 500" : "SELECT name FROM suppliers ORDER BY name LIMIT 500");
  const tab = (d: string, label: string) => <Link href={`/cheques?dir=${d}`} className={`rounded-lg px-3 py-1.5 text-sm ${dir === d ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{label}</Link>;

  return (
    <div className="max-w-6xl">
      <PageHeader title="Cheques (PDC)" subtitle="Post-dated cheques you receive from customers and give to suppliers"><PrintButton /></PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card p-4"><div className="label">To deposit in the next 7 days</div><div className="text-xl font-semibold tabular-nums">{num(dueWeek.v)}</div><div className="text-xs text-slate-500">{dueWeek.n} received cheque{dueWeek.n === 1 ? "" : "s"}</div></div>
        <div className={`card p-4 ${overdue.n ? "bg-amber-50" : ""}`}><div className="label">Past date, not deposited</div><div className="text-xl font-semibold tabular-nums">{num(overdue.v)}</div><div className="text-xs text-slate-500">{overdue.n} cheque{overdue.n === 1 ? "" : "s"}</div></div>
        <div className="card p-4"><div className="label">Our cheques due in 7 days</div><div className="text-xl font-semibold tabular-nums">{num(toPay.v)}</div><div className="text-xs text-slate-500">{toPay.n} issued · keep the bank funded</div></div>
        <div className={`card p-4 ${bounced.n ? "bg-red-50" : ""}`}><div className="label">Bounced, not settled</div><div className="text-xl font-semibold tabular-nums">{num(bounced.v)}</div><div className="text-xs text-slate-500">{bounced.n} cheque{bounced.n === 1 ? "" : "s"}</div></div>
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">{tab("received", "Received from customers")}{tab("issued", "Issued to suppliers")}</div>
        <form className="flex gap-2">
          <input type="hidden" name="dir" value={dir} />
          <select name="status" defaultValue={status} className="input w-44">
            <option value="open">Open (pending, deposited, bounced)</option><option value="pending">Pending</option><option value="deposited">Deposited</option><option value="cleared">Cleared</option><option value="bounced">Bounced</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option><option value="all">All</option>
          </select>
          <button className="btn-dark">Show</button>
        </form>
      </div>

      <form action={addCheque} className="no-print card mb-6 grid gap-3 p-5 sm:grid-cols-6">
        <h2 className="font-semibold sm:col-span-6">{dir === "received" ? "Add a cheque received" : "Add a cheque we issued"}</h2>
        <input type="hidden" name="direction" value={dir} />
        <input name="party" list="cheque-names" placeholder={dir === "received" ? "Customer name" : "Supplier name"} className="input sm:col-span-2" required />
        <datalist id="cheque-names">{names.map((n) => <option key={n.name} value={n.name} />)}</datalist>
        <input name="number" placeholder="Cheque no." className="input" required />
        <input name="bank" placeholder="Bank" className="input" />
        <input name="amount" placeholder="Amount" inputMode="decimal" className="input" required />
        <label className="text-xs text-slate-500">Cheque date<input type="date" name="due_date" defaultValue={today} className="input mt-1" required /></label>
        <input name="reference" placeholder="Invoice or bill no. (optional)" className="input sm:col-span-2" />
        <input name="notes" placeholder="Note" className="input sm:col-span-3" />
        <div className="flex items-end"><Submit>Add cheque</Submit></div>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No cheques here.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Cheque date</th><th>{dir === "received" ? "Customer" : "Supplier"}</th><th>Cheque no.</th><th>Bank</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th className="no-print">Mark as</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const late = c.status === "pending" && c.due_date < today;
                return (
                  <tr key={c.id} className={late ? "bg-amber-50/60" : ""}>
                    <td className="whitespace-nowrap">{fmtDate(c.due_date)}{late && <span className="ml-1 text-xs text-amber-700">past date</span>}</td>
                    <td>{c.party}{c.notes ? <div className="text-xs text-slate-500">{c.notes}</div> : null}</td>
                    <td>{c.number}</td><td>{c.bank}</td><td>{c.reference}</td>
                    <td className="text-right tabular-nums">{num(c.amount)}</td>
                    <td><Badge tone={TONE[c.status]}>{c.status}</Badge></td>
                    <td className="no-print">
                      <div className="flex flex-wrap gap-1">
                        {(ACTIONS[c.status] ?? []).map((a) => (
                          <form key={a.status} action={setChequeStatus}>
                            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value={a.status} />
                            <Submit className="btn-ghost btn-sm" confirm={a.status === "bounced" || a.status === "cancelled" ? `Mark cheque ${c.number} as ${a.status}?` : undefined}>{a.label}</Submit>
                          </form>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
