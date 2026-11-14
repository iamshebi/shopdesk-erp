import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { CF_ENTITIES, CF_TYPES } from "@/lib/custom-fields";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import SettingsTabs from "@/components/settings-tabs";
import { saveWorkflow, addCustomField, deleteCustomField } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function WorkflowPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("settings");
  const sp = await searchParams;
  const s = await getSettings();
  const fields = await q<any>("SELECT * FROM custom_fields ORDER BY entity, sort, id");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Approvals, closing the books and your own extra fields" />
      <SettingsTabs active="/settings/workflow" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={saveWorkflow} className="card mb-6 grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Approvals</h2>
        <div><label className="label">Expenses above this amount need approval (0 = never)</label><input name="expense_approval_limit" defaultValue={s.expense_approval_limit || ""} className="input" inputMode="decimal" /></div>
        <div><label className="label">Purchase requests up to this amount are approved automatically (0 = always need a manager)</label><input name="po_approval_limit" defaultValue={s.po_approval_limit || ""} className="input" inputMode="decimal" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="require_product_approval" defaultChecked={s.require_product_approval} /> New products must be approved by a manager before they can be sold or shown on the website</label>
        <p className="text-xs text-slate-500 sm:col-span-2">Who can approve is set in Staff &amp; roles: “Approve expenses”, “Approve purchase requests”, “Approve new products”. Owners can always approve.</p>
        <h2 className="mt-2 font-semibold sm:col-span-2">Financial year &amp; closing the books</h2>
        <div><label className="label">Financial year starts in</label><select name="fiscal_year_start_month" defaultValue={s.fiscal_year_start_month} className="input">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div><label className="label">Books closed up to (no expenses, purchases or journals on or before this date)</label><input type="date" name="books_locked_until" defaultValue={s.books_locked_until} className="input" /></div>
        <div className="sm:col-span-2"><Submit>Save</Submit></div>
      </form>
      <div className="card p-6">
        <h2 className="font-semibold">Custom fields</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Add your own boxes to products, customers, employees and orders, for example “Warranty months”, “Shelf”, “Passport expiry”.</p>
        <form action={addCustomField} className="mb-4 grid gap-2 sm:grid-cols-6">
          <select name="entity" className="input">{Object.entries(CF_ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="label" placeholder="Field name" className="input sm:col-span-2" required />
          <select name="type" className="input">{CF_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="options" placeholder="Choices: A, B, C" className="input" />
          <div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="required" /> Required</label><Submit className="btn-primary btn-sm">Add</Submit></div>
        </form>
        <table className="tbl"><tbody>
          {fields.map((f) => <tr key={f.id}><td className="text-slate-500">{CF_ENTITIES[f.entity]}</td><td className="font-medium">{f.label}{f.required && " *"}</td><td>{CF_TYPES.find(([k]) => k === f.type)?.[1]}{f.options && <span className="ml-1 text-xs text-slate-400">{f.options}</span>}</td>
            <td className="text-right"><form action={deleteCustomField}><input type="hidden" name="id" value={f.id} /><Submit className="btn-ghost btn-sm" confirm={`Remove the field “${f.label}”?`}>Remove</Submit></form></td></tr>)}
          {fields.length === 0 && <tr><td className="text-slate-400">No custom fields yet</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
