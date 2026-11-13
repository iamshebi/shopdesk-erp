"use client";
import { useActionState } from "react";
import { resetEverything } from "./actions";

export default function ResetForm({ shopName }: { shopName: string }) {
  const [state, action, pending] = useActionState(resetEverything, null);
  return (
    <form action={action} className="space-y-3" onSubmit={(e) => { if (!window.confirm("Delete ALL data permanently? Download a backup first if you might need anything.")) e.preventDefault(); }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="shop" placeholder={`Type the shop name: ${shopName}`} className="input" autoComplete="off" />
        <input name="confirm" placeholder="Type RESET" className="input" autoComplete="off" />
      </div>
      <button className="btn-danger" disabled={pending}>{pending ? "Resetting…" : "Delete everything and start fresh"}</button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
