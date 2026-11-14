"use server";
import { redirect } from "next/navigation";
import { tx, nextNumber } from "@/lib/db";
import { readCustomerToken } from "@/lib/public-link";
import { notifyPerm } from "@/lib/notify";
import { fireWebhook } from "@/lib/webhooks";

export async function portalTicket(fd: FormData) {
  const token = String(fd.get("token"));
  const cid = await readCustomerToken(token);
  const subject = String(fd.get("subject") ?? "").trim().slice(0, 200), body = String(fd.get("body") ?? "").trim().slice(0, 2000);
  if (!cid || !subject || fd.get("company")) redirect(`/portal/${token}?err=${encodeURIComponent("Please write a subject")}`);
  const t = await tx(async (x) => {
    const [c] = await x<any>("SELECT name, phone FROM customers WHERE id=$1", [cid]);
    const [n] = await x<{ n: number }>("SELECT count(*)::int n FROM tickets WHERE customer_id=$1 AND created_at > now() - interval '1 day'", [cid]);
    if (n.n >= 5) return null;
    const number = await nextNumber(x, "ticket", "TKT-");
    const [r] = await x<{ id: number }>("INSERT INTO tickets (number, customer_id, customer_name, customer_phone, subject, category, channel) VALUES ($1,$2,$3,$4,$5,$6,'website') RETURNING id", [number, cid, c.name, c.phone, subject, String(fd.get("category") || "inquiry").slice(0, 20)]);
    if (body) await x("INSERT INTO ticket_messages (ticket_id, body) VALUES ($1,$2)", [r.id, body]);
    return { id: r.id, number };
  });
  if (!t) redirect(`/portal/${token}?err=${encodeURIComponent("You have sent several requests today. Please call the shop.")}`);
  await notifyPerm(["support"], `New request from the customer portal: ${subject}`, `/support/${t.id}`, "ticket");
  await fireWebhook("ticket.created", t);
  redirect(`/portal/${token}?ok=${encodeURIComponent(`Thank you. Your request ${t.number} has been sent.`)}`);
}
