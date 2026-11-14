"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import ProductPicker from "@/components/product-picker";
import Submit from "@/components/submit";
import { savePO } from "../../actions";

interface Line { product_id: number; name: string; qty: number; unit_cost: number }
export default function POForm({ suppliers, warehouses, preset, supplierId }: { suppliers: { id: number; name: string }[]; warehouses: { id: number; name: string }[]; preset: Line[]; supplierId?: number }) {
  const [lines, setLines] = useState<Line[]>(preset);
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + l.qty * l.unit_cost, 0);
  return (
    <form action={savePO} className="space-y-6">
      <div className="card grid gap-4 p-6 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="label">Supplier</label><select name="supplier_id" defaultValue={supplierId ?? ""} className="input"><option value="">— decide later —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">Needed by</label><input type="date" name="expected_date" className="input" /></div>
        <div><label className="label">Supplier quotation ref.</label><input name="supplier_quote_ref" className="input" /></div>
        {warehouses.length > 1 && <div className="sm:col-span-2"><label className="label">Deliver to</label><select name="warehouse_id" className="input"><option value="">Default warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
        <div className="sm:col-span-2"><label className="label">Notes / why it is needed</label><input name="notes" className="input" /></div>
      </div>
      <div className="card p-6">
        <ProductPicker onPick={(p) => setLines((ls) => (ls.some((l) => l.product_id === p.id) ? ls : [...ls, { product_id: p.id, name: p.name, qty: 1, unit_cost: Number(p.cost) }]))} placeholder="Add item: search or scan" />
        <table className="tbl mt-4"><tbody>
          {lines.map((l, i) => (
            <tr key={l.product_id}><td>{l.name}</td>
              <td className="w-24"><input className="input" inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: Math.max(0, parseInt(e.target.value) || 0) })} /></td>
              <td className="w-32"><input className="input" inputMode="decimal" value={l.unit_cost} onChange={(e) => upd(i, { unit_cost: parseFloat(e.target.value) || 0 })} /></td>
              <td className="w-28 text-right tabular-nums">{(l.qty * l.unit_cost).toFixed(2)}</td>
              <td className="w-10"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="btn-ghost btn-sm" aria-label="Remove"><Trash2 size={14} /></button></td></tr>
          ))}
          {lines.length > 0 && <tr className="font-semibold"><td colSpan={3} className="text-right">Total excl. VAT</td><td className="text-right tabular-nums">{total.toFixed(2)}</td><td></td></tr>}
        </tbody></table>
      </div>
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <Submit>Save purchase request</Submit>
    </form>
  );
}
