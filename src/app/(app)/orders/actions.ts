"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx, nextNumber } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { createSale, SaleError } from "@/lib/sales";
import { priceLines, addEvent, statusInfo, RESERVED_SQL, type OrderLineInput } from "@/lib/orders";
import { STOCK_SQL } from "@/lib/stock";
import { str, numf, num } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

function readLines(fd: FormData): OrderLineInput[] {
  try {
    const raw = JSON.parse(str(fd, "lines") || "[]");
    return (Array.isArray(raw) ? raw : []).map((l: any) => ({
      product_id: l.product_id ? Number(l.product_id) : null,
      description: String(l.description ?? "").slice(0, 300),
      qty: Math.max(0, Math.round(Number(l.qty) || 0)),
      unit_price: Math.max(0, Number(l.unit_price) || 0),
      discount: Math.max(0, Number(l.discount) || 0),
    }));
  } catch {
    return [];
  }
}

export async function saveOrder(fd: FormData) {
  const user = await requireUser("orders");
  const s = await getSettings();
  const id = Number(str(fd, "id")) || 0;
  const kind = str(fd, "kind") === "quote" ? "quote" : "order";
  const lines = readLines(fd);
  const back = id ? `/orders/${id}/edit` : `/orders/new?kind=${kind}`;
  if (!lines.length) go(back, "Add at least one product or line", "err");
  if (!str(fd, "customer_name") && !str(fd, "customer_phone")) go(back, "Add the customer's name or phone", "err");
  if (!can(user, "sales.discount")) lines.forEach((l) => (l.discount = 0));
  const delivery = str(fd, "delivery_method") === "delivery" ? Math.max(0, numf(fd, "delivery_charge")) : 0;
  const priced = priceLines(s, lines, delivery);
  const f = {
    customer_name: str(fd, "customer_name"), customer_phone: str(fd, "customer_phone"), customer_email: str(fd, "customer_email"),
    customer_trn: str(fd, "customer_trn"), customer_address: str(fd, "customer_address"), source: str(fd, "source") || "shop",
    valid_until: str(fd, "valid_until") || null, delivery_method: str(fd, "delivery_method") || "pickup", delivery_address: str(fd, "delivery_address"),
    delivery_charge: delivery, expected_date: str(fd, "expected_date") || null, advance: Math.max(0, numf(fd, "advance")), advance_method: str(fd, "advance_method") || "cash",
    notes: str(fd, "notes"), terms: str(fd, "terms"), sales_rep_id: Number(str(fd, "sales_rep_id")) || null,
    currency: str(fd, "currency") && str(fd, "currency") !== s.currency ? str(fd, "currency") : "",
    fx_rate: 1 as number,
    subtotal: priced.subtotal, discount: priced.discount, vat: priced.vat, total: priced.total,
  };
  if (f.advance > f.total) go(back, "The advance is more than the order total", "err");
  if (f.currency) f.fx_rate = Number((await one<{ rate: number }>("SELECT rate FROM currencies WHERE code=$1", [f.currency]))?.rate) || 1;
  const keys = Object.keys(f) as (keyof typeof f)[];
  const orderId = await tx(async (t) => {
    // Link or create the customer so the CRM profile stays up to date.
    let customerId: number | null = null;
    if (f.customer_phone) customerId = (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [f.customer_phone]))[0]?.id ?? null;
    if (!customerId && f.customer_name) customerId = (await t<{ id: number }>("SELECT id FROM customers WHERE lower(name)=lower($1) LIMIT 1", [f.customer_name]))[0]?.id ?? null;
    if (!customerId) customerId = (await t<{ id: number }>("INSERT INTO customers (name, phone, email, trn, address) VALUES ($1,$2,$3,$4,$5) RETURNING id", [f.customer_name || f.customer_phone, f.customer_phone, f.customer_email, f.customer_trn, f.customer_address]))[0].id;
    let oid = id;
    if (id) {
      const [cur] = await t<any>("SELECT status, kind, sale_id FROM orders WHERE id=$1", [id]);
      if (!cur || cur.sale_id || ["delivered", "cancelled", "converted"].includes(cur.status)) throw new SaleError("This order can no longer be edited");
      await t(`UPDATE orders SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, customer_id=$${keys.length + 2}, updated_at=now() WHERE id=$1`, [id, ...keys.map((k) => f[k]), customerId]);
      await t("DELETE FROM order_items WHERE order_id=$1", [id]);
      await addEvent(t, id, cur.status, "Edited", user.id);
    } else {
      const number = await nextNumber(t, kind, kind === "quote" ? "QT-" : "SO-");
      const [o] = await t<{ id: number }>(
        `INSERT INTO orders (number, kind, status, created_by, customer_id, ${keys.join(", ")}) VALUES ($1,$2,'draft',$3,$4, ${keys.map((_, i) => `$${i + 5}`).join(", ")}) RETURNING id`,
        [number, kind, user.id, customerId, ...keys.map((k) => f[k])],
      );
      oid = o.id;
      await addEvent(t, oid, "draft", "Created", user.id);
    }
    for (const l of priced.lines) {
      let desc = l.description;
      if (l.product_id && !desc) desc = (await t<{ name: string }>("SELECT name FROM products WHERE id=$1", [l.product_id]))[0]?.name ?? "Item";
      await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        oid, l.product_id, desc, l.qty, l.unit_price, l.discount, l.net, l.vat, l.total,
      ]);
    }
    return oid;
  }).catch((e) => go(back, e instanceof SaleError ? e.message : "Could not save. Please try again.", "err"));
  const o = await one<{ number: string }>("SELECT number FROM orders WHERE id=$1", [orderId]);
  await log(user.id, id ? `${kind === "quote" ? "Quotation" : "Order"} edited` : `${kind === "quote" ? "Quotation" : "Order"} created`, `${o?.number} · ${s.currency} ${num(f.total)}`, `/orders/${orderId}`);
  if (!id) await (await import("@/lib/webhooks")).fireWebhook("order.created", { id: orderId, number: o?.number, kind, total: f.total, customer: f.customer_name, phone: f.customer_phone });
  revalidatePath("/orders");
  go(`/orders/${orderId}`, "Saved");
}

/** Moves an order (or quote) to the next status, checking stock when an order is confirmed. */
export async function setOrderStatus(fd: FormData) {
  const user = await requireUser("orders");
  const id = Number(str(fd, "id"));
  const to = str(fd, "status");
  const o = await one<any>("SELECT * FROM orders WHERE id=$1", [id]);
  if (!o) go("/orders");
  const allowed: Record<string, string[]> = o.kind === "quote"
    ? { draft: ["sent", "accepted", "declined"], sent: ["accepted", "declined"], accepted: ["declined"], declined: ["sent"] }
    : { draft: ["confirmed", "cancelled"], confirmed: ["packed", "shipped", "cancelled", "draft"], packed: ["shipped", "cancelled"], shipped: ["cancelled"] };
  if (!(allowed[o.status] ?? []).includes(to)) go(`/orders/${id}`, "That step isn't possible from the current status", "err");
  if (o.kind === "order" && to === "confirmed") {
    const short = await q<any>(
      `SELECT p.name, ${STOCK_SQL} AS stock, ${RESERVED_SQL("p")} AS reserved, sum(oi.qty)::int need
       FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 AND NOT p.is_service GROUP BY p.id`,
      [id],
    );
    const lacking = short.filter((r) => r.stock - r.reserved < r.need);
    if (lacking.length && str(fd, "force") !== "1")
      go(`/orders/${id}`, `Not enough free stock: ${lacking.map((r) => `${r.name} (need ${r.need}, free ${Math.max(0, r.stock - r.reserved)})`).join(", ")}. Confirm anyway from the button below if stock is arriving.`, "err");
  }
  await tx(async (t) => {
    await t(`UPDATE orders SET status=$2, courier=COALESCE(NULLIF($3,''), courier), tracking_no=COALESCE(NULLIF($4,''), tracking_no), updated_at=now() WHERE id=$1`, [id, to, str(fd, "courier"), str(fd, "tracking_no")]);
    await addEvent(t, id, to, [str(fd, "note"), str(fd, "tracking_no") && `Tracking ${str(fd, "tracking_no")}`].filter(Boolean).join(" · "), user.id);
    if (o.kind === "order" && to === "shipped") {
      const [ex] = await t("SELECT id FROM shipments WHERE order_id=$1", [id]);
      if (!ex) {
        const num2 = await nextNumber(t, "shipment", "SHP-");
        await t(`INSERT INTO shipments (number, order_id, customer_name, customer_phone, address, courier, tracking_no, status, cost, cod_amount, shipped_at, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'in_transit',0,$8,now(),$9)`, [num2, id, o.customer_name, o.customer_phone, o.delivery_address || o.customer_address, str(fd, "courier") || o.courier, str(fd, "tracking_no") || o.tracking_no, Math.max(0, Number(o.total) - Number(o.advance)), user.id]);
      }
    }
  });
  await (await import("@/lib/webhooks")).fireWebhook("order.status", { id, number: o.number, status: to });
  await log(user.id, `${o.kind === "quote" ? "Quotation" : "Order"} ${statusInfo(o.kind, to).label.toLowerCase()}`, o.number, `/orders/${id}`);
  revalidatePath("/orders");
  go(`/orders/${id}`, `Marked as ${statusInfo(o.kind, to).label}`);
}

export async function convertQuote(fd: FormData) {
  const user = await requireUser("orders");
  const id = Number(str(fd, "id"));
  const newId = await tx(async (t) => {
    const [qt] = await t<any>("SELECT * FROM orders WHERE id=$1 AND kind='quote'", [id]);
    if (!qt || qt.status === "converted") throw new Error("Already converted");
    const number = await nextNumber(t, "order", "SO-");
    const cols = ["customer_id", "customer_name", "customer_phone", "customer_email", "customer_trn", "customer_address", "source", "sales_rep_id", "delivery_method", "delivery_address", "delivery_charge", "subtotal", "discount", "vat", "total", "notes", "terms"];
    const [o] = await t<{ id: number }>(`INSERT INTO orders (number, kind, status, ref_order_id, created_by, ${cols.join(", ")}) SELECT $2, 'order', 'draft', id, $3, ${cols.join(", ")} FROM orders WHERE id=$1 RETURNING id`, [id, number, user.id]);
    await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) SELECT $2, product_id, description, qty, unit_price, discount, net, vat, total FROM order_items WHERE order_id=$1 ORDER BY id", [id, o.id]);
    await t("UPDATE orders SET status='converted', updated_at=now() WHERE id=$1", [id]);
    await addEvent(t, id, "converted", `Became order ${number}`, user.id);
    await addEvent(t, o.id, "draft", `Created from quotation ${qt.number}`, user.id);
    return o.id;
  }).catch(() => go(`/orders/${id}`, "This quotation was already converted", "err"));
  await log(user.id, "Quotation converted", `#${id} → order`, `/orders/${newId}`);
  go(`/orders/${newId}`, "Order created from the quotation. Check it and confirm.");
}

export async function duplicateOrder(fd: FormData) {
  const user = await requireUser("orders");
  const id = Number(str(fd, "id"));
  const newId = await tx(async (t) => {
    const [src] = await t<any>("SELECT kind, number FROM orders WHERE id=$1", [id]);
    const number = await nextNumber(t, src.kind, src.kind === "quote" ? "QT-" : "SO-");
    const cols = ["kind", "customer_id", "customer_name", "customer_phone", "customer_email", "customer_trn", "customer_address", "source", "delivery_method", "delivery_address", "delivery_charge", "subtotal", "discount", "vat", "total", "notes", "terms"];
    const [o] = await t<{ id: number }>(`INSERT INTO orders (number, status, created_by, ${cols.join(", ")}) SELECT $2, 'draft', $3, ${cols.join(", ")} FROM orders WHERE id=$1 RETURNING id`, [id, number, user.id]);
    await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) SELECT $2, product_id, description, qty, unit_price, discount, net, vat, total FROM order_items WHERE order_id=$1 ORDER BY id", [id, o.id]);
    await addEvent(t, o.id, "draft", `Copy of ${src.number}`, user.id);
    return o.id;
  });
  go(`/orders/${newId}`, "Copy created as a draft");
}

/** Deliver the order: makes the tax invoice (stock goes out, customer history and payments update). */
export async function invoiceOrder(fd: FormData) {
  const user = await requireUser(["orders"]);
  if (!can(user, "pos")) go(`/orders/${str(fd, "id")}`, "Your account can't make invoices", "err");
  const s = await getSettings();
  const id = Number(str(fd, "id"));
  const o = await one<any>("SELECT * FROM orders WHERE id=$1 AND kind='order'", [id]);
  if (!o || o.sale_id || ["cancelled", "delivered", "draft"].includes(o.status)) go(`/orders/${id}`, "Confirm the order before invoicing it", "err");
  const items = await q<any>("SELECT oi.*, p.track_serial FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY oi.id", [id]);
  const lines: any[] = [];
  for (const it of items) {
    if (it.product_id && it.track_serial) {
      const units = fd.getAll(`unit_${it.id}`).map(Number).filter(Boolean);
      if (units.length !== it.qty) go(`/orders/${id}`, `Choose ${it.qty} IMEI(s) for ${it.description}`, "err");
      const per = it.discount / it.qty;
      for (const u of units) lines.push({ product_id: it.product_id, unit_id: u, description: it.description, qty: 1, unit_price: Number(it.unit_price), discount: per });
    } else {
      lines.push({ product_id: it.product_id, description: it.description, qty: it.qty, unit_price: Number(it.unit_price), discount: Number(it.discount), cost: 0 });
    }
  }
  if (Number(o.delivery_charge) > 0) lines.push({ product_id: null, description: "Delivery charge", qty: 1, unit_price: Number(o.delivery_charge), discount: 0, cost: 0 });
  const payments = [] as { method: string; amount: number; reference?: string }[];
  if (Number(o.advance) > 0) payments.push({ method: o.advance_method, amount: Number(o.advance), reference: `Advance on ${o.number}` });
  const nowPaid = numf(fd, "amount");
  if (nowPaid > 0) payments.push({ method: str(fd, "method") || "cash", amount: nowPaid });
  let saleId = 0;
  try {
    saleId = await tx(async (t) => {
      const sid = await createSale(t, s, {
        customer: { id: o.customer_id, name: o.customer_name, phone: o.customer_phone, trn: o.customer_trn, address: o.customer_address },
        lines, payments, notes: `Order ${o.number}${o.notes ? ` · ${o.notes}` : ""}`, userId: user.id,
      });
      await t("UPDATE orders SET sale_id=$2, status='delivered', updated_at=now() WHERE id=$1", [id, sid]);
      const [inv] = await t<{ number: string }>("SELECT number FROM sales WHERE id=$1", [sid]);
      await addEvent(t, id, "delivered", `Invoice ${inv.number}`, user.id);
      return sid;
    });
  } catch (e: any) {
    go(`/orders/${id}`, e instanceof SaleError ? e.message : "Could not create the invoice", "err");
  }
  await log(user.id, "Order invoiced", `${o.number}`, `/sales/${saleId}`);
  revalidatePath("/orders");
  go(`/sales/${saleId}?new=1`);
}
