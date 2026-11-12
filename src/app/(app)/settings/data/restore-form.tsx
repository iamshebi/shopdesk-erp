"use client";
import { useActionState } from "react";
import { restore } from "./actions";

export default function RestoreForm() {
  const [state, action, pending] = useActionState(restore, null);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".json" className="block text-sm" required />
      <div className="flex gap-2">
        <input name="confirm" placeholder="Type RESTORE" className="input max-w-40" autoComplete="off" />
        <button className="btn-danger" disabled={pending}>{pending ? "Restoring…" : "Restore backup"}</button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
