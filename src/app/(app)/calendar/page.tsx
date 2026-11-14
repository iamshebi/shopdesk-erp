import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";

const TONE: Record<string, string> = { task: "bg-blue-100 text-blue-800", followup: "bg-amber-100 text-amber-800", leave: "bg-violet-100 text-violet-800", order: "bg-emerald-100 text-emerald-800", po: "bg-slate-200 text-slate-700", due: "bg-red-100 text-red-700", holiday: "bg-pink-100 text-pink-800", recurring: "bg-teal-100 text-teal-800", expiry: "bg-orange-100 text-orange-800" };
const LABEL: Record<string, string> = { task: "Tasks", followup: "Follow-ups", leave: "Leave", order: "Orders expected", po: "Supplier deliveries", due: "Invoices due", holiday: "Holidays", recurring: "Recurring invoices", expiry: "Stock expiring" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayDubai();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`, to = `${month}-${String(days).padStart(2, "0")}`;
  const P = [from, to];
  const ev: { d: string; kind: string; title: string; href: string }[] = [];
  const add = (rows: any[], kind: string) => rows.forEach((r) => ev.push({ d: r.d, kind, title: r.title, href: r.href }));
  const D = (c: string) => `to_char(${c},'YYYY-MM-DD')`;
  if (can(user, "tasks")) add(await q(`SELECT ${D("due_date")} d, title, '/tasks/' || id href FROM tasks WHERE status <> 'done' AND due_date BETWEEN $1 AND $2 ${sp.mine ? `AND assignee_id=${Number(user.id)}` : ""}`, P), "task");
  if (can(user, "crm")) add(await q(`SELECT ${D("a.due_date")} d, COALESCE(c.name, l.name, '') || ': ' || a.body title, CASE WHEN a.customer_id IS NOT NULL THEN '/customers/' || a.customer_id ELSE '/crm/leads/' || a.lead_id END href
    FROM crm_activities a LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN leads l ON l.id=a.lead_id WHERE a.type='followup' AND NOT a.done AND a.due_date BETWEEN $1 AND $2`, P), "followup");
  if (can(user, "hr")) add(await q(`SELECT ${D("g::date")} d, e.name || ' (' || l.type || ' leave)' title, '/hr/leave' href FROM leave_requests l JOIN employees e ON e.id=l.employee_id, generate_series(GREATEST(l.from_date, $1::date), LEAST(l.to_date, $2::date), interval '1 day') g WHERE l.status='approved' AND l.to_date >= $1 AND l.from_date <= $2`, P), "leave");
  if (can(user, "orders")) add(await q(`SELECT ${D("expected_date")} d, number || ' ' || customer_name title, '/orders/' || id href FROM orders WHERE kind='order' AND status IN ('draft','confirmed','packed') AND expected_date BETWEEN $1 AND $2`, P), "order");
  if (can(user, "purchases")) add(await q(`SELECT ${D("o.expected_date")} d, o.number || ' ' || COALESCE(s.name,'') title, '/purchases/orders/' || o.id href FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id WHERE o.status IN ('approved','ordered','partial') AND o.expected_date BETWEEN $1 AND $2`, P), "po");
  if (can(user, "sales.payments")) {
    add(await q(`SELECT ${D("s.due_date")} d, s.number || ' ' || s.customer_name title, '/sales/' || s.id href FROM sales s WHERE s.type='invoice' AND s.total > s.paid AND s.due_date BETWEEN $1 AND $2`, P), "due");
    add(await q(`SELECT ${D("r.next_date")} d, r.name title, '/sales/recurring' href FROM recurring_invoices r WHERE r.active AND r.next_date BETWEEN $1 AND $2`, P), "recurring");
  }
  if (can(user, "products.view")) add(await q(`SELECT ${D("b.expiry_date")} d, p.name || ' batch ' || b.batch_no || ' (' || b.qty || ')' title, '/products/' || p.id href FROM batches b JOIN products p ON p.id=b.product_id WHERE b.qty > 0 AND b.expiry_date BETWEEN $1 AND $2`, P), "expiry");
  add(await q(`SELECT ${D("date")} d, name title, '/hr/holidays' href FROM holidays WHERE date BETWEEN $1 AND $2`, P), "holiday");
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const kinds = [...new Set(ev.map((e) => e.kind))];
  return (
    <div>
      <PageHeader title="Calendar" subtitle={first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}>
        <Link href={`/calendar?m=${shift(-1)}${sp.mine ? "&mine=1" : ""}`} className="btn-ghost">← Previous</Link>
        <Link href="/calendar" className="btn-ghost">Today</Link>
        <Link href={`/calendar?m=${shift(1)}${sp.mine ? "&mine=1" : ""}`} className="btn-ghost">Next →</Link>
        <Link href={`/calendar?m=${month}${sp.mine ? "" : "&mine=1"}`} className="btn-ghost">{sp.mine ? "Everyone's tasks" : "Only my tasks"}</Link>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">{kinds.map((k) => <span key={k} className={`rounded px-2 py-0.5 ${TONE[k]}`}>{LABEL[k]}</span>)}</div>
      <div className="card overflow-x-auto p-2">
        <div className="grid min-w-[760px] grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="p-1 text-center font-medium text-slate-500">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const ds = `${month}-${String(d).padStart(2, "0")}`;
            const list = ev.filter((e) => e.d === ds);
            return (
              <div key={i} className={`min-h-24 rounded-lg border p-1 ${ds === today ? "border-accent bg-accent/5" : "border-slate-100"}`}>
                <div className={`mb-1 text-right ${ds === today ? "font-bold text-accent" : "text-slate-400"}`}>{d}</div>
                <div className="space-y-0.5">{list.slice(0, 5).map((e, k) => <Link key={k} href={e.href} className={`block truncate rounded px-1 py-0.5 ${TONE[e.kind]}`} title={e.title}>{e.title}</Link>)}{list.length > 5 && <div className="text-slate-400">+{list.length - 5} more</div>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
