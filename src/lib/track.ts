import "server-only";
import { q, one } from "./db";
import { getSettings } from "./settings";
import { statusInfo } from "./orders";
import { shipStatus, trackingUrl } from "./shipping";

const label = (st: string) => (st === "draft" ? "Order received" : st === "confirmed" ? "Confirmed, being prepared" : statusInfo("order", st).label);

/** Order status for the customer. The phone number must match, so nobody can look up someone else's order. */
export async function trackOrder(number: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!number.trim() || digits.length < 7) return null;
  const o = await one<any>("SELECT * FROM orders WHERE upper(number)=upper($1) AND kind='order'", [number.trim()]);
  if (!o || !o.customer_phone.replace(/\D/g, "").endsWith(digits.slice(-7))) return null;
  const s = await getSettings();
  const items = await q<any>("SELECT description, qty FROM order_items WHERE order_id=$1 ORDER BY id", [o.id]);
  const sh = await one<any>("SELECT * FROM shipments WHERE order_id=$1 ORDER BY id DESC LIMIT 1", [o.id]);
  const events = await q<any>("SELECT status, created_at FROM order_events WHERE order_id=$1 AND status <> 'draft' ORDER BY id", [o.id]);
  return {
    number: o.number, status: label(o.status), total: Number(o.total), currency: s.currency, placed: o.created_at, expected: o.expected_date,
    items: items.map((i) => ({ name: i.description, qty: i.qty })),
    shipment: sh ? { courier: sh.courier, tracking_no: sh.tracking_no, status: shipStatus(sh.status).label, tracking_url: trackingUrl(s.couriers, sh.courier, sh.tracking_no) } : null,
    history: events.map((e) => ({ status: label(e.status), at: e.created_at })),
  };
}
