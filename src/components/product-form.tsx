"use client";
import { useState } from "react";
import Submit from "./submit";

export default function ProductForm(props: {
  action: (fd: FormData) => Promise<void>;
  product?: any;
  categories: string[];
  brands: string[];
  isNew?: boolean;
  showCost?: boolean;
}) {
  const p = props.product ?? {};
  const [serial, setSerial] = useState<boolean>(p.track_serial ?? false);
  const [service, setService] = useState<boolean>(p.is_service ?? false);
  return (
    <form action={props.action} className="card space-y-5 p-6">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Product name</label>
          <input name="name" defaultValue={p.name} className="input" required placeholder="e.g. iPhone 16 Pro 256GB Black Titanium" />
        </div>
        <div>
          <label className="label">Brand</label>
          <input name="brand" defaultValue={p.brand} className="input" list="brands" />
          <datalist id="brands">{props.brands.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div>
          <label className="label">Category</label>
          <input name="category" defaultValue={p.category} className="input" list="cats" placeholder="Phones, Accessories, Laptops…" />
          <datalist id="cats">{props.categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className="label">SKU / item code</label>
          <input name="sku" defaultValue={p.sku} className="input" />
        </div>
        <div>
          <label className="label">Barcode</label>
          <input name="barcode" defaultValue={p.barcode} className="input" />
        </div>
        {props.showCost !== false ? (
          <div>
            <label className="label">Cost price (excl. VAT)</label>
            <input name="cost" defaultValue={p.cost ?? ""} className="input" inputMode="decimal" />
          </div>
        ) : null}
        <div>
          <label className="label">Selling price</label>
          <input name="price" defaultValue={p.price ?? ""} className="input" inputMode="decimal" required />
        </div>
        <div>
          <label className="label">Low-stock alert at</label>
          <input name="reorder_level" defaultValue={p.reorder_level ?? 0} className="input" inputMode="numeric" />
        </div>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="track_serial" checked={serial} onChange={(e) => { setSerial(e.target.checked); if (e.target.checked) setService(false); }} />
          Track each unit by IMEI / serial
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_service" checked={service} onChange={(e) => { setService(e.target.checked); if (e.target.checked) setSerial(false); }} />
          Service (no stock — e.g. software install)
        </label>
      </div>
      {props.isNew && !service && (
        serial ? (
          <div>
            <label className="label">Opening stock IMEIs (one per line or comma separated)</label>
            <textarea name="opening_imeis" rows={3} className="input font-mono" />
          </div>
        ) : (
          <div className="max-w-xs">
            <label className="label">Opening quantity</label>
            <input name="opening_qty" className="input" inputMode="numeric" defaultValue={0} />
          </div>
        )
      )}
      <Submit>{p.id ? "Save changes" : "Add product"}</Submit>
    </form>
  );
}
