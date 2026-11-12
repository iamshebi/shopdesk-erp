import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { EMIRATES, fmtDate } from "@/lib/util";
import { PageHeader, Field, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import LogoInput from "./logo-input";
import { updateSettings, addUser, toggleUser, resetPassword } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser("settings");
  const sp = await searchParams;
  const s = await getSettings();
  const users = await q("SELECT id, name, username, role, active, created_at FROM users ORDER BY id");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Shop details, branding, VAT and staff accounts" />
      {sp.welcome && (
        <div className="card mb-4 border-accent/30 bg-accent/5 p-4 text-sm">
          Your shop is ready. Add your logo, address and TRN here — they print on every invoice.
        </div>
      )}
      {sp.saved && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">Saved.</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <form action={updateSettings} className="space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Shop & branding</h2>
          <LogoInput initial={s.logo} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name (shown everywhere)"><input name="shop_name" defaultValue={s.shop_name} className="input" required /></Field>
            <Field label="Shop name in Arabic (optional)"><input name="shop_name_ar" defaultValue={s.shop_name_ar} className="input" dir="rtl" /></Field>
            <Field label="Legal / trade licence name"><input name="legal_name" defaultValue={s.legal_name} className="input" /></Field>
            <Field label="Brand colour"><input name="accent" type="color" defaultValue={s.accent} className="input h-10 p-1" /></Field>
            <Field label="Phone"><input name="phone" defaultValue={s.phone} className="input" /></Field>
            <Field label="Email"><input name="email" defaultValue={s.email} className="input" /></Field>
            <Field label="Website"><input name="website" defaultValue={s.website} className="input" /></Field>
            <Field label="Emirate">
              <select name="emirate" defaultValue={s.emirate} className="input">
                {EMIRATES.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Address" className="sm:col-span-2"><input name="address" defaultValue={s.address} className="input" /></Field>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">VAT & invoices</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="TRN"><input name="trn" defaultValue={s.trn} className="input" inputMode="numeric" /></Field>
            <Field label="VAT rate %"><input name="vat_rate" defaultValue={s.vat_rate} className="input" inputMode="decimal" /></Field>
            <Field label="Invoice number prefix"><input name="invoice_prefix" defaultValue={s.invoice_prefix} className="input" /></Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="vat_registered" defaultChecked={s.vat_registered} /> VAT registered</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="prices_include_vat" defaultChecked={s.prices_include_vat} /> Selling prices include VAT</label>
          </div>
          <Field label="Invoice terms (printed at bottom)"><textarea name="invoice_terms" defaultValue={s.invoice_terms} rows={3} className="input" /></Field>
          <Field label="Repair job card terms"><textarea name="repair_terms" defaultValue={s.repair_terms} rows={3} className="input" /></Field>
        </section>
        <Submit>Save settings</Submit>
      </form>

      <section className="card mt-8 overflow-hidden">
        <div className="p-6 pb-3"><h2 className="font-semibold">Staff accounts</h2></div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Since</th><th></th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td>{u.username}</td>
                <td className="capitalize">{u.role} {!u.active && <Badge tone="red">disabled</Badge>}</td>
                <td className="text-slate-500">{fmtDate(u.created_at)}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <form action={resetPassword} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input name="password" type="password" placeholder="New password" className="input h-8 w-32 text-xs" />
                      <button className="btn-ghost btn-sm">Reset</button>
                    </form>
                    {u.id !== me.id && (
                      <form action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn-ghost btn-sm">{u.active ? "Disable" : "Enable"}</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addUser} className="grid gap-3 border-t border-slate-100 p-6 sm:grid-cols-5">
          <input name="name" placeholder="Full name" className="input" required />
          <input name="username" placeholder="Username" className="input" required />
          <input name="password" type="password" placeholder="Password" className="input" required />
          <select name="role" className="input" defaultValue="cashier">
            <option value="cashier">Cashier</option>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
          <Submit>Add staff</Submit>
        </form>
        <p className="px-6 pb-6 text-xs text-slate-400">
          Cashier: sales, repairs, buy-used, stock view. Technician: repairs only. Manager: everything except settings. Owner: everything.
        </p>
      </section>
    </div>
  );
}
