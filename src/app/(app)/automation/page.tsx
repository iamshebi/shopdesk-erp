import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TRIGGERS, ACTIONS } from "@/lib/automation";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { saveRule, toggleRule, deleteRule, runNow } from "./actions";

export default async function AutomationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("integrations");
  const sp = await searchParams;
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const rules = await q<any>("SELECT r.*, u.name who, (SELECT count(*)::int FROM automation_log l WHERE l.rule_id=r.id) fired FROM automation_rules r LEFT JOIN users u ON u.id=r.assignee_id ORDER BY r.id");
  const logs = await q<any>("SELECT l.*, r.name FROM automation_log l JOIN automation_rules r ON r.id=l.rule_id ORDER BY l.id DESC LIMIT 15");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Automation" subtitle="When something happens, create a task, send an email or call another app. Runs every morning at 6 am.">
        <form action={runNow}><Submit className="btn-ghost">Run all now</Submit></form>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={saveRule} className="card mb-6 grid gap-3 p-5 sm:grid-cols-6">
        <div className="sm:col-span-3"><label className="label">When</label><select name="trigger" className="input">{TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        <div><label className="label">N (days / hours / qty)</label><input name="threshold" defaultValue="3" className="input" inputMode="decimal" /></div>
        <div className="sm:col-span-2"><label className="label">Rule name</label><input name="name" className="input" placeholder="optional" /></div>
        <div className="sm:col-span-2"><label className="label">Then</label><select name="action" className="input">{ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Task / notification for</label><select name="assignee_id" className="input"><option value="">— unassigned —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label">Email to</label><input name="email" className="input" placeholder="for email action" /></div>
        <div className="sm:col-span-6"><Submit>Add rule</Submit></div>
      </form>
      <div className="card mb-6 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Rule</th><th>Then</th><th>Fired</th><th>Last run</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <td className="font-medium">{r.name}<div className="text-xs font-normal text-slate-400">{TRIGGERS.find((t) => t.id === r.trigger)?.label} {Number(r.threshold) > 0 && `· N=${Number(r.threshold)}`}</div></td>
                <td>{r.action === "task" ? `Task for ${r.who ?? "anyone"}` : r.action === "notify" ? `Notify ${r.who ?? "managers"}` : r.action === "email" ? `Email ${r.email}` : "Webhook"}</td>
                <td>{r.fired}</td><td className="text-slate-500">{r.last_run_at ? fmtDate(r.last_run_at, true) : "—"}</td>
                <td className="text-right"><div className="flex justify-end gap-1">
                  <form action={runNow}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">Run now</Submit></form>
                  <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">{r.active ? "Pause" : "Resume"}</Submit></form>
                  <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm" confirm="Delete this rule?">Delete</Submit></form></div></td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">No rules yet. Try “Low stock → task for the store keeper”.</td></tr>}
          </tbody>
        </table>
      </div>
      {logs.length > 0 && <div className="card p-5 text-sm"><h3 className="mb-2 font-semibold">Recent</h3>{logs.map((l) => <div key={l.id} className="py-0.5"><span className="text-xs text-slate-400">{fmtDate(l.created_at, true)}</span> <Badge tone="slate">{l.name}</Badge> {l.message}</div>)}</div>}
    </div>
  );
}
