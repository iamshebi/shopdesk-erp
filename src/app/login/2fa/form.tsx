"use client";
import { useActionState } from "react";
import { verify2fa } from "../../auth-actions";

export default function TwoFactorForm() {
  const [state, action, pending] = useActionState(verify2fa, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label">6-digit code from your authenticator app</label>
        <input name="code" className="input text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus required />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
      <a href="/login" className="block text-center text-xs text-slate-400 hover:text-slate-600">Back to sign in</a>
    </form>
  );
}
