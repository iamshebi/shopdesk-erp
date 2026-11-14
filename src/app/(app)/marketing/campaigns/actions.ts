"use server";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { SEGMENTS } from "@/lib/segments";
import { campaignRecipients } from "@/lib/campaigns";
import { sendEmail, esc } from "@/lib/email";
import { sendSms, sendWhatsApp } from "@/lib/messaging";
import { str, numf } from "@/lib/util";

function go(path: string, msg: string, kind: "ok" | "err" = "ok"): never { redirect(`${path}?${kind}=${encodeURIComponent(msg)}`); }

const fill = (msg: string, r: any, coupon: string, shop: string) => msg.replaceAll("{name}", r.name?.split(" ")[0] ?? "").replaceAll("{coupon}", coupon).replaceAll("{shop}", shop);

export async function saveCampaign(fd: FormData) {
  const user = await requireUser("marketing");
  const id = Number(str(fd, "id"));
  const name = str(fd, "name"), message = str(fd, "message");
  if (!name || !message) go("/marketing/campaigns", "Give the campaign a name and a message", "err");
  const f = [name, ["email", "whatsapp", "sms"].includes(str(fd, "channel")) ? str(fd, "channel") : "whatsapp", SEGMENTS[str(fd, "segment")] ? str(fd, "segment") : "all", str(fd, "group_name"), str(fd, "subject"), message, str(fd, "coupon_code").toUpperCase(), Math.max(0, numf(fd, "cost"))];
  let cid = id;
  if (id) await q("UPDATE campaigns SET name=$2, channel=$3, segment=$4, group_name=$5, subject=$6, message=$7, coupon_code=$8, cost=$9 WHERE id=$1 AND status='draft'", [id, ...f]);
  else cid = (await one<{ id: number }>("INSERT INTO campaigns (name, channel, segment, group_name, subject, message, coupon_code, cost, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [...f, user.id]))!.id;
  await log(user.id, "Campaign saved", name, `/marketing/campaigns/${cid}`);
  redirect(`/marketing/campaigns/${cid}`);
}

/** Sends through the connected service (email, SMS or WhatsApp API). Without one, WhatsApp campaigns are sent by tapping each link. */
export async function sendCampaign(fd: FormData) {
  const user = await requireUser("marketing");
  const id = Number(str(fd, "id"));
  const c = await one<any>("SELECT * FROM campaigns WHERE id=$1", [id]);
  if (!c || c.status === "sent") go(`/marketing/campaigns/${id}`, "Already sent", "err");
  const s = await getSettings();
  const list = await campaignRecipients(c);
  let sent = 0, lastErr = "";
  if (str(fd, "manual") !== "1") {
    for (const r of list.slice(0, 500)) {
      const text = fill(c.message, r, c.coupon_code, s.shop_name);
      const res = c.channel === "email" ? await sendEmail(r.email, fill(c.subject || c.name, r, c.coupon_code, s.shop_name), `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${esc(text)}</div><p style="font-size:11px;color:#94a3b8">${esc(s.shop_name)} · reply STOP to opt out</p>`)
        : c.channel === "sms" ? await sendSms(r.phone, text) : await sendWhatsApp(r.phone, text);
      if (res.ok) sent++; else { lastErr = res.error ?? ""; if (sent === 0) break; }
    }
    if (!sent) go(`/marketing/campaigns/${id}`, lastErr || "Nothing was sent", "err");
  } else sent = list.length;
  await q("UPDATE campaigns SET status='sent', recipients=$2, sent=$3, sent_at=now() WHERE id=$1", [id, list.length, sent]);
  await log(user.id, "Campaign sent", `${c.name}: ${sent} of ${list.length}`, `/marketing/campaigns/${id}`);
  go(`/marketing/campaigns/${id}`, `Sent to ${sent} of ${list.length} customers`);
}

export async function setOptOut(fd: FormData) {
  await requireUser(["marketing", "customers"]);
  const id = Number(str(fd, "id"));
  await q("UPDATE customers SET marketing_opt_out = NOT marketing_opt_out WHERE id=$1", [id]);
  redirect(`/customers/${id}`);
}

export async function setReferrer(fd: FormData) {
  const user = await requireUser("customers");
  const id = Number(str(fd, "id"));
  const ref = await one<{ id: number; name: string }>("SELECT id, name FROM customers WHERE id<>$2 AND (phone=$1 OR lower(name)=lower($1)) LIMIT 1", [str(fd, "referrer"), id]);
  if (!ref) redirect(`/customers/${id}?err=${encodeURIComponent("No customer found with that phone or name")}`);
  await q("UPDATE customers SET referred_by=$2 WHERE id=$1", [id, ref.id]);
  await log(user.id, "Referral recorded", `#${id} referred by ${ref.name}`, `/customers/${id}`);
  redirect(`/customers/${id}?ok=${encodeURIComponent(`Referred by ${ref.name}. They get points on this customer's first purchase.`)}`);
}

export async function cartReminded(fd: FormData) {
  await requireUser("marketing");
  await q("UPDATE web_carts SET reminded_at=now() WHERE id=$1", [Number(str(fd, "id"))]);
  redirect("/marketing/campaigns");
}
