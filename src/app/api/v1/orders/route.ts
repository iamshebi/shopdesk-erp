import { q, one, tx, nextNumber } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { getSettings } from "@/lib/settings";
import { priceLines, addEvent } from "@/lib/orders";
import { fireWebhook } from "@/lib/webhooks";

export async function GET(req: Request) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const st = new URL(req.url).searchParams.get("status");
  const orders = await q<any>(`SELECT id, number, kind, status, customer_name, customer_phone, total, advance, courier, tracking_no, sale_id, created_at, updated_at FROM orders ${st ? "WHERE status=$1" : ""} ORDER BY id DESC LIMIT 300`, st ? [st] : []);
  return Response.json({ data: orders });
}

/** Website / app orders arrive as drafts with source "website" (or the key's name). */
export async function POST(req: Request) {
  const a = await apiAuth(req, "write");
  if (a.error) return a.error;
  const s = await getSettings();
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.lines) || !b.lines.length) return Response.json({ error: "lines[] is required" }, { status: 400 });
  const c = b.customer ?? {};
  if (!c.name && !c.phone) return Response.json({ error: "customer.name or customer.phone is required" }, { status: 400 });
  const lines = [];
  for (const l of b.lines) {
    const p = await one<any>("SELECT id, name, price, discount_price FROM products WHERE (id=$1 OR (sku<>'' AND sku=$2)) AND active LIMIT 1", [Number(l.product_id) || 0, String(l.sku ?? "")]);
    if (!p && !l.description) return Response.json({ error: `Unknown product ${l.product_id ?? l.sku}` }, { status: 400 });
    lines.push({ product_id: p?.id ?? null, description: p ? "" : String(l.description), qty: Math.max(1, Math.round(Number(l.qty) || 1)), unit_price: l.price != null ? Number(l.price) : Number(p.discount_price ?? p.price), discount: 0 });
  }
  const delivery = Math.max(0, Number(b.delivery_charge) || 0);
  const priced = priceLines(s, lines, delivery);
  const res = await tx(async (t) => {
    let cid = c.phone ? (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [c.phone]))[0]?.id : undefined;
    if (!cid) cid = (await t<{ id: number }>("INSERT INTO customers (name, phone, email, address, tags) VALUES ($1,$2,$3,$4,'api') RETURNING id", [c.name || c.phone, c.phone ?? "", c.email ?? "", c.address ?? ""]))[0].id;
    const number = await nextNumber(t, "order", "SO-");
    const [o] = await t<{ id: number }>(
      `INSERT INTO orders (number, kind, status, customer_id, customer_name, customer_phone, customer_email, customer_address, source, delivery_method, delivery_address, delivery_charge, notes, subtotal, discount, vat, total)
       VALUES ($1,'order','draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [number, cid, c.name ?? "", c.phone ?? "", c.email ?? "", c.address ?? "", String(b.source ?? "website").slice(0, 30), delivery ? "delivery" : "pickup", c.address ?? "", delivery, String(b.notes ?? ""), priced.subtotal, priced.discount, priced.vat, priced.total],
    );
    for (const l of priced.lines) {
      const desc = l.description || (await t<{ name: string }>("SELECT name FROM products WHERE id=$1", [l.product_id]))[0]?.name || "Item";
      await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [o.id, l.product_id, desc, l.qty, l.unit_price, l.discount, l.net, l.vat, l.total]);
    }
    await addEvent(t, o.id, "draft", `Received via API (${a.key.name})`, null);
    return { id: o.id, number, total: priced.total };
  });
  await fireWebhook("order.created", { ...res, source: "api" });
  return Response.json({ data: res }, { status: 201 });
}
