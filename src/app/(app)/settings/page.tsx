import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { EMIRATES } from "@/lib/util";
import { LABEL_SIZE_OPTIONS } from "@/lib/print";
import { PageHeader, Field } from "@/components/ui";
import Submit from "@/components/submit";
import LogoInput from "./logo-input";
import SettingsTabs from "@/components/settings-tabs";
import { updateSettings } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("settings");
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Shop details, branding, VAT and invoices" />
      <SettingsTabs active="/settings" />
      {sp.welcome && (
        <div className="card mb-4 border-accent/30 bg-accent/5 p-4 text-sm">
          Your shop is ready. Add your logo, address and TRN here — they print on every invoice. Then add your staff under Staff & roles.
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

        <section className="card space-y-4 p-6">
          <div>
            <h2 className="font-semibold">Printing</h2>
            <p className="text-sm text-slate-500">Receipts and repair tickets print on the thermal printer; barcode and IMEI labels on the label printer. In the Windows app, choose the printers in File → Printer setup.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Receipt paper">
              <select name="receipt_width" defaultValue={s.receipt_width} className="input">
                <option value="80">80 mm thermal (most shops)</option>
                <option value="58">58 mm thermal (small printers)</option>
              </select>
            </Field>
            <Field label="Counter number (printed on receipts)">
              <input name="receipt_counter" defaultValue={s.receipt_counter} className="input" maxLength={10} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="auto_receipt" defaultChecked={s.auto_receipt} /> Print the receipt automatically after every sale
            </label>
            <Field label="Labels">
              <select name="label_size" defaultValue={s.label_size} className="input">
                {LABEL_SIZE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
        </section>
        <Submit>Save settings</Submit>
      </form>

    </div>
  );
}
