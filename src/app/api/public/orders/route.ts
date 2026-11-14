import { one, tx, nextNumber } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { priceLines, addEvent } from "@/lib/orders";
import { checkCoupon } from "@/lib/marketing";
import { fireWebhook } from "@/lib/webhooks";
import { notifyPerm } from "@/lib/notify";
import { cors, tooMany, foreignOrigin } from "@/lib/public-api";

export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: await cors(req, true) }); }

/** Order placed on the shop website. Prices always come from the ERP, never from the browser. Arrives as a draft order. */
export async function POST(req: Request) {
  const headers = await cors(req, true);
  const bad = (error: string, status = 400) => Response.json({ error }, { status, headers });
  const s = await getSettings();
  if (!s.website_orders_enabled) return bad("Online ordering is switched off", 403);
  if (await foreignOrigin(req)) return bad("Orders are only accepted from the shop website", 403);
  if (tooMany(req, 6)) return bad("Too many orders from this connection. Please try again in a minute.", 429);
  const b = await req.json().catch(() => null);
  if (!b || b.website) return bad("Invalid order"); // "website" is a hidden honeypot field bots fill in
  const c = b.customer ?? {};
  const name = String(c.name ?? "").trim().slice(0, 120), phone = String(c.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  if (!name || phone.length < 7) return bad("Name and a valid phone number are required");
  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 60) return bad("The cart is empty");
  const lines: { product_id: number; description: string; qty: number; unit_price: number; discount: number }[] = [];
  for (const l of b.lines) {
    const p = await one<any>("SELECT id, price, discount_price FROM products WHERE active AND status='active' AND website_visible AND (id=$1 OR (web_id<>'' AND web_id=$2) OR (sku<>'' AND sku=$2)) LIMIT 1", [Number(l.product_id) || 0, String(l.id ?? l.sku ?? "")]);
    if (!p) return bad(`An item in the cart is no longer available`);
    lines.push({ product_id: p.id, description: "", qty: Math.min(999, Math.max(1, Math.round(Number(l.qty) || 1))), unit_price: Number(p.discount_price ?? p.price), discount: 0 });
  }
  const sub = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const address = String(c.address ?? "").slice(0, 300);
  const zone = b.zone ? await one<any>("SELECT * FROM shipping_zones WHERE lower(name)=lower($1)", [String(b.zone)]) : null;
  const delivery = b.pickup ? 0 : zone ? (Number(zone.free_over) > 0 && sub >= Number(zone.free_over) ? 0 : Number(zone.charge)) : 0;
  const res = await tx(async (t) => {
    let cid = (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [phone]))[0]?.id;
    if (!cid) cid = (await t<{ id: number }>("INSERT INTO customers (name, phone, email, address, tags) VALUES ($1,$2,$3,$4,'website') RETURNING id", [name, phone, String(c.email ?? "").slice(0, 120), address]))[0].id;
    let couponNote = "";
    if (b.coupon) {
      try { const cp = await checkCoupon(t, String(b.coupon), sub, cid); let left = cp.discount; lines.forEach((l, i) => { const g = l.qty * l.unit_price; const take = i === lines.length - 1 ? left : Math.round((cp.discount * g / sub) * 100) / 100; l.discount = Math.min(g, take); left = Math.round((left - l.discount) * 100) / 100; }); couponNote = `Coupon ${cp.code} (${cp.label})`; } catch { couponNote = `Coupon ${String(b.coupon).slice(0, 30)} was not valid`; }
    }
    const priced = priceLines(s, lines, delivery);
    const number = await nextNumber(t, "order", "SO-");
    const [o] = await t<{ id: number }>(
      `INSERT INTO orders (number, kind, status, customer_id, customer_name, customer_phone, customer_email, customer_address, source, delivery_method, delivery_address, delivery_charge, notes, subtotal, discount, vat, total)
       VALUES ($1,'order','draft',$2,$3,$4,$5,$6,'website',$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [number, cid, name, phone, String(c.email ?? "").slice(0, 120), address, b.pickup ? "pickup" : "delivery", address, delivery, [String(b.notes ?? "").slice(0, 500), couponNote, b.payment ? `Payment: ${String(b.payment).slice(0, 30)}` : ""].filter(Boolean).join(" · "), priced.subtotal, priced.discount, priced.vat, priced.total],
    );
    for (const l of priced.lines) {
      const [pn] = await t<{ name: string }>("SELECT name FROM products WHERE id=$1", [l.product_id]);
      await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [o.id, l.product_id, pn?.name ?? "Item", l.qty, l.unit_price, l.discount, l.net, l.vat, l.total]);
    }
    await addEvent(t, o.id, "draft", "Placed on the website", null);
    if (b.cart_token) await t("UPDATE web_carts SET status='ordered', order_id=$2, updated_at=now() WHERE token=$1", [String(b.cart_token), o.id]);
    return { id: o.id, number, total: priced.total };
  });
  await notifyPerm(["orders"], `New website order ${res.number} from ${name} (${s.currency} ${res.total.toFixed(2)})`, `/orders/${res.id}`, "order");
  await fireWebhook("order.created", { ...res, source: "website", customer: name, phone });
  return Response.json({ ok: true, number: res.number, total: res.total, currency: s.currency, track_url: `${new URL(req.url).origin}/track?order=${res.number}` }, { status: 201, headers });
}
