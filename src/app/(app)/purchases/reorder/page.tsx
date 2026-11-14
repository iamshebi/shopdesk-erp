import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";
import { num } from "@/lib/util";
import { PageHeader } from "@/components/ui";

export default async function ReorderPage() {
  await requireUser("purchases");
  const rows = await q<any>(
    `SELECT * FROM (SELECT p.id, p.name, p.sku, p.cost, p.reorder_level, ${STOCK_SQL} AS stock,
        COALESCE((SELECT sum(si.qty) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.type='invoice' AND s.date > now() - interval '30 days'),0)::int sold30,
        COALESCE((SELECT sum(i.qty - i.received_qty) FROM purchase_order_items i JOIN purchase_orders o ON o.id=i.po_id WHERE i.product_id=p.id AND o.status IN ('request','approved','ordered','partial')),0)::int on_order,
        (SELECT pu.supplier_id FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id WHERE pi.product_id=p.id ORDER BY pu.id DESC LIMIT 1) last_supplier
      FROM products p WHERE p.active AND p.status='active' AND NOT p.is_service) x
     WHERE stock + on_order <= GREATEST(reorder_level, 0) OR (sold30 > 0 AND stock + on_order < sold30 / 2.0) ORDER BY (stock <= 0) DESC, sold30 DESC LIMIT 300`,
  );
  const suppliers = await q<any>("SELECT id, name FROM suppliers");
  const withQty = rows.map((r) => ({ ...r, suggest: Math.max(1, Math.max(r.reorder_level * 2, r.sold30) - r.stock - r.on_order) }));
  const groups = new Map<number, typeof withQty>();
  withQty.forEach((r) => { const k = r.last_supplier ?? 0; groups.set(k, [...(groups.get(k) ?? []), r]); });
  return (
    <div>
      <PageHeader title="Reorder suggestions" subtitle="Products at or below their reorder level, or selling faster than stock will last. Suggested quantity covers about a month of sales.">
        <Link href="/purchases/orders" className="btn-ghost">Purchase orders</Link>
      </PageHeader>
      {[...groups.entries()].map(([sid, list]) => (
        <div key={sid} className="card mb-6 overflow-x-auto">
          <div className="flex items-center justify-between p-5 pb-2"><div className="font-semibold">{suppliers.find((s) => s.id === sid)?.name ?? "No supplier yet"}</div>
            <Link href={`/purchases/orders/new?${sid ? `supplier=${sid}&` : ""}items=${list.map((r) => `${r.id}:${r.suggest}`).join(",")}`} className="btn-primary btn-sm">Create purchase request ({list.length})</Link></div>
          <table className="tbl">
            <thead><tr><th>Product</th><th className="text-right">In stock</th><th className="text-right">On order</th><th className="text-right">Reorder level</th><th className="text-right">Sold (30 d)</th><th className="text-right">Suggest</th><th className="text-right">Cost</th></tr></thead>
            <tbody>{list.map((r) => <tr key={r.id}><td><Link href={`/products/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link><div className="text-xs text-slate-400">{r.sku}</div></td>
              <td className={`text-right ${r.stock <= 0 ? "font-semibold text-red-600" : ""}`}>{r.stock}</td><td className="text-right">{r.on_order}</td><td className="text-right">{r.reorder_level}</td><td className="text-right">{r.sold30}</td><td className="text-right font-semibold">{r.suggest}</td><td className="text-right tabular-nums">{num(r.suggest * r.cost)}</td></tr>)}</tbody>
          </table>
        </div>
      ))}
      {rows.length === 0 && <div className="card p-6 text-sm text-slate-400">Nothing needs reordering. Set a reorder level on each product to get suggestions.</div>}
    </div>
  );
}
