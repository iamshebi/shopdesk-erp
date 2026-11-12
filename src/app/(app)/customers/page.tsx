import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { num, fmtDate } from "@/lib/util";
import { PageHeader, Empty } from "@/components/ui";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("customers");
  const sp = await searchParams;
  const params: unknown[] = [];
  const where: string[] = [];
  if (sp.q) { params.push(`%${sp.q}%`); where.push("(c.name ILIKE $1 OR c.phone ILIKE $1 OR c.trn ILIKE $1)"); }
  const rows = await q<any>(
    `SELECT * FROM (
       SELECT c.*,
         COALESCE((SELECT sum(CASE WHEN s.type='invoice' THEN s.total ELSE -s.total END) FROM sales s WHERE s.customer_id=c.id),0) spent,
         COALESCE((SELECT sum(${OUTSTANDING_SQL}) FROM sales s WHERE s.customer_id=c.id AND s.type='invoice'),0) owes,
         (SELECT max(s.date) FROM sales s WHERE s.customer_id=c.id) last_visit
       FROM customers c ${where.length ? "WHERE " + where.join(" AND ") : ""}) x
     ${sp.due ? "WHERE owes > 0.004" : ""}
     ORDER BY last_visit DESC NULLS LAST, name LIMIT 300`,
    params,
  );
  return (
    <div>
      <PageHeader title="Customers" subtitle="Saved automatically from sales, repairs and buy-used" />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Name, phone or TRN…" className="input max-w-sm" />
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="due" defaultChecked={!!sp.due} /> Owes money</label>
        <button className="btn-dark">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No customers found.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Phone</th><th>TRN</th><th>Last visit</th><th className="text-right">Spent</th><th className="text-right">Owes</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/customers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link></td>
                  <td>{c.phone}</td>
                  <td className="font-mono text-xs">{c.trn}</td>
                  <td className="text-slate-500">{fmtDate(c.last_visit)}</td>
                  <td className="text-right tabular-nums">{num(c.spent)}</td>
                  <td className={`text-right tabular-nums ${c.owes > 0.004 ? "font-medium text-red-600" : "text-slate-400"}`}>{num(c.owes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
