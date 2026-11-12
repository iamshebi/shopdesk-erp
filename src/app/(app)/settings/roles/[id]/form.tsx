"use client";
import { useActionState, useState } from "react";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { saveRole } from "../../staff/actions";

export default function RoleForm({ role }: { role: { id: number; name: string; perms: string[] } | null }) {
  const [state, action, pending] = useActionState(saveRole, null);
  const [sel, setSel] = useState<Set<string>>(new Set(role?.perms ?? []));
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <form action={action} className="space-y-4">
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="card p-5">
        <label className="label">Role name</label>
        <input name="name" defaultValue={role?.name} className="input max-w-sm" placeholder="e.g. Senior cashier" required autoFocus={!role} />
      </div>
      {PERMISSION_GROUPS.map((g) => {
        const all = g.perms.every((p) => sel.has(p.key));
        return (
          <div key={g.group} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{g.group}</h3>
              <button type="button" className="text-xs text-accent hover:underline"
                onClick={() => setSel((s) => { const n = new Set(s); g.perms.forEach((p) => (all ? n.delete(p.key) : n.add(p.key))); return n; })}>
                {all ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {g.perms.map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" name="perm" value={p.key} checked={sel.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                  <span>{p.label}{p.hint && <span className="block text-xs text-slate-400">{p.hint}</span>}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="sticky bottom-4 z-10 flex w-fit items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2 pr-4 shadow-lg backdrop-blur">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save role"}</button>
        <span className="text-sm text-slate-500">{sel.size} permissions selected</span>
      </div>
    </form>
  );
}
