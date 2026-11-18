import QRCode from "qrcode";
import { q, one } from "@/lib/db";
import { requireUser, deviceName } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { decryptField, otpauthUri } from "@/lib/totp";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge, Field } from "@/components/ui";
import Submit from "@/components/submit";
import { ShieldCheck, ShieldOff, KeyRound, MonitorSmartphone } from "lucide-react";
import { changePassword, start2fa, confirm2fa, disable2fa, revokeMySession, revokeOtherSessions } from "./actions";

import { setLanguage } from "../prefs-actions";
import { getPref } from "@/lib/prefs";

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser();
  const lang = await getPref<string>(me.id, "lang", "en");
  const sp = await searchParams;
  const s = await getSettings();
  const u = await one<any>("SELECT totp_enabled, totp_secret, password_changed_at, created_at FROM users WHERE id=$1", [me.id]);
  let qr = "", secret = "";
  if (sp.setup && !u.totp_enabled && u.totp_secret) {
    secret = await decryptField(u.totp_secret);
    qr = await QRCode.toDataURL(otpauthUri(secret, me.username, s.shop_name || "DOLLAR44 ERP"), { margin: 1, width: 220 });
  }
  const sessions = await q<any>("SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY last_seen_at DESC", [me.id]);
  const logins = await q<any>("SELECT success, reason, ip, user_agent, created_at FROM login_events WHERE user_id=$1 ORDER BY id DESC LIMIT 10", [me.id]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="My account" subtitle={`${me.name} · ${me.role}`} />
      <form action={setLanguage} className="card mb-6 flex flex-wrap items-center gap-3 p-4 text-sm"><span className="font-medium">Language / اللغة</span><select name="lang" defaultValue={lang} className="input w-40"><option value="en">English</option><option value="ar">العربية (menu, right-to-left)</option></select><Submit className="btn-dark btn-sm">Save</Submit><span className="text-xs text-slate-400">Arabic currently covers the menu and layout direction; page text stays in English. Invoices already print in both languages.</span></form>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            {u.totp_enabled ? <ShieldCheck size={18} className="text-emerald-600" /> : <ShieldOff size={18} className="text-slate-400" />}
            Two-step verification {u.totp_enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
          </div>
          <p className="mb-4 text-sm text-slate-500">After your password, DOLLAR44 ERP asks for a 6-digit code from an authenticator app on your phone. A stolen password alone is then not enough.</p>
          {u.totp_enabled ? (
            <form action={disable2fa} className="space-y-3">
              <Field label="Your password, to turn it off"><input name="password" type="password" className="input" required autoComplete="current-password" /></Field>
              <Submit className="btn-danger" confirm="Turn off two-step verification?">Turn off</Submit>
            </form>
          ) : qr ? (
            <form action={confirm2fa} className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>Install Google Authenticator or Microsoft Authenticator.</li>
                <li>Tap <b>+</b> and scan this code. On this same phone, enter the key below instead.</li>
                <li>Type the 6-digit code it shows.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for the authenticator app" className="h-44 w-44 rounded-xl border border-slate-200 bg-white p-2" />
              <div className="rounded-lg bg-slate-50 p-2 font-mono text-xs break-all">{secret.match(/.{1,4}/g)?.join(" ")}</div>
              <Field label="Code from the app"><input name="code" className="input tracking-widest" inputMode="numeric" maxLength={7} required autoComplete="one-time-code" /></Field>
              <Submit>Turn on</Submit>
            </form>
          ) : (
            <form action={start2fa}><Submit>Set up two-step verification</Submit></form>
          )}
        </section>

        <section className="card p-6">
          <div className="mb-1 flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-slate-400" /> Change password</div>
          <p className="mb-4 text-sm text-slate-500">{u.password_changed_at ? `Last changed ${fmtDate(u.password_changed_at)}.` : "Never changed since the account was made."} Changing it signs out your other devices.</p>
          <form action={changePassword} className="space-y-3">
            <Field label="Current password"><input name="current" type="password" className="input" required autoComplete="current-password" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New password"><input name="next" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
              <Field label="Repeat new password"><input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
            </div>
            <p className="text-xs text-slate-400">At least 8 characters, with letters and numbers.</p>
            <Submit>Change password</Submit>
          </form>
        </section>
      </div>

      <section className="card mt-6 overflow-x-auto">
        <div className="flex items-center justify-between p-6 pb-3">
          <div className="flex items-center gap-2 font-semibold"><MonitorSmartphone size={18} className="text-slate-400" /> Signed-in devices</div>
          {sessions.length > 1 && <form action={revokeOtherSessions}><Submit className="btn-ghost btn-sm" confirm="Sign out every other device?">Sign out all others</Submit></form>}
        </div>
        <table className="tbl">
          <thead><tr><th>Device</th><th>IP address</th><th>Signed in</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            {sessions.map((x) => (
              <tr key={x.id}>
                <td className="font-medium">{deviceName(x.user_agent)} {x.id === me.sid && <Badge tone="green">This device</Badge>}</td>
                <td className="text-slate-500">{x.ip || "—"}</td>
                <td className="text-slate-500">{fmtDate(x.created_at, true)}</td>
                <td className="text-slate-500">{fmtDate(x.last_seen_at, true)}</td>
                <td className="text-right">{x.id !== me.sid && <form action={revokeMySession}><input type="hidden" name="sid" value={x.id} /><Submit className="btn-ghost btn-sm">Sign out</Submit></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-6 overflow-x-auto">
        <div className="p-6 pb-3 font-semibold">Recent sign-ins</div>
        <table className="tbl">
          <thead><tr><th>When</th><th>Result</th><th>Device</th><th>IP address</th></tr></thead>
          <tbody>
            {logins.map((l, i) => (
              <tr key={i}>
                <td className="text-slate-500">{fmtDate(l.created_at, true)}</td>
                <td>{l.success ? <Badge tone="green">Signed in</Badge> : <Badge tone="red">{l.reason || "Failed"}</Badge>}</td>
                <td>{deviceName(l.user_agent)}</td>
                <td className="text-slate-500">{l.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
