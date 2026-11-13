import "server-only";
import type { Exec } from "./db";
import type { ShopSettings } from "./settings";
import { lineVat, r2 } from "./util";

export const ORDER_STATUSES = [
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "confirmed", label: "Confirmed", tone: "blue" },
  { id: "packed", label: "Packed", tone: "violet" },
  { id: "shipped", label: "Out for delivery", tone: "amber" },
  { id: "delivered", label: "Delivered", tone: "green" },
  { id: "cancelled", label: "Cancelled", tone: "red" },
] as const;
export const QUOTE_STATUSES = [
  { id: "draft", label: "Draft", tone: "slate" },
  { id: "sent", label: "Sent", tone: "blue" },
  { id: "accepted", label: "Accepted", tone: "green" },
  { id: "declined", label: "Declined", tone: "red" },
  { id: "converted", label: "Converted to order", tone: "violet" },
] as const;
export const SOURCES = [
  ["shop", "In shop"], ["phone", "Phone"], ["whatsapp", "WhatsApp"], ["website", "Website"], ["instagram", "Instagram"], ["other", "Other"],
] as const;

export const statusInfo = (kind: string, s: string) =>
  ((kind === "quote" ? QUOTE_STATUSES : ORDER_STATUSES) as readonly { id: string; label: string; tone: string }[]).find((x) => x.id === s) ?? { id: s, label: s, tone: "slate" };

/** Units promised to open orders and not yet invoiced: they count as reserved. */
export const RESERVED_SQL = (p: string) => `COALESCE((SELECT sum(oi.qty)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = ${p}.id AND o.kind = 'order' AND o.status IN ('confirmed','packed','shipped') AND o.sale_id IS NULL), 0)`;

export interface OrderLineInput { product_id: number | null; description: string; qty: number; unit_price: number; discount: number }

/** Works out VAT and totals the same way invoices do, so the invoice made later matches. */
export function priceLines(s: ShopSettings, lines: OrderLineInput[], deliveryCharge: number) {
  const out = lines
    .filter((l) => l.qty > 0 && (l.product_id || l.description))
    .map((l) => {
      const gross = r2(l.qty * l.unit_price - (l.discount || 0));
      const v = lineVat({ amount: Math.max(0, gross), rate: s.vat_rate, pricesIncludeVat: s.prices_include_vat, registered: s.vat_registered });
      return { ...l, discount: r2(l.discount || 0), ...v };
    });
  const del = deliveryCharge > 0 ? lineVat({ amount: deliveryCharge, rate: s.vat_rate, pricesIncludeVat: s.prices_include_vat, registered: s.vat_registered }) : { net: 0, vat: 0, total: 0 };
  return {
    lines: out,
    subtotal: r2(out.reduce((a, l) => a + l.net, 0) + del.net),
    discount: r2(out.reduce((a, l) => a + l.discount, 0)),
    vat: r2(out.reduce((a, l) => a + l.vat, 0) + del.vat),
    total: r2(out.reduce((a, l) => a + l.total, 0) + del.total),
  };
}

export async function addEvent(t: Exec, orderId: number, status: string, note: string, userId: number | null) {
  await t("INSERT INTO order_events (order_id, status, note, user_id) VALUES ($1,$2,$3,$4)", [orderId, status, note, userId]);
}
