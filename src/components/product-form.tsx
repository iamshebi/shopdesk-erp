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
  const [cost, setCost] = useState<string>(p.cost != null ? String(p.cost) : "");
  const [price, setPrice] = useState<string>(p.price != null ? String(p.price) : "");
  const c = parseFloat(cost), pr = parseFloat(price);
  const margin = c > 0 && pr > 0 ? `${(pr - c).toFixed(2)} profit · ${(((pr - c) / pr) * 100).toFixed(1)}% margin` : "";
  return (
    <form action={props.action} className="card space-y-5 p-6">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Product name</label>
          <input name="name" defaultValue={p.name} className="input" required placeholder="e.g. iPhone 16 Pro 256GB Black Titanium" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={p.status ?? "active"} className="input">
            <option value="active">Active (can be sold)</option>
            <option value="draft">Draft (not ready yet)</option>
            <option value="inactive">Inactive (hidden from sale)</option>
          </select>
        </div>
        <div>
          <label className="label">Tags (comma separated)</label>
          <input name="tags" defaultValue={p.tags} className="input" placeholder="new arrival, 5G, gift" />
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
            <input name="cost" value={cost} onChange={(e) => setCost(e.target.value)} className="input" inputMode="decimal" />
          </div>
        ) : null}
        <div>
          <label className="label">Selling price</label>
          <input name="price" value={price} onChange={(e) => setPrice(e.target.value)} className="input" inputMode="decimal" required />
          {props.showCost !== false && margin && <p className="mt-1 text-xs text-slate-500">{margin}</p>}
        </div>
        <div>
          <label className="label">Discount / offer price (optional)</label>
          <input name="discount_price" defaultValue={p.discount_price ?? ""} className="input" inputMode="decimal" placeholder="Leave empty if no offer" />
        </div>
        <div>
          <label className="label">Low-stock alert at</label>
          <input name="reorder_level" defaultValue={p.reorder_level ?? 0} className="input" inputMode="numeric" />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <textarea name="description" defaultValue={p.description} rows={3} className="input" placeholder="What customers should know about this product" />
      </div>
      <div>
        <label className="label">Specifications (one per line, e.g. Storage: 256GB)</label>
        <textarea name="specs" defaultValue={p.specs} rows={3} className="input font-mono text-xs" />
      </div>
      <details className="rounded-xl border border-slate-200 p-4" open={!!(p.seo_title || p.seo_description)}>
        <summary className="cursor-pointer text-sm font-medium">Website &amp; SEO</summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="website_visible" defaultChecked={p.website_visible ?? true} /> Show on website</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="featured" defaultChecked={p.featured ?? false} /> Featured product</label>
          </div>
          <div><label className="label">SEO title</label><input name="seo_title" defaultValue={p.seo_title} className="input" maxLength={70} placeholder="Shown in Google results (max 70 characters)" /></div>
          <div><label className="label">SEO description</label><textarea name="seo_description" defaultValue={p.seo_description} rows={2} className="input" maxLength={160} placeholder="Max 160 characters" /></div>
        </div>
      </details>
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
