import "server-only";
import { getSettings } from "./settings";
import { channelsReady, sendSms, sendWhatsApp } from "./messaging";
import { log } from "./activity";
import { num } from "./util";

export type AutoKind = "sale" | "repair_received" | "repair_ready" | "repair_delivered";

/**
 * Automatic customer messages (Settings → Integrations → Automatic customer messages).
 * WhatsApp Business API first (with the approved template, if one is set), SMS as fallback or as well.
 * Never throws; every result goes to the activity log so the owner can see what was sent.
 */
export async function autoMessage(kind: AutoKind, phone: string, v: { number: string; total?: number; device?: string; link?: string; estimate?: number; ready_by?: string | null; charge?: number }) {
  try {
    if (!phone || phone.replace(/\D/g, "").length < 7) return;
    const s = await getSettings();
    const on = { sale: s.notify_sale, repair_received: s.notify_repair_received, repair_ready: s.notify_repair_ready, repair_delivered: s.notify_repair_delivered }[kind];
    if (!on) return;
    const ch = await channelsReady();
    const useWa = ch.whatsapp && s.notify_channel !== "sms";
    const useSms = ch.sms && s.notify_channel !== "whatsapp";
    if (!useWa && !useSms && !(ch.sms && s.notify_channel === "whatsapp")) return;
    const cur = s.currency;
    const text = {
      sale: `${s.shop_name}: Thank you for shopping with us! Invoice ${v.number}, ${cur} ${num(v.total ?? 0)}.${v.link ? ` View or download: ${v.link}` : ""}`,
      repair_received: `${s.shop_name}: We received your ${v.device} for repair. Job no. ${v.number}.${v.estimate ? ` Estimate ${cur} ${num(v.estimate)}.` : ""}${v.ready_by ? ` Expected ready: ${v.ready_by}.` : ""} Please keep your job slip.`,
      repair_ready: `${s.shop_name}: Good news! Your ${v.device} is ready for pickup (job ${v.number}).${v.charge ? ` Amount: ${cur} ${num(v.charge)}.` : ""} ${s.phone ? `Call ${s.phone}.` : ""}`.trim(),
      repair_delivered: `${s.shop_name}: Your ${v.device} (job ${v.number}) has been delivered. Thank you!${v.link ? ` Invoice: ${v.link}` : ""}`,
    }[kind];
    let sent = "";
    let failed = "";
    if (useWa) {
      const r = await sendWhatsApp(phone, text, s.whatsapp_template || undefined);
      if (r.ok) sent = "WhatsApp";
      else failed = `WhatsApp: ${r.error}`;
    }
    // SMS when chosen, or as a fallback when WhatsApp didn't go through.
    if (ch.sms && (useSms || (!sent && s.notify_channel === "whatsapp"))) {
      const r = await sendSms(phone, text);
      if (r.ok) sent = sent ? `${sent} + SMS` : "SMS";
      else failed = [failed, `SMS: ${r.error}`].filter(Boolean).join(" · ");
    }
    await log(null, sent ? `${sent} sent to customer` : "Customer message failed", `${v.number} · ${phone}${failed ? ` · ${failed}` : ""} · ${text.slice(0, 160)}`, "/settings/integrations");
  } catch (e) {
    console.error("autoMessage", e);
  }
}
