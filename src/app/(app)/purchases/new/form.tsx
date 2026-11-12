"use client";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import ProductPicker from "@/components/product-picker";
import { createPurchase } from "../actions";

interface Line { product_id: number; name: string; qty: number; unit_cost: number; vat: boolean; imeis: string[]; track_serial: boolean; imeiText: string }

export default function PurchaseForm({ suppliers, vatRate, today }: { suppliers: { id: number; name: string }[]; vatRate: number; today: string }) {
  const [state, action, pending] = useActionState(createPurchase, null);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("");
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sub = lines.reduce((a, l) => a + l.qty * l.unit_cost, 0);
  const vat = lines.reduce((a, l) => a + (l.vat ? (l.qty * l.unit_cost * vatRate) / 100 : 0), 0);
  const total = sub + vat;
  const payload = lines.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_cost: l.unit_cost, vat: l.vat, track_serial: l.track_serial, imeis: l.track_serial ? l.imeiText.split(/[\s,]+/).filter(Boolean) : [] }));

  return (
    <form action={action} className="space-y-6">
      <div className="card grid gap-4 p-6 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label">Supplier</label>
          <select name="supplier_id" className="input">
            <option value="">— none / walk-in —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label">Supplier bill no.</label><input name="bill_ref" className="input" /></div>
        <div><label className="label">Date</label><input name="date" type="date" defaultValue={today} className="input" /></div>
      </div>

      <div className="card p-6">
        <ProductPicker onPick={(p) => setLines((ls) => [...ls, { product_id: p.id, name: p.name, qty: 1, unit_cost: p.cost, vat: true, imeis: [], imeiText: "", track_serial: p.track_serial }])} placeholder="Add item — search or scan" />
        <div className="mt-4 space-y-3">
          {lines.map((l, i) => {
            const count = l.imeiText.split(/[\s,]+/).filter(Boolean).length;
            return (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 flex-1 font-medium">{l.name}</div>
                  <div className="w-20"><label className="label">Qty</label><input className="input" inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
                  <div className="w-32"><label className="label">Unit cost (excl. VAT)</label><input className="input" inputMode="decimal" value={l.unit_cost} onChange={(e) => upd(i, { unit_cost: parseFloat(e.target.value) || 0 })} /></div>
                  <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={l.vat} onChange={(e) => upd(i, { vat: e.target.checked })} /> +{vatRate}% VAT</label>
                  <div className="w-28 text-right tabular-nums">{(l.qty * l.unit_cost * (l.vat ? 1 + vatRate / 100 : 1)).toFixed(2)}</div>
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="btn-ghost btn-sm" aria-label="Remove"><Trash2 size={14} /></button>
                </div>
                {l.track_serial && (
                  <div className="mt-3">
                    <label className="label">IMEIs — {count} of {l.qty} entered {count !== l.qty && <span className="text-amber-600">(must match qty)</span>}</label>
                    <textarea rows={2} value={l.imeiText} onChange={(e) => upd(i, { imeiText: e.target.value })} className="input font-mono text-xs" placeholder="Scan each IMEI, one per line" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card grid gap-4 p-6 sm:grid-cols-4">
        <div><div className="label">Subtotal</div><div className="text-lg tabular-nums">{sub.toFixed(2)}</div></div>
        <div><div className="label">Input VAT</div><div className="text-lg tabular-nums">{vat.toFixed(2)}</div></div>
        <div><div className="label">Total</div><div className="text-lg font-semibold tabular-nums">{total.toFixed(2)}</div></div>
        <div className="flex gap-2">
          <div className="flex-1"><label className="label">Paid now</label><input name="paid" value={paid} onChange={(e) => setPaid(e.target.value)} className="input" inputMode="decimal" placeholder="0.00" /></div>
          <button type="button" className="btn-ghost mt-5" onClick={() => setPaid(total.toFixed(2))}>Full</button>
        </div>
        <div className="sm:col-span-2"><label className="label">Payment method</label>
          <select name="method" className="input"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option></select>
        </div>
        <div className="sm:col-span-2"><label className="label">Notes</label><input name="notes" className="input" /></div>
      </div>
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending || !lines.length}>{pending ? "Saving…" : "Save purchase & add to stock"}</button>
    </form>
  );
}
