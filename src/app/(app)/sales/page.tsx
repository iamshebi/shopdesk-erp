import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { fmtDate, num, todayDubai } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("sales");
  const sp = await searchParams;
  const from = sp.from || new Date(Date.now() - 29 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const to = sp.to || todayDubai();
  const params: unknown[] = [from, to];
  const where = [`(s.date AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2`];
  if (sp.q) {
    params.push(`%${sp.q}%`);
    const i = params.length;
    where.push(`(s.number ILIKE $${i} OR s.customer_name ILIKE $${i} OR s.customer_phone ILIKE $${i} OR EXISTS (SELECT 1 FROM sale_items x WHERE x.sale_id=s.id AND (x.imei ILIKE $${i} OR x.description ILIKE $${i})))`);
  }
  if (sp.due) where.push(`s.type='invoice' AND ${OUTSTANDING_SQL} > 0.004`);
  const rows = await q<any>(
    `SELECT s.*, ${OUTSTANDING_SQL} outstanding, u.name cashier FROM sales s LEFT JOIN users u ON u.id = s.created_by
     WHERE ${where.join(" AND ")} ORDER BY s.date DESC, s.id DESC LIMIT 500`,
    params,
  );
  const inv = rows.filter((r) => r.type === "invoice");
  const cn = rows.filter((r) => r.type === "credit_note");
  const net = inv.reduce((a, r) => a + r.total, 0) - cn.reduce((a, r) => a + r.total, 0);
  return (
    <div>
      <PageHeader title="Invoices" subtitle={`${inv.length} invoices · ${cn.length} returns · net ${num(net)}`}>
        <Link href="/pos" className="btn-primary"><Plus size={16} /> New sale</Link>
      </PageHeader>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Invoice no., customer, phone, IMEI…" className="input max-w-xs" />
        <input type="date" name="from" defaultValue={from} className="input w-40" />
        <input type="date" name="to" defaultValue={to} className="input w-40" />
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="due" defaultChecked={!!sp.due} /> Unpaid only</label>
        <button className="btn-dark">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No invoices in this period.</Empty> : (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>By</th><th className="text-right">VAT</th><th className="text-right">Total</th><th className="text-right">Status</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/sales/${s.id}`} className="font-medium hover:text-accent">{s.number}</Link></td>
                  <td className="text-slate-500">{fmtDate(s.date, true)}</td>
                  <td>{s.customer_name || <span className="text-slate-400">Walk-in</span>}<div className="text-xs text-slate-400">{s.customer_phone}</div></td>
                  <td className="text-slate-500">{s.cashier}</td>
                  <td className="text-right tabular-nums">{num(s.vat)}</td>
                  <td className={`text-right tabular-nums font-medium ${s.type === "credit_note" ? "text-red-600" : ""}`}>{s.type === "credit_note" ? "−" : ""}{num(s.total)}</td>
                  <td className="text-right">
                    {s.type === "credit_note" ? <Badge tone="red">Return</Badge> : s.outstanding > 0.004 ? <Badge tone="amber">Due {num(s.outstanding)}</Badge> : <Badge tone="green">Paid</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
