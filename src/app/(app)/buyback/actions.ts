"use server";
import { revalidatePath } from "next/cache";
import { tx, nextNumber, q } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { str, numf } from "@/lib/util";

export async function createBuyback(_: unknown, fd: FormData): Promise<{ error?: string; id?: number }> {
  const user = await requireUser("buyback");
  const imei = str(fd, "imei");
  const price = numf(fd, "price_paid");
  if (!imei) return { error: "IMEI is required" };
  if (price <= 0) return { error: "Enter the price paid to the seller" };
  if (!str(fd, "id_number")) return { error: "Seller ID number is required" };
  const inStock = await q("SELECT 1 FROM units WHERE imei=$1 AND status='in_stock'", [imei]);
  if (inStock.length) return { error: "This IMEI is already in stock" };
  let productId = Number(fd.get("product_id")) || 0;
  const newName = str(fd, "new_product");
  if (!productId && !newName) return { error: "Choose the model or type a new model name" };

  const id = await tx(async (t) => {
    if (!productId) {
      const [p] = await t<{ id: number }>(
        "INSERT INTO products (name, brand, category, cost, price, track_serial) VALUES ($1,$2,'Used Phones',$3,$4,true) RETURNING id",
        [newName, str(fd, "brand"), price, numf(fd, "sell_price")],
      );
      productId = p.id;
    }
    let customerId: number | null = null;
    const phone = str(fd, "seller_phone");
    if (phone) {
      const [c] = await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [phone]);
      customerId = c?.id ?? (await t<{ id: number }>("INSERT INTO customers (name, phone) VALUES ($1,$2) RETURNING id", [str(fd, "seller_name"), phone]))[0].id;
    }
    const number = await nextNumber(t, "buyback", "BB-");
    const [b] = await t<{ id: number }>(
      `INSERT INTO buybacks (number, customer_id, seller_name, seller_phone, id_type, id_number, nationality, product_id, imei, condition, price_paid, payment_method, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [number, customerId, str(fd, "seller_name"), phone, str(fd, "id_type"), str(fd, "id_number"), str(fd, "nationality"), productId, imei, str(fd, "condition"), price, str(fd, "payment_method"), str(fd, "notes"), user.id],
    );
    const sell = numf(fd, "sell_price");
    await t(
      "INSERT INTO units (product_id, imei, cost, price, source, margin_scheme, buyback_id, notes) VALUES ($1,$2,$3,$4,'buyback',$5,$6,$7)",
      [productId, imei, price, sell > 0 ? sell : null, fd.get("margin_scheme") === "on", b.id, str(fd, "condition")],
    );
    await log(user.id, "Used device bought", `${number} · IMEI ${imei} · ${price.toFixed(2)} · ${str(fd, "seller_name")}`, `/print/buyback/${b.id}`, t);
    return b.id;
  });
  revalidatePath("/buyback");
  revalidatePath("/products");
  return { id };
}
