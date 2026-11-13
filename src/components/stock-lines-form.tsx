"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import ProductPicker from "./product-picker";
import Submit from "./submit";
import type { ProductHit } from "@/app/(app)/lookup-actions";

interface Line { product_id: number; name: string; track_serial: boolean; qty: string; imeis: string }

/** Pick products and quantities (or IMEIs) for a stock transfer or adjustment. */
export default function StockLinesForm(props: {
  action: (fd: FormData) => Promise<void>;
  mode: "transfer" | "adjust";
  warehouses: { id: number; name: string; is_default: boolean }[];
  reasons?: [string, string][];
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const def = props.warehouses.find((w) => w.is_default)?.id ?? props.warehouses[0]?.id;
  const other = props.warehouses.find((w) => w.id !== def)?.id;
  const add = (p: ProductHit) => {
    if (p.is_service) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product_id === p.id);
      if (i >= 0) {
        const copy = [...ls];
        if (p.match_unit) copy[i] = { ...copy[i], imeis: (copy[i].imeis + "\n" + p.match_unit.imei).trim() };
        else if (!p.track_serial) copy[i] = { ...copy[i], qty: String((Number(copy[i].qty) || 0) + 1) };
        return copy;
      }
      return [...ls, { product_id: p.id, name: `${p.brand ? p.brand + " " : ""}${p.name}`, track_serial: p.track_serial, qty: p.track_serial ? "" : "1", imeis: p.match_unit?.imei ?? "" }];
    });
  };
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <form action={props.action} className="space-y-5">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="card grid gap-4 p-6 sm:grid-cols-3">
        {props.mode === "transfer" ? (
          <>
            <div><label className="label">From warehouse</label><select name="from" defaultValue={def} className="input">{props.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label className="label">To warehouse</label><select name="to" defaultValue={other} className="input">{props.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label className="label">Note</label><input name="notes" className="input" placeholder="Optional" /></div>
          </>
        ) : (
          <>
            <div><label className="label">Warehouse</label><select name="warehouse_id" defaultValue={def} className="input">{props.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label className="label">Reason</label><select name="reason" className="input">{props.reasons?.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">Note</label><input name="note" className="input" placeholder="e.g. screen cracked in display" /></div>
          </>
        )}
      </div>
      <div className="card p-6">
        <ProductPicker onPick={add} placeholder="Search or scan a product / IMEI to add…" />
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No products added yet.</p>
        ) : (
          <table className="tbl mt-4">
            <thead><tr><th>Product</th><th>{props.mode === "adjust" ? "Quantity (+ add / − remove) or IMEIs" : "Quantity or IMEIs"}</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.product_id}>
                  <td className="font-medium">{l.name}{l.track_serial && <div className="text-xs font-normal text-slate-400">IMEI tracked: list each unit</div>}</td>
                  <td>
                    {l.track_serial ? (
                      <textarea value={l.imeis} onChange={(e) => set(i, { imeis: e.target.value })} rows={2} className="input font-mono text-xs" placeholder="One IMEI per line" />
                    ) : (
                      <input value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className="input w-32" inputMode="numeric" />
                    )}
                  </td>
                  <td className="text-right"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="btn-ghost btn-sm" aria-label="Remove"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Submit confirm={props.mode === "transfer" ? "Move this stock now?" : "Apply this adjustment to stock?"}>{props.mode === "transfer" ? "Transfer stock" : "Apply adjustment"}</Submit>
    </form>
  );
}
