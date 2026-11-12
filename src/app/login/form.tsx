"use client";
import { useActionState } from "react";
import { login } from "../auth-actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label className="label">Username</label>
        <input name="username" className="input" autoFocus autoComplete="username" required />
      </div>
      <div>
        <label className="label">Password</label>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
