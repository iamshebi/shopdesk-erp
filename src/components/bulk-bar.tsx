"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Bulk-action toolbar for a table of checkboxes named "ids" inside the same <form>.
 * Shows when at least one row is ticked; each action submits the form with op=<action>.
 */
export default function BulkBar({ categories, brands, canEdit, canExport }: { categories: string[]; brands: string[]; canEdit: boolean; canExport: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [panel, setPanel] = useState("");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => setCount(form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length);
    form.addEventListener("change", update);
    update();
    return () => form.removeEventListener("change", update);
  }, []);
  const toggleAll = (on: boolean) => {
    const form = ref.current?.closest("form");
    form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => (c.checked = on));
    form?.dispatchEvent(new Event("change"));
  };
  const btn = (id: string, label: string) => (
    <button type="button" onClick={() => setPanel(panel === id ? "" : id)} className={`btn-sm ${panel === id ? "btn-dark" : "btn-ghost"}`}>{label}</button>
  );
  const go = (op: string, label: string, confirmText?: string, cls = "btn-primary btn-sm") => (
    <button name="op" value={op} className={cls} onClick={(e) => { if (confirmText && !window.confirm(confirmText.replace("{n}", String(count)))) e.preventDefault(); }}>{label}</button>
  );
  return (
    <div ref={ref} className={`no-print sticky top-14 z-20 mb-3 md:top-2 ${count ? "" : "hidden"}`}>
      <div className="card flex flex-wrap items-center gap-2 p-3 shadow-lg">
        <span className="mr-1 text-sm font-medium">{count} selected</span>
        <button type="button" onClick={() => toggleAll(true)} className="text-xs text-accent hover:underline">Select all on page</button>
        <button type="button" onClick={() => toggleAll(false)} className="mr-2 text-xs text-slate-400 hover:underline">Clear</button>
        {canEdit && <>{btn("price", "Change price")}{btn("status", "Status")}{btn("category", "Category")}{btn("brand", "Brand")}{btn("tags", "Tags")}{btn("website", "Website")}</>}
        {btn("labels", "Print labels")}
        {canExport && go("export", "Export", undefined, "btn-ghost btn-sm")}
        {canEdit && go("archive", "Archive", "Archive {n} products? They disappear from sale and lists, but their history is kept and you can restore them.", "btn-danger btn-sm")}
      </div>
      {panel && (
        <div className="card mt-2 flex flex-wrap items-end gap-2 p-3 shadow-lg">
          {panel === "price" && <>
            <select name="mode" className="input h-9 w-56" defaultValue="percent">
              <option value="percent">Change by percent (%)</option>
              <option value="amount">Change by amount (+/−)</option>
              <option value="set">Set exact price</option>
              <option value="margin">Cost + margin %</option>
            </select>
            <input name="value" className="input h-9 w-32" inputMode="decimal" placeholder="e.g. 10 or -5" />
            <select name="round" className="input h-9 w-40" defaultValue="">
              <option value="">No rounding</option><option value="whole">Whole number</option><option value="99">End in .99</option><option value="5">Nearest 5</option>
            </select>
            {go("price", "Apply to prices", "Change the price of {n} products?")}
          </>}
          {panel === "status" && <>
            <select name="status" className="input h-9 w-48"><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select>
            {go("status", "Set status")}
          </>}
          {panel === "category" && <>
            <input name="category" list="bulk-cats" className="input h-9 w-56" placeholder="Category" />
            <datalist id="bulk-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {go("category", "Set category")}
          </>}
          {panel === "brand" && <>
            <input name="brand" list="bulk-brands" className="input h-9 w-56" placeholder="Brand" />
            <datalist id="bulk-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
            {go("brand", "Set brand")}
          </>}
          {panel === "tags" && <>
            <input name="tag" className="input h-9 w-56" placeholder="Tag, e.g. new arrival" />
            {go("tag_add", "Add tag")}{go("tag_remove", "Remove tag", undefined, "btn-ghost btn-sm")}
          </>}
          {panel === "website" && <>
            <select name="website" className="input h-9 w-48"><option value="show">Show on website</option><option value="hide">Hide from website</option></select>
            {go("website", "Apply")}
          </>}
          {panel === "labels" && <>
            <div><label className="label">Copies of each</label><input name="copies" type="number" min={1} max={50} defaultValue={1} className="input h-9 w-24" /></div>
            {go("labels", "Open labels")}
          </>}
        </div>
      )}
    </div>
  );
}
