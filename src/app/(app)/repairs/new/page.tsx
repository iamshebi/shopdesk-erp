import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { todayDubai, PAYMENT_METHODS } from "@/lib/util";
import { PageHeader, Field } from "@/components/ui";
import Submit from "@/components/submit";
import { createRepair } from "../actions";

export default async function NewRepair() {
  await requireUser("repairs");
  const techs = await q<{ id: number; name: string }>("SELECT id, name FROM users WHERE active ORDER BY role='technician' DESC, name");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New job card" subtitle="Record the device when the customer drops it off" />
      <form action={createRepair} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name"><input name="customer_name" className="input" required autoFocus /></Field>
          <Field label="Customer phone (WhatsApp)"><input name="customer_phone" className="input" inputMode="tel" required /></Field>
          <Field label="Device (brand & model)"><input name="device" className="input" placeholder="e.g. iPhone 13 Pro" required /></Field>
          <Field label="IMEI / serial"><input name="imei" className="input font-mono" /></Field>
          <Field label="Problem reported" className="sm:col-span-2"><textarea name="issue" rows={2} className="input" required placeholder="e.g. Screen broken, touch not working" /></Field>
          <Field label="Accessories received"><input name="accessories" className="input" placeholder="SIM tray, case, charger…" /></Field>
          <Field label="Condition on arrival"><input name="condition_notes" className="input" placeholder="Scratches on back, dent on corner…" /></Field>
          <Field label="Passcode / pattern (optional)"><input name="passcode" className="input" /></Field>
          <Field label="Technician">
            <select name="technician_id" className="input"><option value="">Unassigned</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </Field>
          <Field label="Estimated charge"><input name="estimate" className="input" inputMode="decimal" /></Field>
          <Field label="Promised date"><input name="promised_at" type="date" min={todayDubai()} className="input" /></Field>
          <Field label="Advance paid"><input name="advance" className="input" inputMode="decimal" defaultValue="0" /></Field>
          <Field label="Advance paid by">
            <select name="advance_method" className="input">{PAYMENT_METHODS.filter((m) => m.id !== "credit" && m.id !== "store_credit").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </Field>
        </div>
        <Submit>Create job card</Submit>
      </form>
    </div>
  );
}
