import type { CustomField } from "@/lib/custom-fields";

export default function CustomFieldInputs({ fields, values = {}, className = "grid gap-3 sm:grid-cols-3" }: { fields: CustomField[]; values?: Record<string, any>; className?: string }) {
  if (!fields.length) return null;
  return (
    <div className={className}>
      {fields.map((f) => {
        const v = values[f.key];
        const name = `cf_${f.key}`;
        return (
          <div key={f.id} className={f.type === "textarea" ? "sm:col-span-3" : ""}>
            {f.type !== "checkbox" && <label className="label">{f.label}{f.required && " *"}</label>}
            {f.type === "select" ? <select name={name} defaultValue={v ?? ""} className="input"><option value="">—</option>{f.options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select>
              : f.type === "checkbox" ? <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={!!v} /> {f.label}</label>
              : f.type === "textarea" ? <textarea name={name} defaultValue={v ?? ""} rows={2} className="input" />
              : <input name={name} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step="any" defaultValue={v ?? ""} className="input" />}
          </div>
        );
      })}
    </div>
  );
}

export function CustomFieldValues({ fields, values = {} }: { fields: CustomField[]; values?: Record<string, any> }) {
  const shown = fields.filter((f) => values[f.key] !== undefined && values[f.key] !== "");
  if (!shown.length) return null;
  return <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{shown.map((f) => <div key={f.id} className="flex justify-between gap-2"><dt className="text-slate-500">{f.label}</dt><dd>{typeof values[f.key] === "boolean" ? (values[f.key] ? "Yes" : "No") : String(values[f.key])}</dd></div>)}</dl>;
}
