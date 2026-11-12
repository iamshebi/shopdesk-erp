import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { Plus, Upload } from "lucide-react";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("products");
  const sp = await searchParams;
  const s = await getSettings();
  const term = (sp.q ?? "").trim();
  const cat = sp.cat ?? "";
  const filter = sp.f ?? "";
  const params: unknown[] = [];
  const where: string[] = ["p.active"];
  if (term) {
    params.push(`%${term}%`, term);
    const a = params.length - 1, b = params.length;
    where.push(`(p.name ILIKE $${a} OR p.brand ILIKE $${a} OR p.sku ILIKE $${a} OR p.barcode = $${b} OR EXISTS (SELECT 1 FROM units u WHERE u.product_id = p.id AND u.imei ILIKE $${a}))`);
  }
  if (cat) {
    params.push(cat);
    where.push(`p.category = $${params.length}`);
  }
  const rows = await q<any>(
    `SELECT * FROM (SELECT p.*, ${STOCK_SQL} AS stock FROM products p WHERE ${where.join(" AND ")}) x
     ${filter === "low" ? "WHERE NOT is_service AND reorder_level > 0 AND stock <= reorder_level" : ""}
     ORDER BY category, brand, name LIMIT 500`,
    params,
  );
  const cats = await q<{ category: string; n: number }>("SELECT category, count(*)::int n FROM products WHERE active AND category <> '' GROUP BY 1 ORDER BY 1");
  const totals = await q<{ items: number; value: number }>(
    `SELECT count(*)::int items, COALESCE(sum(CASE WHEN p.track_serial THEN (SELECT COALESCE(sum(u.cost),0) FROM units u WHERE u.product_id=p.id AND u.status='in_stock') ELSE p.stock_qty * p.cost END),0) AS value
     FROM products p WHERE p.active AND NOT p.is_service`,
  );
  return (
    <div>
      <PageHeader title="Stock" subtitle={`${totals[0].items} products · stock value ${s.currency} ${num(totals[0].value)} at cost`}>
        <Link href="/products/import" className="btn-ghost"><Upload size={16} /> Import CSV</Link>
        <Link href="/products/new" className="btn-primary"><Plus size={16} /> Add product</Link>
      </PageHeader>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={term} placeholder="Search name, brand, SKU, barcode or IMEI…" className="input max-w-md" autoFocus />
        <select name="cat" defaultValue={cat} className="input w-48">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.category} value={c.category}>{c.category} ({c.n})</option>)}
        </select>
        <select name="f" defaultValue={filter} className="input w-40">
          <option value="">All stock</option>
          <option value="low">Low stock only</option>
        </select>
        <button className="btn-dark">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No products yet. Add one or import your list from Excel/CSV.</Empty>
        ) : (
          <table className="tbl">
            <thead><tr><th>Product</th><th>Category</th><th>SKU</th><th className="text-right">Cost</th><th className="text-right">Price</th><th className="text-right">In stock</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/products/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                    <div className="text-xs text-slate-400">{p.brand}{p.track_serial && " · IMEI tracked"}{p.is_service && " · service"}</div>
                  </td>
                  <td className="text-slate-500">{p.category}</td>
                  <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                  <td className="text-right tabular-nums text-slate-500">{num(p.cost)}</td>
                  <td className="text-right tabular-nums font-medium">{num(p.price)}</td>
                  <td className="text-right tabular-nums">
                    {p.is_service ? "—" : p.stock <= 0 || p.stock <= p.reorder_level ? <Badge tone={p.stock <= 0 ? "red" : "amber"}>{p.stock}</Badge> : p.stock}
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
