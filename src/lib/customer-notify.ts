import "server-only";
import { getSettings } from "./settings";
import { sendEmail, esc, emailReady } from "./email";
import { sendWhatsApp, channelsReady } from "./messaging";

const TEXT: Record<string, string> = { confirmed: "is confirmed and being prepared", packed: "is packed and ready", shipped: "is on its way", delivered: "has been delivered. Thank you!", cancelled: "has been cancelled" };

/** Tells the customer when their order moves on (email and/or WhatsApp API when connected). Never throws. */
export async function notifyOrderStatus(o: { number: string; customer_name: string; customer_email: string; customer_phone: string }, status: string, base: string, tracking = "") {
  try {
    const line = TEXT[status];
    if (!line) return;
    const s = await getSettings();
    const link = `${base}/track?order=${encodeURIComponent(o.number)}`;
    const msg = `${s.shop_name}: your order ${o.number} ${line}.${tracking ? ` Tracking: ${tracking}.` : ""} Track it: ${link}`;
    if (o.customer_email && (await emailReady())) await sendEmail(o.customer_email, `Order ${o.number} ${line.split(".")[0]}`, `<div style="font-family:Arial,sans-serif"><p>Hello ${esc(o.customer_name || "")},</p><p>Your order <b>${esc(o.number)}</b> ${esc(line)}</p>${tracking ? `<p>Tracking: ${esc(tracking)}</p>` : ""}<p><a href="${link}">Track your order</a></p><p style="color:#64748b">${esc(s.shop_name)} · ${esc(s.phone)}</p></div>`);
    if (o.customer_phone && (await channelsReady()).whatsapp) await sendWhatsApp(o.customer_phone, msg);
  } catch (e) { console.error("notifyOrderStatus", e); }
}
