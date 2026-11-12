"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProductPicker from "@/components/product-picker";
import type { ProductHit } from "../../lookup-actions";
import { createBuyback } from "../actions";

export default function BuybackForm({ registered }: { registered: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createBuyback, null);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  useEffect(() => {
    if (state?.id) router.push(`/print/buyback/${state.id}?auto=1`);
  }, [state, router]);
  return (
    <form action={action} className="space-y-6">
      <div className="card space-y-4 p-6">
        <h2 className="font-semibold">Seller</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Full name (as on ID)</label><input name="seller_name" className="input" required /></div>
          <div><label className="label">Phone</label><input name="seller_phone" className="input" inputMode="tel" required /></div>
          <div><label className="label">ID type</label><select name="id_type" className="input"><option>Emirates ID</option><option>Passport</option><option>GCC ID</option><option>Driving licence</option></select></div>
          <div><label className="label">ID number</label><input name="id_number" className="input font-mono" required /></div>
          <div><label className="label">Nationality</label><input name="nationality" className="input" /></div>
        </div>
      </div>
      <div className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Device</h2>
          <div className="flex gap-1 text-xs">
            <button type="button" onClick={() => setMode("pick")} className={`rounded-full px-3 py-1 ${mode === "pick" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>Existing model</button>
            <button type="button" onClick={() => { setMode("new"); setProduct(null); }} className={`rounded-full px-3 py-1 ${mode === "new" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>New model</button>
          </div>
        </div>
        {mode === "pick" ? (
          product ? (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-medium">{product.name}</span><button type="button" className="text-xs text-accent" onClick={() => setProduct(null)}>Change</button></div>
          ) : <ProductPicker onPick={setProduct} placeholder="Search model, e.g. iPhone 13 128GB used" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Model name</label><input name="new_product" className="input" placeholder="iPhone 13 128GB Blue (Used)" required /></div>
            <div><label className="label">Brand</label><input name="brand" className="input" /></div>
          </div>
        )}
        <input type="hidden" name="product_id" value={product?.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">IMEI</label><input name="imei" className="input font-mono" required /></div>
          <div><label className="label">Condition / grade</label><input name="condition" className="input" placeholder="A grade, battery 88%, no box" /></div>
          <div><label className="label">Price paid to seller</label><input name="price_paid" className="input" inputMode="decimal" required /></div>
          <div><label className="label">Paid by</label><select name="payment_method" className="input"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="exchange">Exchange (against a new phone)</option></select></div>
          <div><label className="label">Planned selling price</label><input name="sell_price" className="input" inputMode="decimal" /></div>
          <div><label className="label">Notes</label><input name="notes" className="input" /></div>
        </div>
        {registered && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="margin_scheme" defaultChecked className="mt-1" />
            <span>Bought from a person who is not VAT registered — sell under the <b>profit margin scheme</b> (VAT only on the profit).</span>
          </label>
        )}
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save & print seller declaration"}</button>
    </form>
  );
}
