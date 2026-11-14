"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { saveSettings, getSettings } from "@/lib/settings";
import { encryptField } from "@/lib/totp";
import { newKey } from "@/lib/apikeys";
import { sendEmail } from "@/lib/email";
import { fireWebhook } from "@/lib/webhooks";
import { str, numf } from "@/lib/util";

const P = "/settings/integrations";
function go(msg: string, kind: "ok" | "err" = "ok", extra = ""): never {
  redirect(`${P}?${kind}=${encodeURIComponent(msg)}${extra}`);
}

export async function saveEmailSettings(fd: FormData) {
  const user = await requireUser("integrations");
  const key = str(fd, "resend_key");
  await saveSettings({
    email_from: str(fd, "email_from"), daily_report_email: str(fd, "daily_report_email"), scheduled_report: ["weekly", "monthly"].includes(str(fd, "scheduled_report")) ? str(fd, "scheduled_report") : "off",
    auto_reminders: str(fd, "auto_reminders") === "on", reminder_every_days: Math.max(1, Math.round(numf(fd, "reminder_every_days")) || 7),
    ...(key ? { resend_key_enc: await encryptField(key) } : {}), ...(str(fd, "forget") === "on" ? { resend_key_enc: "" } : {}),
  });
  await log(user.id, "Email settings changed", "", P);
  go("Email settings saved");
}

export async function testEmail(fd: FormData) {
  await requireUser("integrations");
  const s = await getSettings();
  const r = await sendEmail(str(fd, "to"), `Test email from ${s.shop_name}`, `<p>Email from ShopDesk ERP is working.</p>`);
  go(r.ok ? `Test email sent to ${str(fd, "to")}` : r.error ?? "Failed", r.ok ? "ok" : "err");
}

export async function savePaymentSettings(fd: FormData) {
  const user = await requireUser("integrations");
  const sk = str(fd, "stripe_key"), wh = str(fd, "stripe_webhook_secret");
  if (sk && !/^(sk|rk)_(live|test)_/.test(sk)) go("That doesn't look like a Stripe secret key (sk_live_… or sk_test_…)", "err");
  await saveSettings({
    ...(sk ? { stripe_key_enc: await encryptField(sk) } : {}), ...(wh ? { stripe_webhook_secret_enc: await encryptField(wh) } : {}),
    ...(str(fd, "forget") === "on" ? { stripe_key_enc: "", stripe_webhook_secret_enc: "" } : {}),
  });
  await log(user.id, "Online payment settings changed", "", P);
  go("Payment settings saved");
}

export async function saveShippingCurrency(fd: FormData) {
  await requireUser("integrations");
  await saveSettings({ couriers: str(fd, "couriers") });
  const code = str(fd, "code").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (code.length === 3 && numf(fd, "rate") > 0) await q("INSERT INTO currencies (code, name, rate) VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET rate=$3, name=COALESCE(NULLIF($2,''), currencies.name), updated_at=now()", [code, str(fd, "name"), numf(fd, "rate")]);
  go("Saved");
}

export async function deleteCurrency(fd: FormData) {
  await requireUser("integrations");
  await q("DELETE FROM currencies WHERE code=$1", [str(fd, "code")]);
  go("Currency removed");
}

export async function createApiKey(fd: FormData) {
  const user = await requireUser("integrations");
  const k = newKey();
  await q("INSERT INTO api_keys (name, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5)", [str(fd, "name") || "API key", k.prefix, k.hash, str(fd, "scopes") === "write" ? "write" : "read", user.id]);
  await log(user.id, "API key created", str(fd, "name"), P);
  go("API key created. Copy it now: it won't be shown again.", "ok", `&newkey=${encodeURIComponent(k.key)}`);
}

export async function revokeApiKey(fd: FormData) {
  const user = await requireUser("integrations");
  await q("UPDATE api_keys SET revoked=TRUE WHERE id=$1", [Number(str(fd, "id"))]);
  await log(user.id, "API key revoked", `#${str(fd, "id")}`, P);
  go("Key revoked");
}

export async function addWebhook(fd: FormData) {
  const user = await requireUser("integrations");
  const url = str(fd, "url");
  if (!/^https:\/\//.test(url)) go("Webhook URL must start with https://", "err");
  const events = fd.getAll("events").map(String).filter(Boolean);
  await q("INSERT INTO webhooks (url, events, secret) VALUES ($1,$2,$3)", [url, events.length ? events.join(",") : "*", crypto.randomBytes(20).toString("hex")]);
  await log(user.id, "Webhook added", url, P);
  go("Webhook added");
}

export async function deleteWebhook(fd: FormData) {
  await requireUser("integrations");
  await q("DELETE FROM webhooks WHERE id=$1", [Number(str(fd, "id"))]);
  go("Webhook removed");
}

export async function testWebhook() {
  await requireUser("integrations");
  await fireWebhook("test", { hello: "from ShopDesk ERP" });
  revalidatePath(P);
  go("Test event sent. See deliveries below.");
}

export async function saveMessaging(fd: FormData) {
  const user = await requireUser("integrations");
  const sms = str(fd, "sms_key"), wa = str(fd, "whatsapp_token");
  await saveSettings({ sms_provider_url: str(fd, "sms_provider_url"), whatsapp_phone_id: str(fd, "whatsapp_phone_id"),
    ...(sms ? { sms_key_enc: await encryptField(sms) } : {}), ...(wa ? { whatsapp_token_enc: await encryptField(wa) } : {}),
    ...(str(fd, "forget") === "on" ? { sms_key_enc: "", whatsapp_token_enc: "" } : {}) });
  await log(user.id, "Messaging settings changed", "", P);
  go("Messaging settings saved");
}

export async function newSheetLink() {
  const user = await requireUser("integrations");
  await saveSettings({ sheet_token: crypto.randomBytes(18).toString("base64url") });
  await log(user.id, "Google Sheets link created", "", P);
  go("New spreadsheet link created. Old links stop working.");
}
