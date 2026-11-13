import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { emailReady } from "@/lib/email";
import { fmtDate, num, waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { emailInvoice, markReminded } from "../actions";

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser(["sales.payments", "sales.all"]);
  const sp = await searchParams;
  const s = await getSettings();
  const canEmail = await emailReady();
  const rows = await q<any>(
    `SELECT s.id, s.number, s.date, s.total, s.customer_name, s.customer_phone, s.pay_link, s.last_reminder_at, c.email,
       to_char(COALESCE(s.due_date, s.date::date + 7),'YYYY-MM-DD') due, ((now() AT TIME ZONE 'Asia/Dubai')::date - COALESCE(s.due_date, s.date::date + 7))::int late, ${OUTSTANDING_SQL} outstanding
     FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.type='invoice' AND ${OUTSTANDING_SQL} > 0.004 ORDER BY late DESC`,
  );
  const bucket = (d: number) => (d <= 0 ? "Not yet due" : d <= 30 ? "1–30 days late" : d <= 60 ? "31–60 days" : d <= 90 ? "61–90 days" : "90+ days");
  const totals: Record<string, number> = {};
  rows.forEach((r) => { totals[bucket(r.late)] = (totals[bucket(r.late)] ?? 0) + Number(r.outstanding); });
  return (
    <div>
      <PageHeader title="Payment reminders" subtitle="Unpaid invoices by age, with one-tap WhatsApp or email reminders">
        <Link href="/sales/recurring" className="btn-ghost">Recurring invoices</Link>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {["Not yet due", "1–30 days late", "31–60 days", "61–90 days", "90+ days"].map((b) => <div key={b} className="card p-4"><div className="text-xs text-slate-500">{b}</div><div className="text-lg font-semibold tabular-nums">{num(totals[b] ?? 0)}</div></div>)}
      </div>
      <p className="mb-3 text-xs text-slate-500">Invoices without a due date are treated as due 7 days after the sale. {s.auto_reminders ? `Automatic email reminders are ON (every ${s.reminder_every_days} days).` : "Automatic email reminders are off (Settings → Integrations)."}</p>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="text-right">Owing ({s.currency})</th><th>Last reminder</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const text = `Hello ${r.customer_name || ""}, a friendly reminder from ${s.shop_name}: invoice ${r.number} has ${s.currency} ${num(r.outstanding)} due${r.late > 0 ? ` (${r.late} days overdue)` : ""}.${r.pay_link ? ` Pay online: ${r.pay_link}` : ""} Thank you!`;
              return (
                <tr key={r.id}>
                  <td><Link href={`/sales/${r.id}`} className="font-medium hover:text-accent">{r.number}</Link><div className="text-xs text-slate-400">{fmtDate(r.date)}</div></td>
                  <td>{r.customer_name || "—"}<div className="text-xs text-slate-400">{r.customer_phone}</div></td>
                  <td>{fmtDate(r.due)} {r.late > 0 && <Badge tone={r.late > 60 ? "red" : "amber"}>{r.late}d late</Badge>}</td>
                  <td className="text-right font-semibold tabular-nums">{num(r.outstanding)}</td>
                  <td className="text-slate-500">{r.last_reminder_at ? fmtDate(r.last_reminder_at, true) : "—"}</td>
                  <td className="text-right"><div className="flex justify-end gap-1">
                    {r.customer_phone && <form action={markReminded}><input type="hidden" name="id" value={r.id} /><a href={waLink(r.customer_phone, text)} target="_blank" className="btn-ghost btn-sm">WhatsApp</a></form>}
                    {canEmail && r.email && <form action={emailInvoice}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="reminder" value="1" /><input type="hidden" name="back" value="/sales/reminders" /><Submit className="btn-ghost btn-sm">Email</Submit></form>}
                    <form action={markReminded}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">Mark reminded</Submit></form>
                  </div></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">Nothing unpaid 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
