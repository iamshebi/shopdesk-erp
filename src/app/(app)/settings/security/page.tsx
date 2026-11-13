import { q, one } from "@/lib/db";
import { requireUser, deviceName } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge, Stat, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import SettingsTabs from "@/components/settings-tabs";
import { saveSecuritySettings, revokeSession, unlockUser, reset2fa } from "./actions";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser("staff");
  const sp = await searchParams;
  const s = await getSettings();
  const counts = await one<any>(
    `SELECT (SELECT count(*)::int FROM login_events WHERE NOT success AND created_at > now() - interval '24 hours') failed24,
            (SELECT count(*)::int FROM sessions WHERE revoked_at IS NULL AND last_seen_at > now() - interval '14 days') active,
            (SELECT count(*)::int FROM users WHERE active) staff,
            (SELECT count(*)::int FROM users WHERE active AND totp_enabled) with2fa,
            (SELECT count(*)::int FROM users WHERE locked_until > now()) locked`,
  );
  const users = await q<any>(
    `SELECT u.id, u.name, u.username, u.totp_enabled, u.failed_logins, u.locked_until > now() AS locked, u.last_login_at, r.name role
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active ORDER BY u.name`,
  );
  const sessions = await q<any>(
    `SELECT s.id, s.ip, s.user_agent, s.created_at, s.last_seen_at, u.name FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.revoked_at IS NULL AND s.last_seen_at > now() - interval '14 days' ORDER BY s.last_seen_at DESC LIMIT 100`,
  );
  const failedOnly = !!sp.failed;
  const logins = await q<any>(
    `SELECT l.*, u.name FROM login_events l LEFT JOIN users u ON u.id=l.user_id ${failedOnly ? "WHERE NOT l.success" : ""} ORDER BY l.id DESC LIMIT 200`,
  );

  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Sign-in security, devices and login history" />
      <SettingsTabs active="/settings/security" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Failed sign-ins, last 24 h" value={String(counts.failed24)} hint={counts.locked ? `${counts.locked} account locked now` : "no locked accounts"} href="/settings/security?failed=1" />
        <Stat label="Signed-in devices" value={String(counts.active)} hint="active in the last 14 days" />
        <Stat label="Staff with two-step login" value={`${counts.with2fa} of ${counts.staff}`} hint="each person turns it on in My account" />
        <Stat label="Auto sign-out" value={s.idle_timeout_minutes ? `${s.idle_timeout_minutes} min` : "Off"} hint="after no activity" />
      </div>

      <section className="card mb-6 p-6">
        <h2 className="font-semibold">Rules</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">After 5 wrong passwords an account is locked for 15 minutes. Idle devices are signed out automatically.</p>
        <form action={saveSecuritySettings} className="flex flex-wrap items-end gap-3">
          <div><label className="label">Sign out after this many idle minutes (0 = never)</label><input name="idle_timeout_minutes" type="number" min={0} max={720} defaultValue={s.idle_timeout_minutes} className="input w-40" /></div>
          <Submit>Save</Submit>
        </form>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <div className="p-6 pb-3 font-semibold">Staff accounts</div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Two-step</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name} <span className="text-xs text-slate-400">@{u.username}</span></td>
                <td>{u.role}</td>
                <td>{u.totp_enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</td>
                <td>{u.locked ? <Badge tone="red">Locked</Badge> : u.failed_logins ? <Badge tone="amber">{u.failed_logins} failed</Badge> : <Badge tone="green">OK</Badge>}</td>
                <td className="text-slate-500">{u.last_login_at ? fmtDate(u.last_login_at, true) : "Never"}</td>
                <td className="whitespace-nowrap text-right">
                  {u.locked && <form action={unlockUser} className="inline"><input type="hidden" name="id" value={u.id} /><Submit className="btn-ghost btn-sm">Unlock</Submit></form>}
                  {u.totp_enabled && u.id !== me.id && <form action={reset2fa} className="ml-2 inline"><input type="hidden" name="id" value={u.id} /><Submit className="btn-ghost btn-sm" confirm={`Reset two-step login for ${u.name}? Use this if they lost their phone.`}>Reset 2FA</Submit></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <div className="p-6 pb-3 font-semibold">Signed-in devices</div>
        {sessions.length === 0 ? <Empty>No active devices.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Device</th><th>IP address</th><th>Last active</th><th></th></tr></thead>
            <tbody>
              {sessions.map((x) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.name}</td>
                  <td>{deviceName(x.user_agent)} {x.id === me.sid && <Badge tone="green">You</Badge>}</td>
                  <td className="text-slate-500">{x.ip || "—"}</td>
                  <td className="text-slate-500">{fmtDate(x.last_seen_at, true)}</td>
                  <td className="text-right">{x.id !== me.sid && <form action={revokeSession}><input type="hidden" name="sid" value={x.id} /><Submit className="btn-ghost btn-sm" confirm={`Sign out this device of ${x.name}?`}>Sign out</Submit></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between p-6 pb-3">
          <span className="font-semibold">Login history</span>
          <a href={failedOnly ? "/settings/security" : "/settings/security?failed=1"} className="btn-ghost btn-sm">{failedOnly ? "Show all" : "Failed only"}</a>
        </div>
        {logins.length === 0 ? <Empty>No sign-ins recorded yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Username</th><th>Result</th><th>Device</th><th>IP address</th></tr></thead>
            <tbody>
              {logins.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(l.created_at, true)}</td>
                  <td className="font-medium">{l.name ?? l.username}</td>
                  <td>{l.success ? <Badge tone="green">Signed in</Badge> : <Badge tone="red">{l.reason || "Failed"}</Badge>}</td>
                  <td>{deviceName(l.user_agent)}</td>
                  <td className="text-slate-500">{l.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
