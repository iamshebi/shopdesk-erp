import "server-only";
import { getSettings } from "./settings";
import { decryptField } from "./totp";

async function secret(v: string) { try { return v ? await decryptField(v) : ""; } catch { return ""; } }
const intl = (phone: string) => { let d = phone.replace(/\D/g, ""); if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = "971" + d.slice(1); return d; };

export async function channelsReady() {
  const s = await getSettings();
  return { email: !!(s.resend_key_enc && s.email_from), sms: !!(s.sms_provider_url && s.sms_key_enc), whatsapp: !!(s.whatsapp_token_enc && s.whatsapp_phone_id) };
}

/** SMS through any HTTP gateway. The URL template uses {to}, {text} and {key}. */
export async function sendSms(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSettings();
  const key = await secret(s.sms_key_enc);
  if (!s.sms_provider_url || !key) return { ok: false, error: "SMS is not set up" };
  try {
    const url = s.sms_provider_url.replace("{to}", encodeURIComponent(intl(to))).replace("{text}", encodeURIComponent(text)).replace("{key}", encodeURIComponent(key));
    const r = await fetch(url, { method: s.sms_provider_url.includes("{text}") ? "GET" : "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: s.sms_provider_url.includes("{text}") ? undefined : JSON.stringify({ to: intl(to), text }), signal: AbortSignal.timeout(10000) });
    return r.ok ? { ok: true } : { ok: false, error: `SMS gateway error ${r.status}` };
  } catch (e: any) { return { ok: false, error: e?.message ?? "SMS gateway unreachable" }; }
}

/** WhatsApp Business Cloud API (Meta). Free-form text only reaches customers who messaged you in the last 24 h; use approved templates for the rest. */
export async function sendWhatsApp(to: string, text: string, template?: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getSettings();
  const token = await secret(s.whatsapp_token_enc);
  if (!token || !s.whatsapp_phone_id) return { ok: false, error: "WhatsApp Business API is not set up" };
  try {
    const body = template ? { messaging_product: "whatsapp", to: intl(to), type: "template", template: { name: template, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text }] }] } }
      : { messaging_product: "whatsapp", to: intl(to), type: "text", text: { body: text } };
    const r = await fetch(`https://graph.facebook.com/v21.0/${s.whatsapp_phone_id}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j?.error?.message ?? `WhatsApp error ${r.status}` };
  } catch (e: any) { return { ok: false, error: e?.message ?? "WhatsApp unreachable" }; }
}
