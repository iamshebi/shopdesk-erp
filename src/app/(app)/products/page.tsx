import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import BulkBar from "@/components/bulk-bar";
import { Plus, Upload, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { bulkProducts } from "./actions";

const PAGE = 50;
const SORTS: Record<string, string> = {
  name: "category, brand, name", newest: "id DESC", price_desc: "price DESC", price_asc: "price ASC",
  stock_asc: "stock ASC NULLS LAST", stock_desc: "stock DESC NULLS LAST", margin: "margin DESC NULLS LAST", updated: "updated_at DESC",
};
const STATUS_TONE: Record<string, string> = { active: "green", draft: "amber", inactive: "slate" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("products.view");
  const showCost = can(user, "products.cost");
  const canEdit = can(user, "products.edit");
  const sp = await searchParams;
  const s = await getSettings();
  const term = (sp.q ?? "").trim();
  const sort = SORTS[sp.sort ?? ""] ? sp.sort : "name";
  const page = Math.max(1, Number(sp.page) || 1);
  const params: unknown[] = [];
  const where: string[] = [sp.archived ? "NOT p.active" : "p.active"];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("$?", `$${params.length}`)); };
  if (term) {
    params.push(`%${term}%`, term);
    const a = params.length - 1, b = params.length;
    where.push(`(p.name ILIKE $${a} OR p.brand ILIKE $${a} OR p.sku ILIKE $${a} OR p.tags ILIKE $${a} OR p.barcode = $${b} OR EXISTS (SELECT 1 FROM units u WHERE u.product_id = p.id AND u.imei ILIKE $${a}))`);
  }
  if (sp.cat) add("p.category = $?", sp.cat);
  if (sp.brand) add("p.brand = $?", sp.brand);
  if (sp.status) add("p.status = $?", sp.status);
  if (sp.tag) add("(', ' || p.tags || ',') ILIKE $?", `%, ${sp.tag},%`);
  const stockFilter = sp.f === "low" ? "WHERE NOT is_service AND reorder_level > 0 AND stock <= reorder_level AND stock > 0" : sp.f === "out" ? "WHERE NOT is_service AND stock <= 0" : sp.f === "in" ? "WHERE NOT is_service AND stock > 0" : "";
  const base = `SELECT * FROM (SELECT p.*, ${STOCK_SQL} AS stock, CASE WHEN p.price > 0 AND p.cost > 0 THEN (p.price - p.cost) / p.price * 100 END AS margin
                FROM products p WHERE ${where.join(" AND ")}) x ${stockFilter}`;
  const [rows, countRow] = await Promise.all([
    q<any>(`${base} ORDER BY ${SORTS[sort]} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, params),
    q<{ n: number }>(`SELECT count(*)::int n FROM (${base}) c`, params),
  ]);
  const total = countRow[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const [cats, brands, tagRows, totals] = await Promise.all([
    q<{ v: string; n: number }>("SELECT category v, count(*)::int n FROM products WHERE active AND category <> '' GROUP BY 1 ORDER BY 1"),
    q<{ v: string; n: number }>("SELECT brand v, count(*)::int n FROM products WHERE active AND brand <> '' GROUP BY 1 ORDER BY 1"),
    q<{ v: string }>("SELECT DISTINCT trim(t) v FROM products, unnest(string_to_array(tags, ',')) t WHERE active AND trim(t) <> '' ORDER BY 1"),
    q<{ items: number; value: number }>(
      `SELECT count(*)::int items, COALESCE(sum(CASE WHEN p.track_serial THEN (SELECT COALESCE(sum(u.cost),0) FROM units u WHERE u.product_id=p.id AND u.status='in_stock') ELSE GREATEST(p.stock_qty,0) * p.cost END),0) AS value
       FROM products p WHERE p.active AND NOT p.is_service`,
    ),
  ]);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v !== undefined && v !== "" && k !== "ok") u.set(k, String(v));
    return `/products?${u.toString()}`;
  };
  const backUrl = qs({});
  return (
    <div>
      <PageHeader title="Products & stock" subtitle={`${totals[0].items} products${showCost ? ` · stock value ${s.currency} ${num(totals[0].value)} at cost` : ""}`}>
        {can(user, "products.import") && <Link href="/products/import" className="btn-ghost"><Upload size={16} /> Import</Link>}
        {canEdit && <Link href="/products/new" className="btn-primary"><Plus size={16} /> Add product</Link>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={term} placeholder="Search name, brand, SKU, tag, barcode or IMEI…" className="input max-w-sm" />
        <select name="cat" defaultValue={sp.cat ?? ""} className="input w-44"><option value="">All categories</option>{cats.map((c) => <option key={c.v} value={c.v}>{c.v} ({c.n})</option>)}</select>
        <select name="brand" defaultValue={sp.brand ?? ""} className="input w-40"><option value="">All brands</option>{brands.map((b) => <option key={b.v} value={b.v}>{b.v} ({b.n})</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-36"><option value="">Any status</option><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select>
        {tagRows.length > 0 && <select name="tag" defaultValue={sp.tag ?? ""} className="input w-36"><option value="">Any tag</option>{tagRows.map((t) => <option key={t.v}>{t.v}</option>)}</select>}
        <select name="f" defaultValue={sp.f ?? ""} className="input w-36"><option value="">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
        <select name="sort" defaultValue={sort} className="input w-44">
          <option value="name">Sort: category, name</option><option value="newest">Newest first</option><option value="updated">Recently changed</option>
          <option value="price_desc">Price high → low</option><option value="price_asc">Price low → high</option>
          <option value="stock_asc">Stock low → high</option><option value="stock_desc">Stock high → low</option>
          {showCost && <option value="margin">Best margin</option>}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={!!sp.archived} /> Archived</label>
        <button className="btn-dark">Apply</button>
        {(term || sp.cat || sp.brand || sp.status || sp.tag || sp.f || sp.archived) && <Link href="/products" className="btn-ghost">Clear</Link>}
      </form>

      <form action={bulkProducts}>
        <input type="hidden" name="back" value={backUrl} />
        <BulkBar categories={cats.map((c) => c.v)} brands={brands.map((b) => b.v)} canEdit={canEdit} canExport={can(user, "data") || canEdit} />
        <div className="card overflow-x-auto">
          {rows.length === 0 ? (
            <Empty>{total === 0 && !term && !sp.cat ? "No products yet. Add one or import your list from Excel/CSV." : "No products match these filters."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-8"><ArrowUpDown size={12} className="opacity-0" /></th>
                  <th>Product</th><th>Category</th><th>Status</th><th>SKU</th>
                  {showCost && <th className="text-right">Cost</th>}<th className="text-right">Price</th>{showCost && <th className="text-right">Margin</th>}<th className="text-right">In stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} className="h-4 w-4 accent-[var(--accent)]" /></td>
                    <td>
                      <Link href={`/products/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                      <div className="text-xs text-slate-400">
                        {p.brand}{p.track_serial && " · IMEI tracked"}{p.is_service && " · service"}{p.featured && " · ★ featured"}{!p.website_visible && " · hidden on website"}
                        {p.tags && <> · {p.tags}</>}
                      </div>
                    </td>
                    <td className="text-slate-500">{p.category}</td>
                    <td><Badge tone={STATUS_TONE[p.status] ?? "slate"}>{p.status}</Badge></td>
                    <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                    {showCost && <td className="text-right tabular-nums text-slate-500">{num(p.cost)}</td>}
                    <td className="text-right tabular-nums font-medium">
                      {p.discount_price ? <><span className="mr-1 text-xs text-slate-400 line-through">{num(p.price)}</span>{num(p.discount_price)}</> : num(p.price)}
                    </td>
                    {showCost && <td className="text-right tabular-nums text-slate-500">{p.margin == null ? "—" : `${Number(p.margin).toFixed(0)}%`}</td>}
                    <td className="text-right tabular-nums">
                      {p.is_service ? "—" : p.stock <= 0 || p.stock <= p.reorder_level ? <Badge tone={p.stock <= 0 ? "red" : "amber"}>{p.stock}</Badge> : p.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </form>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={qs({ page: page - 1 })} className="btn-ghost btn-sm"><ChevronLeft size={14} /> Previous</Link> : <span className="btn-ghost btn-sm opacity-40"><ChevronLeft size={14} /> Previous</span>}
            <span className="px-2 py-1.5">Page {page} of {pages}</span>
            {page < pages ? <Link href={qs({ page: page + 1 })} className="btn-ghost btn-sm">Next <ChevronRight size={14} /></Link> : <span className="btn-ghost btn-sm opacity-40">Next <ChevronRight size={14} /></span>}
          </div>
        </div>
      )}
    </div>
  );
}
