"use server";
import { revalidatePath } from "next/cache";
import { tx, q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { createSale, SaleError, type SaleInput } from "@/lib/sales";
import { num } from "@/lib/util";
import { after } from "next/server";
import { autoMessage } from "@/lib/auto-messages";
import { baseUrl, saleToken } from "@/lib/public-link";

export async function checkout(payload: Omit<SaleInput, "userId">): Promise<{ id?: number; error?: string }> {
  const user = await requireUser("pos");
  const s = await getSettings();
  const canPrice = can(user, "sales.price");
  const canDiscount = can(user, "sales.discount");
  const notes: string[] = [];

  // Enforce price / discount permissions on the server, whatever the browser sent.
  const { customerTerms, priceFor } = await import("@/lib/customer-pricing");
  const terms = payload.customer.id ? await customerTerms(q, payload.customer.id) : null;
  for (const l of payload.lines) {
    if (!l.product_id) continue;
    const [p] = await q<{ name: string; price: number }>("SELECT name, price FROM products WHERE id=$1", [l.product_id]);
    let list = p?.price ?? 0;
    if (l.unit_id) {
      const [u] = await q<{ price: number | null }>("SELECT price FROM units WHERE id=$1", [l.unit_id]);
      if (u?.price) list = u.price;
    }
    if (!l.unit_id) list = priceFor(terms, l.product_id, list);
    if (!canPrice) l.unit_price = list;
    else if (Math.abs(l.unit_price - list) > 0.004) notes.push(`${p?.name}: price ${num(list)} → ${num(l.unit_price)}`);
    if (!canDiscount) l.discount = 0;
    else if (l.discount) notes.push(`${p?.name}: discount ${num(l.discount)}`);
  }
  if (!can(user, "sales.credit") && payload.payments.some((p) => p.method === "credit")) {
    return { error: "Your account is not allowed to sell on credit" };
  }
  try {
    const id = await tx(async (t) => {
      const sid = await createSale(t, s, { ...payload, userId: user.id });
      const [row] = await t<{ number: string; total: number; paid: number }>("SELECT number, total, paid FROM sales WHERE id=$1", [sid]);
      if (!can(user, "sales.credit") && row.paid + 0.004 < row.total) throw new SaleError("Full payment is needed — your account can't sell on credit");
      await log(user.id, "Sale", `${row.number} · ${s.currency} ${num(row.total)}${payload.customer.name ? ` · ${payload.customer.name}` : ""}${notes.length ? ` · ${notes.join("; ")}` : ""}`, `/sales/${sid}`, t);
      return sid;
    });
    const { fireWebhook } = await import("@/lib/webhooks");
    const sale = (await q<any>("SELECT id, number, total, paid, customer_name, customer_phone, coupon_code FROM sales WHERE id=$1", [id]))[0];
    await fireWebhook("sale.created", sale);
    if (sale.customer_phone) {
      const link = `${await baseUrl()}/i/${await saleToken(id)}`;
      after(() => autoMessage("sale", sale.customer_phone, { number: sale.number, total: Number(sale.total), link }));
    }
    revalidatePath("/");
    revalidatePath("/sales");
    revalidatePath("/products");
    return { id };
  } catch (e) {
    if (e instanceof SaleError) return { error: e.message };
    console.error(e);
    return { error: "Could not save the sale. Please try again." };
  }
}

export async function previewCoupon(code: string, gross: number, customer: { id: number | null; phone: string }): Promise<{ discount?: number; label?: string; error?: string }> {
  await requireUser("pos");
  const { checkCoupon, CouponError } = await import("@/lib/marketing");
  try {
    return await tx(async (t) => {
      let cid = customer.id;
      if (!cid && customer.phone) cid = (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [customer.phone]))[0]?.id ?? null;
      const c = await checkCoupon(t, code, gross, cid);
      return { discount: c.discount, label: c.label };
    });
  } catch (e) {
    return { error: e instanceof CouponError ? e.message : "Could not check the coupon" };
  }
}
