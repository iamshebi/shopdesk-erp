import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import PrintButton from "@/components/print-button";
import InventoryTabs from "../../tabs";
import { saveCount } from "../../actions";

export default async function CountSheet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("stock.adjust");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const showCost = can(user, "products.cost");
  const c = await one<any>("SELECT c.*, w.name wh FROM stock_counts c JOIN warehouses w ON w.id=c.warehouse_id WHERE c.id=$1", [Number(id)]);
  if (!c) notFound();
  const items = await q<any>(
    `SELECT i.*, p.name, p.brand, p.sku, p.barcode, p.category, p.track_serial FROM stock_count_items i JOIN products p ON p.id=i.product_id
     WHERE i.count_id=$1 ORDER BY p.category, p.name`,
    [c.id],
  );
  const open = c.status === "open";
  const counted = items.filter((i) => i.counted !== null);
  const diffs = counted.filter((i) => i.counted !== i.expected);
  const value = diffs.reduce((a, i) => a + (i.counted - i.expected) * Number(i.cost), 0);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Stock count ${c.number}`} subtitle={`${c.wh} · ${c.category || "All products"} · started ${fmtDate(c.created_at, true)}`}>
        {open ? <Badge tone="amber">Open</Badge> : <Badge tone="green">Applied {fmtDate(c.applied_at, true)}</Badge>}
        <PrintButton />
      </PageHeader>
      <div className="no-print"><InventoryTabs active="/inventory/counts" /></div>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-slate-500">Counted</div><div className="text-xl font-semibold">{counted.length} of {items.length}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Products with a difference</div><div className="text-xl font-semibold">{diffs.length}</div></div>
        {showCost && <div className="card p-4"><div className="text-xs text-slate-500">Difference at cost</div><div className={`text-xl font-semibold ${value < 0 ? "text-red-600" : ""}`}>{s.currency} {num(value)}</div></div>}
      </div>
      <form action={saveCount}>
        <input type="hidden" name="id" value={c.id} />
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Product</th><th>SKU / barcode</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
            <tbody>
              {items.map((i) => {
                const d = i.counted === null ? null : i.counted - i.expected;
                return (
                  <tr key={i.id}>
                    <td><div className="font-medium">{i.brand ? `${i.brand} ` : ""}{i.name}</div><div className="text-xs text-slate-400">{i.category}{i.track_serial && " · IMEI tracked"}</div></td>
                    <td className="font-mono text-xs text-slate-500">{i.sku}{i.barcode && <div>{i.barcode}</div>}</td>
                    <td className="text-right tabular-nums">{i.expected}</td>
                    <td className="text-right">{open ? <input name={`c_${i.id}`} defaultValue={i.counted ?? ""} className="input ml-auto h-9 w-24 text-right" inputMode="numeric" /> : i.counted ?? "—"}</td>
                    <td className="text-right tabular-nums">{d === null ? "—" : d === 0 ? <span className="text-slate-400">0</span> : <Badge tone={d < 0 ? "red" : "amber"}>{d > 0 ? `+${d}` : d}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {open && (
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Submit className="btn-ghost">Save progress</Submit>
            <button name="apply" value="1" className="btn-primary">Save and apply to stock</button>
            <p className="w-full text-xs text-slate-400">Applying sets stock to what you counted (leave a box empty to skip that product). IMEI-tracked products are only flagged: write off or add the exact units.</p>
          </div>
        )}
      </form>
    </div>
  );
}
