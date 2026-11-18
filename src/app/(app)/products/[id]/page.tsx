import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";
import { WH_STOCK_SQL } from "@/lib/inventory";
import { RESERVED_SQL } from "@/lib/orders";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import ProductForm from "@/components/product-form";
import Submit from "@/components/submit";
import { updateProduct, toggleProduct, adjustStock, addUnits, writeOffUnit, duplicateProduct, generateBarcode, addVariants, saveRelated, approveProduct } from "../actions";
import Attachments from "@/components/attachments";
import { setLocation } from "../../inventory/actions";
import CustomFieldInputs, { CustomFieldValues } from "@/components/custom-fields-inputs";
import { customFields } from "@/lib/custom-fields";
import { getSettings } from "@/lib/settings";
import { Copy, Tag, Barcode } from "lucide-react";

const STATUS_TONE: Record<string, string> = { active: "green", draft: "amber", inactive: "slate", pending: "violet" };

const UNIT_TONE: Record<string, string> = { in_stock: "green", sold: "slate", written_off: "red", returned: "amber" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("products.view");
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
  const reserved = p.is_service ? 0 : Number((await one<{ r: number }>(`SELECT ${RESERVED_SQL("p")} r FROM products p WHERE p.id=$1`, [p.id]))?.r ?? 0);
  const byWh = p.is_service ? [] : await q<any>(`SELECT w.id, w.name, w.is_default, COALESCE((SELECT location FROM product_stock ps WHERE ps.product_id=p.id AND ps.warehouse_id=w.id),'') AS location, ${WH_STOCK_SQL("p", "w.id")} AS qty FROM warehouses w, products p WHERE p.id=$1 AND w.active ORDER BY w.is_default DESC, w.name`, [p.id]);
  const history = await q<any>("SELECT h.*, u.name FROM product_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.product_id=$1 ORDER BY h.id DESC LIMIT 100", [p.id]);
  const cfs = await customFields("products");
  const st = await getSettings();
  const rootId = p.parent_id ?? p.id;
  const family = await q<any>(`SELECT p.id, p.name, p.sku, p.price, p.attributes, p.status, ${STOCK_SQL} AS stock FROM products p WHERE (p.parent_id=$1 OR p.id=$1) AND p.id<>$2 ORDER BY p.id`, [rootId, p.id]);
  const related = p.related_ids?.length ? await q<any>(`SELECT id, name, sku, price FROM products WHERE id = ANY($1)`, [p.related_ids]) : [];
  const batches = p.track_batch ? await q<any>("SELECT b.*, w.name wh FROM batches b LEFT JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=$1 AND b.qty <> 0 ORDER BY b.expiry_date NULLS LAST, b.id", [p.id]) : [];
  const canAdjust = can(user, "stock.adjust");
  const showCost = can(user, "products.cost");
  const canEdit = can(user, "products.edit");
  return (
    <div className="max-w-5xl">
      <PageHeader title={p.name} subtitle={`${p.brand || "No brand"} · ${p.category || "Uncategorised"}${p.sku ? ` · ${p.sku}` : ""}${p.active ? "" : " · archived"}`}>
        <Badge tone={STATUS_TONE[p.status] ?? "slate"}>{p.status}</Badge>
        {can(user, "pos") && p.status === "active" && <Link href={`/pos?add=${p.id}`} className="btn-primary">Sell</Link>}
        <Link href={`/print/labels?ids=${p.id}`} target="_blank" className="btn-ghost"><Tag size={16} /> Label</Link>
        {p.track_serial && units.some((u) => u.status === "in_stock") && <Link href={`/print/labels?product=${p.id}&imei=1`} target="_blank" className="btn-ghost"><Tag size={16} /> IMEI labels</Link>}
        {canEdit && !p.barcode && <form action={generateBarcode}><input type="hidden" name="id" value={p.id} /><Submit className="btn-ghost"><Barcode size={16} /> Make barcode</Submit></form>}
        {canEdit && <form action={duplicateProduct}><input type="hidden" name="id" value={p.id} /><Submit className="btn-ghost"><Copy size={16} /> Duplicate</Submit></form>}
        {canEdit && <form action={toggleProduct}>
          <input type="hidden" name="id" value={p.id} />
          <Submit className="btn-ghost">{p.active ? "Archive" : "Restore"}</Submit>
        </form>}
      </PageHeader>
      {sp.saved && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.dup ? "Copy created as a draft. Check the name, SKU and barcode, then set it to Active." : sp.msg || "Saved."}</div>}
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {p.status === "pending" && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 border-violet-200 bg-violet-50 p-4 text-sm">
          <span className="font-medium text-violet-800">Waiting for approval before it can be sold or shown on the website.</span>
          {can(user, "products.approve") && <>
            <form action={approveProduct}><input type="hidden" name="id" value={p.id} /><Submit className="btn-primary btn-sm">Approve</Submit></form>
            <form action={approveProduct}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="decision" value="reject" /><Submit className="btn-ghost btn-sm">Send back to draft</Submit></form>
          </>}
        </div>
      )}
      {p.parent_id && <div className="mb-4 text-sm">Variant of <Link href={`/products/${p.parent_id}`} className="text-accent hover:underline">the main product</Link>{Object.keys(p.attributes ?? {}).length > 0 && <> · {Object.entries(p.attributes).map(([k, v]) => `${k}: ${v}`).join(", ")}</>}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      {p.tags && <div className="mb-4 flex flex-wrap gap-1.5">{p.tags.split(",").map((t: string) => <Link key={t} href={`/products?tag=${encodeURIComponent(t.trim())}`}><Badge tone="blue">{t.trim()}</Badge></Link>)}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><div className="text-xs text-slate-500">In stock</div><div className="mt-1 text-2xl font-semibold">{p.is_service ? "—" : p.stock}</div>{reserved > 0 && <div className="mt-1 text-xs text-slate-500">{reserved} reserved for orders · {p.stock - reserved} free</div>}</div>
        <div className="card p-5"><div className="text-xs text-slate-500">Units sold (all time)</div><div className="mt-1 text-2xl font-semibold">{sold?.qty ?? 0}</div></div>
        <div className="card p-5"><div className="text-xs text-slate-500">Revenue (all time)</div><div className="mt-1 text-2xl font-semibold">{num(sold?.revenue)}</div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {canEdit ? (
          <ProductForm action={updateProduct} product={p} categories={cats.map((c) => c.v)} brands={brands.map((b) => b.v)} showCost={showCost}
            extra={cfs.length ? <div className="border-t border-slate-100 pt-4"><div className="mb-2 text-sm font-semibold">More details</div><CustomFieldInputs fields={cfs} values={p.custom} /></div> : null} />
        ) : (
          <div className="card grid h-fit gap-4 p-6 text-sm sm:grid-cols-2">
            <div><div className="label">Selling price</div><div className="text-lg font-semibold">{num(p.price)}</div></div>
            {showCost && <div><div className="label">Cost</div><div className="text-lg">{num(p.cost)}</div></div>}
            <div><div className="label">SKU</div>{p.sku || "—"}</div>
            <div><div className="label">Barcode</div>{p.barcode || "—"}</div>
          </div>
        )}
        <div className="space-y-6">
          {!canEdit && <CustomFieldValues fields={cfs} values={p.custom} />}
          <Attachments kind="product" ownerId={p.id} back={`/products/${p.id}`} title="Photos" />
          {(family.length > 0 || canEdit) && (
            <div className="card p-5">
              <h3 className="mb-2 font-semibold">Variants {family.length > 0 && <span className="text-sm font-normal text-slate-400">{family.length + 1} in this family</span>}</h3>
              {family.length > 0 && <ul className="mb-3 space-y-1 text-sm">{family.map((v) => <li key={v.id} className="flex justify-between gap-2"><Link href={`/products/${v.id}`} className="truncate hover:text-accent">{Object.keys(v.attributes ?? {}).length ? Object.values(v.attributes).join(" / ") : v.name}</Link><span className="shrink-0 tabular-nums text-slate-500">{num(v.price)} · {v.stock ?? "—"} in stock</span></li>)}</ul>}
              {canEdit && <form action={addVariants} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="axes" className="input text-sm" placeholder="Color: Black, Blue | Storage: 128GB, 256GB" />
                <div className="flex gap-2"><input name="price" className="input" placeholder={`Price (default ${num(p.price)})`} inputMode="decimal" /><Submit className="btn-ghost shrink-0">Create variants</Submit></div>
              </form>}
            </div>
          )}
          <div className="card p-5">
            <h3 className="mb-2 font-semibold">Related products</h3>
            {related.length > 0 && <ul className="mb-2 space-y-1 text-sm">{related.map((r) => <li key={r.id} className="flex justify-between"><Link href={`/products/${r.id}`} className="hover:text-accent">{r.name}</Link><span className="text-slate-500">{num(r.price)}</span></li>)}</ul>}
            {canEdit && <form action={saveRelated} className="space-y-2"><input type="hidden" name="id" value={p.id} /><textarea name="related" rows={2} defaultValue={related.map((r) => r.sku || r.name).join(", ")} className="input text-xs" placeholder="SKUs or names, comma separated (e.g. cases, chargers)" /><Submit className="btn-ghost btn-sm">Save related</Submit></form>}
          </div>
          {p.track_batch && (
            <div className="card p-5">
              <h3 className="mb-2 font-semibold">Batches &amp; expiry</h3>
              <ul className="space-y-1 text-sm">{batches.map((b) => { const exp = b.expiry_date ? String(b.expiry_date instanceof Date ? b.expiry_date.toISOString() : b.expiry_date).slice(0, 10) : ""; const soon = exp && exp <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10); return <li key={b.id} className="flex justify-between"><span className="font-mono text-xs">{b.batch_no}{b.wh && <span className="ml-1 font-sans text-slate-400">{b.wh}</span>}</span><span className={soon ? "font-medium text-red-600" : "text-slate-500"}>{b.qty} · {exp ? `exp ${fmtDate(exp)}` : "no expiry"}</span></li>; })}
                {batches.length === 0 && <li className="text-slate-400">No batches yet. They are added when you receive a purchase.</li>}</ul>
            </div>
          )}
          {byWh.length > 0 && (
            <div className="card p-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Stock by warehouse</h3><Link href={`/inventory/moves?product=${p.id}&from=2000-01-01`} className="text-xs text-accent hover:underline">Movements</Link></div>
              <ul className="space-y-1.5 text-sm">
                {byWh.map((w) => <li key={w.id} className="flex items-center justify-between gap-2"><span>{w.name}{w.is_default && <span className="ml-1 text-xs text-slate-400">(default)</span>}</span>
                  <span className="flex items-center gap-2">{canAdjust ? <form action={setLocation} className="flex gap-1"><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="warehouse_id" value={w.id} /><input name="location" defaultValue={w.location} placeholder="Shelf / bin" className="input h-7 w-24 text-xs" /><Submit className="text-xs text-accent">Set</Submit></form> : w.location && <span className="text-xs text-slate-400">{w.location}</span>}<span className="w-10 text-right tabular-nums font-medium">{w.qty}</span></span></li>)}
              </ul>
            </div>
          )}
          {!p.track_serial && !p.is_service && canAdjust && (
            <form action={adjustStock} className="card space-y-3 p-5">
              <h3 className="font-semibold">Adjust stock</h3>
              <p className="text-xs text-slate-500">Use + to add (e.g. stock count found more) or − to remove (damaged, lost). Purchases add stock automatically.</p>
              <input type="hidden" name="id" value={p.id} />
              {byWh.length > 1 && <select name="warehouse_id" className="input">{byWh.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
              <select name="reason" className="input" defaultValue="adjust">
                <option value="adjust">Correction</option><option value="damaged">Damaged</option><option value="lost">Lost / stolen</option><option value="found">Found</option><option value="supplier_return">Returned to supplier</option>
              </select>
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
              <thead><tr><th>IMEI / Serial</th><th>Status</th><th>Source</th>{showCost && <th className="text-right">Cost</th>}<th>Added</th><th></th></tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs"><Link href={`/imei?q=${u.imei}`} className="hover:text-accent">{u.imei}</Link></td>
                    <td>
                      <Badge tone={UNIT_TONE[u.status]}>{u.status.replace("_", " ")}</Badge>
                      {u.margin_scheme && <span className="ml-1"><Badge tone="violet">margin VAT</Badge></span>}
                    </td>
                    <td className="text-slate-500 capitalize">{u.source}{u.sale_no && <> · <Link href={`/sales/${u.sale_id2}`} className="link">{u.sale_no}</Link></>}</td>
                    {showCost && <td className="text-right tabular-nums">{num(u.cost)}</td>}
                    <td className="text-slate-500">{fmtDate(u.created_at)}</td>
                    <td className="text-right">
                      <Link href={`/print/labels?units=${u.id}`} target="_blank" className="btn-ghost btn-sm mr-1"><Tag size={13} /> Label</Link>
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
      <div className="card mt-6 overflow-x-auto">
        <div className="p-5 pb-2 font-semibold">Change history</div>
        {history.length === 0 ? <Empty>No changes recorded yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Staff</th><th>What changed</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {history.map((h) => (h.field === "Cost" && !showCost ? null : (
                <tr key={h.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(h.created_at, true)}</td>
                  <td className="whitespace-nowrap">{h.name ?? "—"}</td>
                  <td className="whitespace-nowrap font-medium">{h.field}{h.source !== "edit" && <span className="ml-1 text-xs font-normal text-slate-400">({h.source})</span>}</td>
                  <td className="max-w-[16rem] truncate text-slate-500">{h.old_value || "—"}</td>
                  <td className="max-w-[16rem] truncate">{h.new_value || "—"}</td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
