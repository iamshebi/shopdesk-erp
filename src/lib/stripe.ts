import "server-only";
import crypto from "node:crypto";
import { getSettings } from "./settings";
import { decryptField } from "./totp";

async function key(name: "stripe_key_enc" | "stripe_webhook_secret_enc") {
  const s = await getSettings();
  try { return s[name] ? await decryptField(s[name]) : ""; } catch { return ""; }
}

/** Creates a Stripe Checkout payment link for an amount (in the shop currency). */
export async function createPaymentLink(opts: { amount: number; currency: string; description: string; saleId: number; email?: string; baseUrl: string }) {
  const sk = await key("stripe_key_enc");
  if (!sk) throw new Error("Online payments are not set up (Settings → Integrations)");
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", `${opts.baseUrl}/pay/thanks`);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", opts.currency.toLowerCase());
  p.set("line_items[0][price_data][unit_amount]", String(Math.round(opts.amount * 100)));
  p.set("line_items[0][price_data][product_data][name]", opts.description);
  p.set("metadata[sale_id]", String(opts.saleId));
  p.set("payment_intent_data[metadata][sale_id]", String(opts.saleId));
  if (opts.email) p.set("customer_email", opts.email);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p, signal: AbortSignal.timeout(15000) });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `Stripe error ${r.status}`);
  return { url: body.url as string, id: body.id as string };
}

/** Verifies the Stripe-Signature header (t=…,v1=…) against the raw body. */
export async function verifyStripe(raw: string, header: string | null) {
  const secret = await key("stripe_webhook_secret_enc");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
