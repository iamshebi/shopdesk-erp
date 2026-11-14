import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { PageHeader, Stat, Badge } from "@/components/ui";
import SettingsTabs from "@/components/settings-tabs";
import Submit from "@/components/submit";
import { clearErrors } from "./actions";

export default async function SystemPage() {
  await requireUser("settings");
  const t0 = Date.now();
  await one("SELECT 1");
  const ping = Date.now() - t0;
  const size = await one<any>("SELECT pg_size_pretty(pg_database_size(current_database())) s, pg_database_size(current_database())::bigint b").catch(() => null);
  const version = await one<any>("SELECT version() v").catch(() => null);
  const counts = await one<any>(`SELECT (SELECT count(*)::int FROM products) products, (SELECT count(*)::int FROM customers) customers, (SELECT count(*)::int FROM sales) invoices, (SELECT count(*)::int FROM orders) orders,
    (SELECT count(*)::int FROM stock_moves) moves, (SELECT count(*)::int FROM journal_entries) journals, (SELECT count(*)::int FROM files) files, (SELECT COALESCE(sum(size),0)::bigint FROM files) file_bytes,
    (SELECT count(*)::int FROM sessions) sessions, (SELECT max(last_run_at) FROM automation_rules) auto_last, (SELECT count(*)::int FROM error_log WHERE created_at > now() - interval '24 hours') err24,
    (SELECT count(*)::int FROM email_log WHERE status='failed' AND created_at > now() - interval '7 days') mail_fail, (SELECT count(*)::int FROM webhook_deliveries WHERE (status < 200 OR status >= 300) AND created_at > now() - interval '7 days') hook_fail,
    (SELECT count(*)::int FROM api_log WHERE created_at > now() - interval '24 hours') api24`);
  const errors = await q<any>("SELECT * FROM error_log ORDER BY id DESC LIMIT 30");
  const api = await q<any>("SELECT l.*, k.name FROM api_log l LEFT JOIN api_keys k ON k.id=l.key_id ORDER BY l.id DESC LIMIT 30");
  const mails = await q<any>("SELECT * FROM email_log ORDER BY id DESC LIMIT 15");
  const checks = [
    { ok: ping < 800, label: "Database responds", detail: `${ping} ms` },
    { ok: !!process.env.SESSION_SECRET || !process.env.VERCEL, label: "Login secret set on the server", detail: process.env.SESSION_SECRET ? "yes" : "stored in database" },
    { ok: !process.env.VERCEL || !!process.env.CRON_SECRET, label: "Daily jobs (recurring invoices, reminders, automation)", detail: process.env.CRON_SECRET ? "scheduled 6 am" : "not scheduled" },
    { ok: counts.err24 === 0, label: "Errors in the last 24 hours", detail: String(counts.err24) },
    { ok: counts.mail_fail === 0, label: "Failed emails (7 days)", detail: String(counts.mail_fail) },
    { ok: counts.hook_fail === 0, label: "Failed webhooks (7 days)", detail: String(counts.hook_fail) },
  ];
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Is everything running? Errors, API calls and emails" />
      <SettingsTabs active="/settings/system" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Database size" value={size?.s ?? "local file"} hint={version?.v?.split(" ").slice(0, 2).join(" ")} /><Stat label="Files stored" value={`${counts.files}`} hint={`${Math.round(Number(counts.file_bytes) / 1024 / 1024 * 10) / 10} MB`} />
        <Stat label="Signed-in devices" value={String(counts.sessions)} href="/settings/security" /><Stat label="API calls (24 h)" value={String(counts.api24)} />
      </div>
      <div className="card mb-6 p-5"><h3 className="mb-3 font-semibold">Health checks</h3>
        {checks.map((c) => <div key={c.label} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm"><span>{c.label}</span><span className="flex items-center gap-2 text-slate-500">{c.detail}<Badge tone={c.ok ? "green" : "red"}>{c.ok ? "OK" : "Check"}</Badge></span></div>)}
        <p className="mt-3 text-xs text-slate-400">Records: {counts.products} products · {counts.customers} customers · {counts.invoices} invoices · {counts.orders} orders · {counts.moves} stock movements · {counts.journals} journal entries. Automation last ran {counts.auto_last ? fmtDate(counts.auto_last, true) : "never"}.</p>
      </div>
      <div className="card mb-6 overflow-x-auto"><div className="flex items-center justify-between p-5 pb-2"><h3 className="font-semibold">Error log</h3>{errors.length > 0 && <form action={clearErrors}><Submit className="btn-ghost btn-sm" confirm="Clear the error log?">Clear</Submit></form>}</div>
        <table className="tbl"><tbody>{errors.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(e.created_at, true)}</td><td className="text-xs">{e.path}</td><td><details><summary className="cursor-pointer text-sm">{e.message}</summary><pre className="mt-1 max-w-xl overflow-x-auto text-[10px] text-slate-500">{e.detail}</pre></details></td></tr>)}
          {errors.length === 0 && <tr><td className="text-slate-400">No errors recorded 🎉</td></tr>}</tbody></table></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto"><div className="p-5 pb-2 font-semibold">API log</div><table className="tbl"><tbody>{api.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(a.created_at, true)}</td><td className="text-xs">{a.name ?? "—"}</td><td className="font-mono text-xs">{a.method} {a.path}</td></tr>)}{api.length === 0 && <tr><td className="text-slate-400">No API calls yet</td></tr>}</tbody></table></div>
        <div className="card overflow-x-auto"><div className="p-5 pb-2 font-semibold">Email log</div><table className="tbl"><tbody>{mails.map((m) => <tr key={m.id}><td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(m.created_at, true)}</td><td className="text-xs">{m.to_addr}<div className="text-slate-400">{m.subject}</div></td><td><Badge tone={m.status === "sent" ? "green" : "red"}>{m.status}</Badge></td></tr>)}{mails.length === 0 && <tr><td className="text-slate-400">No emails sent yet</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
