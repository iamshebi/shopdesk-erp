import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/util";
import { PageHeader, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import { addSupplier } from "./actions";

export default async function SuppliersPage() {
  await requireUser("suppliers");
  const rows = await q<any>(
    `SELECT s.*, COALESCE(sum(p.total),0) bought, COALESCE(sum(p.total - p.paid),0) balance, count(p.id)::int bills
     FROM suppliers s LEFT JOIN purchases p ON p.supplier_id = s.id GROUP BY s.id ORDER BY s.name`,
  );
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Who you buy stock from, and what you still owe them" />
      <form action={addSupplier} className="card mb-6 grid gap-3 p-5 sm:grid-cols-6">
        <input name="name" placeholder="Supplier name" className="input sm:col-span-2" required />
        <input name="phone" placeholder="Phone" className="input" />
        <input name="trn" placeholder="TRN" className="input" />
        <input name="address" placeholder="Address" className="input" />
        <Submit>Add supplier</Submit>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No suppliers yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>Phone</th><th>TRN</th><th className="text-right">Bills</th><th className="text-right">Total bought</th><th className="text-right">We owe</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium"><Link href={`/purchases?supplier=${s.id}`} className="hover:text-accent">{s.name}</Link></td>
                  <td>{s.phone}</td>
                  <td className="font-mono text-xs">{s.trn}</td>
                  <td className="text-right">{s.bills}</td>
                  <td className="text-right tabular-nums">{num(s.bought)}</td>
                  <td className={`text-right tabular-nums font-medium ${s.balance > 0 ? "text-red-600" : ""}`}>{num(s.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
