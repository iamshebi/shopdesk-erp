import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num } from "@/lib/util";
import { PageHeader, Badge, Field } from "@/components/ui";
import Submit from "@/components/submit";
import InventoryTabs from "./tabs";
import { saveWarehouse, setDefaultWarehouse } from "./actions";
import { Warehouse } from "lucide-react";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("products.view");
  const sp = await searchParams;
  const s = await getSettings();
  const showCost = can(user, "products.cost");
  const canAdjust = can(user, "stock.adjust");
  const whs = await q<any>(
    `SELECT w.*,
       (SELECT COALESCE(sum(ps.qty),0)::int FROM product_stock ps WHERE ps.warehouse_id=w.id) + (SELECT count(*)::int FROM units u WHERE u.warehouse_id=w.id AND u.status='in_stock') AS items,
       (SELECT count(*)::int FROM product_stock ps WHERE ps.warehouse_id=w.id AND ps.qty > 0) + (SELECT count(DISTINCT u.product_id)::int FROM units u WHERE u.warehouse_id=w.id AND u.status='in_stock') AS products,
       (SELECT COALESCE(sum(ps.qty * p.cost),0) FROM product_stock ps JOIN products p ON p.id=ps.product_id WHERE ps.warehouse_id=w.id AND ps.qty > 0)
         + (SELECT COALESCE(sum(u.cost),0) FROM units u WHERE u.warehouse_id=w.id AND u.status='in_stock') AS value
     FROM warehouses w ORDER BY w.is_default DESC, w.active DESC, w.name`,
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Inventory" subtitle="Stock by location, transfers, adjustments and counts" />
      <InventoryTabs active="/inventory" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {whs.map((w) => (
          <div key={w.id} className={`card p-5 ${w.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold"><Warehouse size={18} className="text-slate-400" />{w.name}</div>
              {w.is_default ? <Badge tone="green">Default</Badge> : !w.active ? <Badge>Inactive</Badge> : null}
            </div>
            <div className="mt-1 text-xs text-slate-400">{[w.code, w.address].filter(Boolean).join(" · ") || "No address"}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-slate-500">Units in stock</div><div className="text-xl font-semibold">{w.items}</div></div>
              <div><div className="text-xs text-slate-500">Products</div><div className="text-xl font-semibold">{w.products}</div></div>
            </div>
            {showCost && <div className="mt-2 text-xs text-slate-500">Value at cost: {s.currency} {num(w.value)}</div>}
            {canAdjust && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-accent">Edit</summary>
                <form action={saveWarehouse} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={w.id} />
                  <input name="name" defaultValue={w.name} className="input" required />
                  <div className="grid grid-cols-2 gap-2"><input name="code" defaultValue={w.code} className="input" placeholder="Code" /><input name="address" defaultValue={w.address} className="input" placeholder="Address" /></div>
                  {!w.is_default && <select name="active" defaultValue={w.active ? "on" : "off"} className="input"><option value="on">Active</option><option value="off">Inactive</option></select>}
                  <Submit className="btn-dark btn-sm">Save</Submit>
                </form>
                {!w.is_default && w.active && <form action={setDefaultWarehouse} className="mt-2"><input type="hidden" name="id" value={w.id} /><Submit className="btn-ghost btn-sm">Make default</Submit></form>}
              </details>
            )}
          </div>
        ))}
      </div>
      {canAdjust && (
        <form action={saveWarehouse} className="card grid gap-3 p-6 sm:grid-cols-4">
          <h2 className="font-semibold sm:col-span-4">Add a warehouse or location</h2>
          <Field label="Name"><input name="name" className="input" placeholder="e.g. Branch 2, Back store" required /></Field>
          <Field label="Code"><input name="code" className="input" placeholder="B2" /></Field>
          <Field label="Address"><input name="address" className="input" /></Field>
          <div className="flex items-end"><Submit>Add</Submit></div>
          <p className="text-xs text-slate-400 sm:col-span-4">Sales, returns and purchases use the default warehouse. Move stock between locations with Transfer.</p>
        </form>
      )}
    </div>
  );
}
