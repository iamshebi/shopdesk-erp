import "server-only";
import crypto from "node:crypto";
import { q } from "./db";

export const WEBHOOK_EVENTS = ["sale.created", "sale.paid", "order.created", "order.status", "customer.created", "ticket.created", "stock.low", "shipment.status"];

/** Sends an event to every matching webhook. Never throws; failures are logged. */
export async function fireWebhook(event: string, data: unknown) {
  try {
    const hooks = await q<any>("SELECT * FROM webhooks WHERE active");
    const body = JSON.stringify({ event, created_at: new Date().toISOString(), data });
    await Promise.all(
      hooks
        .filter((h) => h.events === "*" || h.events.split(",").map((e: string) => e.trim()).includes(event))
        .map(async (h) => {
          const sig = crypto.createHmac("sha256", h.secret).update(body).digest("hex");
          let status = 0, response = "";
          try {
            const r = await fetch(h.url, { method: "POST", headers: { "Content-Type": "application/json", "X-ShopDesk-Event": event, "X-ShopDesk-Signature": `sha256=${sig}` }, body, signal: AbortSignal.timeout(5000) });
            status = r.status;
            response = (await r.text().catch(() => "")).slice(0, 300);
          } catch (e: any) {
            response = String(e?.message ?? e).slice(0, 300);
          }
          await q("INSERT INTO webhook_deliveries (webhook_id, event, status, response) VALUES ($1,$2,$3,$4)", [h.id, event, status, response]);
        }),
    );
  } catch (e) {
    console.error("webhook", e);
  }
}
