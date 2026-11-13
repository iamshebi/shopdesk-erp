"use client";
import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import ProductPicker from "./product-picker";
import Submit from "./submit";
import type { ProductHit } from "@/app/(app)/lookup-actions";

interface Line { product_id: number | null; description: string; qty: string; unit_price: string; discount: string }

const n = (v: string) => Number(String(v).replace(/,/g, "")) || 0;

export default function OrderForm(props: {
  action: (fd: FormData) => Promise<void>;
  kind: "order" | "quote";
  order?: any;
  items?: any[];
  reps: { id: number; name: string }[];
  currency: string;
  canDiscount: boolean;
  defaultTerms: string;
}) {
  const o = props.order ?? {};
  const [lines, setLines] = useState<Line[]>(
    (props.items ?? []).map((i) => ({ product_id: i.product_id, description: i.description, qty: String(i.qty), unit_price: String(i.unit_price), discount: String(i.discount ?? 0) })),
  );
  const [delivery, setDelivery] = useState<string>(o.delivery_method ?? "pickup");
  const [charge, setCharge] = useState<string>(o.delivery_charge ? String(o.delivery_charge) : "");
  const total = useMemo(() => lines.reduce((a, l) => a + Math.max(0, n(l.qty) * n(l.unit_price) - n(l.discount)), 0) + (delivery === "delivery" ? n(charge) : 0), [lines, delivery, charge]);
  const add = (p: ProductHit) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product_id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(n(l.qty) + 1) } : l));
      return [...ls, { product_id: p.id, description: `${p.brand ? p.brand + " " : ""}${p.name}`, qty: "1", unit_price: String(p.price), discount: "0" }];
    });
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const quote = props.kind === "quote";
  return (
    <form action={props.action} className="space-y-6">
      {o.id && <input type="hidden" name="id" value={o.id} />}
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ ...l, qty: n(l.qty), unit_price: n(l.unit_price), discount: n(l.discount) })))} />

      <section className="card grid gap-4 p-6 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Customer</h2>
        <div><label className="label">Name</label><input name="customer_name" defaultValue={o.customer_name} className="input" /></div>
        <div><label className="label">Phone</label><input name="customer_phone" defaultValue={o.customer_phone} className="input" inputMode="tel" /></div>
        <div><label className="label">Email</label><input name="customer_email" defaultValue={o.customer_email} className="input" type="email" /></div>
        <div className="sm:col-span-2"><label className="label">Address</label><input name="customer_address" defaultValue={o.customer_address} className="input" /></div>
        <div><label className="label">TRN (business customers)</label><input name="customer_trn" defaultValue={o.customer_trn} className="input" /></div>
      </section>

      <section className="card p-6">
        <h2 className="mb-3 font-semibold">Items</h2>
        <ProductPicker onPick={add} placeholder="Search or scan a product to add…" />
        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Item</th><th className="w-24">Qty</th><th className="w-32">Price</th>{props.canDiscount && <th className="w-28">Discount</th>}<th className="text-right">Total</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><input value={l.description} onChange={(e) => set(i, { description: e.target.value })} className="input" /></td>
                  <td><input value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className="input" inputMode="numeric" /></td>
                  <td><input value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} className="input" inputMode="decimal" /></td>
                  {props.canDiscount && <td><input value={l.discount} onChange={(e) => set(i, { discount: e.target.value })} className="input" inputMode="decimal" /></td>}
                  <td className="text-right tabular-nums">{(n(l.qty) * n(l.unit_price) - n(l.discount)).toFixed(2)}</td>
                  <td className="text-right"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="btn-ghost btn-sm" aria-label="Remove"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, { product_id: null, description: "", qty: "1", unit_price: "0", discount: "0" }])} className="btn-ghost btn-sm mt-3"><Plus size={14} /> Free-text line (service, custom item)</button>
        <div className="mt-4 text-right text-lg font-semibold">Total {props.currency} {total.toFixed(2)}<div className="text-xs font-normal text-slate-400">VAT is worked out on save, the same way as invoices</div></div>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">{quote ? "Quotation details" : "Delivery & payment"}</h2>
        <div><label className="label">Source</label><select name="source" defaultValue={o.source ?? "shop"} className="input"><option value="shop">In shop</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option><option value="instagram">Instagram</option><option value="other">Other</option></select></div>
        <div><label className="label">Sales person</label><select name="sales_rep_id" defaultValue={o.sales_rep_id ?? ""} className="input"><option value="">—</option>{props.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        {quote ? (
          <div><label className="label">Valid until</label><input type="date" name="valid_until" defaultValue={o.valid_until ?? ""} className="input" /></div>
        ) : (
          <div><label className="label">Expected date</label><input type="date" name="expected_date" defaultValue={o.expected_date ?? ""} className="input" /></div>
        )}
        <div><label className="label">Delivery</label><select name="delivery_method" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="input"><option value="pickup">Customer picks up</option><option value="delivery">Deliver to customer</option></select></div>
        {delivery === "delivery" && <>
          <div><label className="label">Delivery charge</label><input name="delivery_charge" value={charge} onChange={(e) => setCharge(e.target.value)} className="input" inputMode="decimal" /></div>
          <div><label className="label">Delivery address</label><input name="delivery_address" defaultValue={o.delivery_address ?? o.customer_address} className="input" /></div>
        </>}
        {!quote && <>
          <div><label className="label">Advance paid now</label><input name="advance" defaultValue={o.advance ?? ""} className="input" inputMode="decimal" placeholder="0.00" /></div>
          <div><label className="label">Advance paid by</label><select name="advance_method" defaultValue={o.advance_method ?? "cash"} className="input"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option></select></div>
        </>}
        <div className="sm:col-span-3"><label className="label">Notes</label><textarea name="notes" defaultValue={o.notes} rows={2} className="input" /></div>
        {quote && <div className="sm:col-span-3"><label className="label">Terms shown on the quotation</label><textarea name="terms" defaultValue={o.terms ?? props.defaultTerms} rows={2} className="input" /></div>}
      </section>
      <Submit>{o.id ? "Save changes" : quote ? "Create quotation" : "Create order"}</Submit>
    </form>
  );
}
