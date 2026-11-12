import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import ProductForm from "@/components/product-form";
import Submit from "@/components/submit";
import { updateProduct, toggleProduct, adjustStock, addUnits, writeOffUnit } from "../actions";

const UNIT_TONE: Record<string, string> = { in_stock: "green", sold: "slate", written_off: "red", returned: "amber" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("products");
  const { id } = await params;
  const sp = await searchParams;
  const p = await one<any>(`SELECT p.*, ${STOCK_SQL} AS stock FROM products p WHERE p.id=$1`, [Number(id)]);
  if (!p) notFound();
  const cats = await q<{ v: string }>("SELECT DISTINCT category v FROM products WHERE category <> '' ORDER BY 1");
  const brands = await q<{ v: string }>("SELECT DISTINCT brand v FROM products WHERE brand <> '' ORDER BY 1");
  const units = p.track_serial
    ? await q<any>(
        `SELECT u.*, s.number sale_no, s.id sale_id2 FROM units u LEFT JOIN sales s ON s.id = u.sale_id
         WHERE u.product_id=$1 ORDER BY (u.status='in_stock') DESC, u.created_at DESC LIMIT 300`,
        [p.id],
      )
    : [];
  const sold = await one<{ qty: number; revenue: number }>(
    `SELECT COALESCE(sum(CASE WHEN s.type='invoice' THEN si.qty ELSE -si.qty END),0)::int qty,
            COALESCE(sum(CASE WHEN s.type='invoice' THEN si.total ELSE -si.total END),0) revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id=$1`,
    [p.id],
  );
  const canAdjust = user.role !== "cashier";
  return (
    <div className="max-w-5xl">
      <PageHeader title={p.name} subtitle={`${p.brand || "No brand"} · ${p.category || "Uncategorised"}${p.active ? "" : " · archived"}`}>
        <Link href={`/pos?add=${p.id}`} className="btn-primary">Sell</Link>
        <form action={toggleProduct}>
          <input type="hidden" name="id" value={p.id} />
          <Submit className="btn-ghost">{p.active ? "Archive" : "Restore"}</Submit>
        </form>
      </PageHeader>
      {sp.saved && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">Saved.</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><div className="text-xs text-slate-500">In stock</div><div className="mt-1 text-2xl font-semibold">{p.is_service ? "—" : p.stock}</div></div>
        <div className="card p-5"><div className="text-xs text-slate-500">Units sold (all time)</div><div className="mt-1 text-2xl font-semibold">{sold?.qty ?? 0}</div></div>
        <div className="card p-5"><div className="text-xs text-slate-500">Revenue (all time)</div><div className="mt-1 text-2xl font-semibold">{num(sold?.revenue)}</div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ProductForm action={updateProduct} product={p} categories={cats.map((c) => c.v)} brands={brands.map((b) => b.v)} />
        <div className="space-y-6">
          {!p.track_serial && !p.is_service && canAdjust && (
            <form action={adjustStock} className="card space-y-3 p-5">
              <h3 className="font-semibold">Adjust stock</h3>
              <p className="text-xs text-slate-500">Use + to add (e.g. stock count found more) or − to remove (damaged, lost). Purchases add stock automatically.</p>
              <input type="hidden" name="id" value={p.id} />
              <div className="flex gap-2">
                <input name="delta" className="input" placeholder="+5 or -2" inputMode="numeric" required />
                <Submit className="btn-dark">Apply</Submit>
              </div>
            </form>
          )}
          {p.track_serial && canAdjust && (
            <form action={addUnits} className="card space-y-3 p-5">
              <h3 className="font-semibold">Add IMEIs to stock</h3>
              <p className="text-xs text-slate-500">For opening stock. New deliveries should go through Purchases.</p>
              <input type="hidden" name="id" value={p.id} />
              <textarea name="imeis" rows={3} className="input font-mono" placeholder="One IMEI per line" required />
              <input name="cost" className="input" placeholder={`Unit cost (default ${num(p.cost)})`} inputMode="decimal" />
              <Submit className="btn-dark">Add to stock</Submit>
            </form>
          )}
        </div>
      </div>
      {p.track_serial && (
        <div className="card mt-6 overflow-x-auto">
          <div className="p-5 pb-2 font-semibold">Units ({units.length})</div>
          {units.length === 0 ? (
            <Empty>No units yet.</Empty>
          ) : (
            <table className="tbl">
              <thead><tr><th>IMEI / Serial</th><th>Status</th><th>Source</th><th className="text-right">Cost</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs"><Link href={`/imei?q=${u.imei}`} className="hover:text-accent">{u.imei}</Link></td>
                    <td>
                      <Badge tone={UNIT_TONE[u.status]}>{u.status.replace("_", " ")}</Badge>
                      {u.margin_scheme && <span className="ml-1"><Badge tone="violet">margin VAT</Badge></span>}
                    </td>
                    <td className="text-slate-500 capitalize">{u.source}{u.sale_no && <> · <Link href={`/sales/${u.sale_id2}`} className="link">{u.sale_no}</Link></>}</td>
                    <td className="text-right tabular-nums">{num(u.cost)}</td>
                    <td className="text-slate-500">{fmtDate(u.created_at)}</td>
                    <td className="text-right">
                      {u.status === "in_stock" && canAdjust && (
                        <form action={writeOffUnit}>
                          <input type="hidden" name="unit_id" value={u.id} />
                          <Submit className="btn-ghost btn-sm" confirm="Write off this unit (damaged / lost)?">Write off</Submit>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
