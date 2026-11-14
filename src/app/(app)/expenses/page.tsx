import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { fmtDate, num, todayDubai, methodLabel } from "@/lib/util";
import Link from "next/link";
import { PageHeader, Empty, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { addExpense, deleteExpense } from "./actions";

const CATS = ["Rent", "Salaries", "DEWA / utilities", "Internet & phone", "Shop supplies", "Transport", "Marketing", "Licence & government fees", "Bank charges", "Repairs & maintenance", "General"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("expenses");
  const sp = await searchParams;
  const month = sp.month || todayDubai().slice(0, 7);
  const rows = await q<any>("SELECT e.*, u.name staff, (SELECT count(*)::int FROM files f WHERE f.kind='expense' AND f.owner_id=e.id) nfiles FROM expenses e LEFT JOIN users u ON u.id=e.created_by WHERE to_char(e.date,'YYYY-MM') = $1 ORDER BY e.date DESC, e.id DESC", [month]);
  const byCat = await q<{ category: string; total: number }>("SELECT category, sum(total) total FROM expenses WHERE to_char(date,'YYYY-MM') = $1 AND status='approved' GROUP BY 1 ORDER BY 2 DESC", [month]);
  const total = rows.filter((r) => r.status === "approved").reduce((a, r) => a + r.total, 0);
  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${month} · total ${num(total)}`}>
        <form><input type="month" name="month" defaultValue={month} className="input w-44" /></form>
      </PageHeader>
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={addExpense} className="card mb-6 grid gap-3 p-5 sm:grid-cols-7">
        <input type="date" name="date" defaultValue={todayDubai()} className="input" required />
        <input name="category" list="expcats" placeholder="Category" className="input" required />
        <datalist id="expcats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
        <input name="description" placeholder="Description" className="input sm:col-span-2" />
        <input name="total" placeholder="Amount paid" className="input" inputMode="decimal" required />
        <select name="method" className="input"><option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card</option></select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="has_vat" /> incl. VAT</label>
          <Submit className="btn-primary btn-sm">Add</Submit>
        </div>
      </form>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card overflow-x-auto">
          {rows.length === 0 ? <Empty>No expenses this month.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid by</th><th className="text-right">VAT</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td><td><Link href={`/expenses/${e.id}`} className="hover:text-accent">{e.category}</Link> {e.status !== "approved" && <Badge tone={e.status === "pending" ? "amber" : "red"}>{e.status}</Badge>}{e.nfiles > 0 && <span className="ml-1 text-xs text-slate-400">📎{e.nfiles}</span>}</td><td className="text-slate-500">{e.description}</td><td className="text-slate-500">{methodLabel(e.method)}</td>
                    <td className="text-right tabular-nums">{num(e.vat)}</td><td className="text-right tabular-nums font-medium">{num(e.total)}</td>
                    <td className="text-right">{can(user, "expenses.delete") && <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><Submit className="btn-ghost btn-sm" confirm="Delete this expense?">Delete</Submit></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card h-fit p-5">
          <h3 className="mb-3 font-semibold">By category</h3>
          {byCat.map((c) => (
            <div key={c.category} className="mb-2">
              <div className="flex justify-between text-sm"><span>{c.category}</span><span className="tabular-nums">{num(c.total)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.total / (total || 1)) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
