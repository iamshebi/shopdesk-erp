"use client";
import { useActionState } from "react";
import { setupShop } from "../auth-actions";
import { EMIRATES } from "@/lib/util";

export default function SetupForm() {
  const [state, action, pending] = useActionState(setupShop, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label">Shop name</label>
        <input name="shop_name" className="input" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="input" />
        </div>
        <div>
          <label className="label">Emirate</label>
          <select name="emirate" className="input" defaultValue="Dubai">
            {EMIRATES.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">VAT TRN (15 digits)</label>
        <input name="trn" className="input" inputMode="numeric" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="vat_registered" defaultChecked /> Shop is VAT registered
      </label>
      <hr className="border-slate-100" />
      <div>
        <label className="label">Owner full name</label>
        <input name="name" className="input" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Username</label>
          <input name="username" className="input" required autoComplete="username" />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" required autoComplete="new-password" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Create shop"}
      </button>
    </form>
  );
}
