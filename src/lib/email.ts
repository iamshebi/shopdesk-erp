import "server-only";
import { q } from "./db";
import { getSettings } from "./settings";
import { decryptField } from "./totp";

export async function emailReady() {
  const s = await getSettings();
  return !!(s.resend_key_enc && s.email_from);
}

/** Sends through Resend (resend.com). Logged in email_log either way. */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSettings();
  let key = "";
  try { key = s.resend_key_enc ? await decryptField(s.resend_key_enc) : ""; } catch { key = ""; }
  let res: { ok: boolean; error?: string };
  if (!key || !s.email_from) res = { ok: false, error: "Email is not set up (Settings → Integrations)" };
  else if (!/^\S+@\S+\.\S+$/.test(to)) res = { ok: false, error: "No valid email address" };
  else {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${s.shop_name} <${s.email_from}>`, to: [to], subject, html }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await r.json().catch(() => ({}));
      res = r.ok ? { ok: true } : { ok: false, error: (body as any)?.message || `Email service error ${r.status}` };
    } catch (e: any) {
      res = { ok: false, error: e?.message || "Email service unreachable" };
    }
  }
  await q("INSERT INTO email_log (to_addr, subject, status, error) VALUES ($1,$2,$3,$4)", [to, subject, res.ok ? "sent" : "failed", res.error ?? ""]);
  return res;
}

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
