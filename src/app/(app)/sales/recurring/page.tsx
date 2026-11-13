import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, todayDubai } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { saveRecurring, toggleRecurring, runRecurringNow } from "../actions";

export default async function RecurringPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("sales.payments");
  const sp = await searchParams;
  const customers = await q<any>("SELECT id, name, phone FROM customers ORDER BY name LIMIT 1000");
  const rows = await q<any>("SELECT r.*, c.name cust, s.number last_no FROM recurring_invoices r JOIN customers c ON c.id=r.customer_id LEFT JOIN sales s ON s.id=r.last_sale_id ORDER BY r.active DESC, r.next_date");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Recurring invoices" subtitle="Monthly service fees, rent, maintenance contracts: invoiced automatically">
        <Link href="/sales/reminders" className="btn-ghost">Payment reminders</Link>
        <form action={runRecurringNow}><Submit className="btn-ghost">Run due now</Submit></form>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={saveRecurring} className="card mb-6 grid gap-3 p-5 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" placeholder="e.g. Monthly phone maintenance" /></div>
        <div className="sm:col-span-2"><label className="label">Customer</label><select name="customer_id" className="input" required><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone}</option>)}</select></div>
        <div><label className="label">Every</label><select name="every" defaultValue="month" className="input"><option value="week">Week</option><option value="month">Month</option><option value="quarter">3 months</option><option value="year">Year</option></select></div>
        <div><label className="label">First invoice on</label><input type="date" name="next_date" defaultValue={todayDubai()} className="input" required /></div>
        <div><label className="label">Stop after (optional)</label><input type="date" name="end_date" className="input" /></div>
        <div><label className="label">Pay within (days)</label><input name="due_days" defaultValue="7" className="input" inputMode="numeric" /></div>
        <div className="sm:col-span-4"><label className="label">Lines: description | qty | price (one per line)</label><textarea name="lines" rows={3} className="input font-mono text-sm" placeholder={"Maintenance contract | 1 | 500\nData SIM | 2 | 50"} required /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="auto_email" /> Email the invoice to the customer automatically</label>
        <div><Submit>Save</Submit></div>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Customer</th><th>Every</th><th className="text-right">Amount</th><th>Next</th><th>Made</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <td className="font-medium">{r.name}</td><td>{r.cust}</td><td className="capitalize">{r.every}</td>
                <td className="text-right tabular-nums">{num((r.lines as any[]).reduce((a, l) => a + Number(l.qty) * Number(l.price), 0))}</td>
                <td>{r.active ? fmtDate(r.next_date) : <Badge tone="slate">stopped</Badge>}</td>
                <td>{r.runs}{r.last_sale_id && <Link href={`/sales/${r.last_sale_id}`} className="ml-1 text-xs text-accent">{r.last_no}</Link>}</td>
                <td className="text-right"><div className="flex justify-end gap-1">
                  {r.active && <form action={runRecurringNow}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">Invoice now</Submit></form>}
                  <form action={toggleRecurring}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">{r.active ? "Stop" : "Restart"}</Submit></form></div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400">No recurring invoices</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
