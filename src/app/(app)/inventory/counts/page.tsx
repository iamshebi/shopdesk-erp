import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge, Empty, Field } from "@/components/ui";
import Submit from "@/components/submit";
import InventoryTabs from "../tabs";
import { startCount } from "../actions";

export default async function CountsPage() {
  await requireUser("stock.adjust");
  const whs = await q<any>("SELECT id, name, is_default FROM warehouses WHERE active ORDER BY is_default DESC, name");
  const cats = await q<{ v: string }>("SELECT DISTINCT category v FROM products WHERE active AND category <> '' ORDER BY 1");
  const counts = await q<any>(
    `SELECT c.*, w.name wh, u.name by_name, (SELECT count(*)::int FROM stock_count_items i WHERE i.count_id=c.id) items,
       (SELECT count(*)::int FROM stock_count_items i WHERE i.count_id=c.id AND i.counted IS NOT NULL) done
     FROM stock_counts c JOIN warehouses w ON w.id=c.warehouse_id LEFT JOIN users u ON u.id=c.created_by ORDER BY c.id DESC LIMIT 50`,
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Inventory" subtitle="Count what is on the shelf and correct the system in one step" />
      <InventoryTabs active="/inventory/counts" />
      <form action={startCount} className="card mb-6 grid gap-3 p-6 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Start a stock count</h2>
        <Field label="Warehouse"><select name="warehouse_id" className="input">{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Only this category (optional)"><select name="category" className="input"><option value="">All products</option>{cats.map((c) => <option key={c.v}>{c.v}</option>)}</select></Field>
        <Field label="Note"><input name="notes" className="input" placeholder="e.g. Month-end count" /></Field>
        <div className="flex items-end"><Submit>Start count</Submit></div>
      </form>
      <div className="card overflow-x-auto">
        {counts.length === 0 ? <Empty>No stock counts yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Count</th><th>Warehouse</th><th>Started</th><th>By</th><th>Progress</th><th>Status</th></tr></thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/inventory/counts/${c.id}`} className="font-medium hover:text-accent">{c.number}</Link><div className="text-xs text-slate-400">{c.category || "All products"}</div></td>
                  <td>{c.wh}</td>
                  <td className="text-slate-500">{fmtDate(c.created_at, true)}</td>
                  <td>{c.by_name}</td>
                  <td>{c.done} / {c.items}</td>
                  <td>{c.status === "applied" ? <Badge tone="green">Applied</Badge> : <Badge tone="amber">Open</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
