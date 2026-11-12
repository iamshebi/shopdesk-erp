"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tx, nextNumber, q, one } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { r2, str, numf } from "@/lib/util";

interface Line {
  product_id: number;
  qty: number;
  unit_cost: number;
  vat: boolean;
  imeis: string[];
  track_serial: boolean;
}

export async function createPurchase(_: unknown, fd: FormData) {
  const user = await requireUser("purchases");
  const s = await getSettings();
  const lines: Line[] = JSON.parse(str(fd, "lines") || "[]");
  if (!lines.length) return { error: "Add at least one item" };
  for (const l of lines) {
    if (l.qty <= 0) return { error: "Quantity must be more than zero" };
    if (l.track_serial && l.imeis.length !== l.qty) return { error: "Enter one IMEI for every unit of IMEI-tracked items" };
  }
  const allImeis = lines.flatMap((l) => l.imeis);
  if (new Set(allImeis).size !== allImeis.length) return { error: "The same IMEI is entered twice" };
  if (allImeis.length) {
    const dup = await q<{ imei: string }>("SELECT imei FROM units WHERE imei = ANY($1) AND status='in_stock'", [allImeis]);
    if (dup.length) return { error: `Already in stock: ${dup.map((d) => d.imei).join(", ")}` };
  }
  const rate = s.vat_rate;
  let subtotal = 0, vat = 0;
  const computed = lines.map((l) => {
    const net = r2(l.qty * l.unit_cost);
    const v = l.vat ? r2((net * rate) / 100) : 0;
    subtotal += net;
    vat += v;
    return { ...l, net, v };
  });
  subtotal = r2(subtotal);
  vat = r2(vat);
  const total = r2(subtotal + vat);
  const paid = Math.min(numf(fd, "paid"), total);
  const supplierId = Number(fd.get("supplier_id")) || null;

  const id = await tx(async (t) => {
    const number = await nextNumber(t, "purchase", "PUR-");
    const [p] = await t<{ id: number }>(
      `INSERT INTO purchases (number, supplier_id, bill_ref, date, subtotal, vat, total, paid, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [number, supplierId, str(fd, "bill_ref"), str(fd, "date") || new Date().toISOString().slice(0, 10), subtotal, vat, total, paid, str(fd, "notes"), user.id],
    );
    if (paid > 0) {
      await t("INSERT INTO supplier_payments (purchase_id, method, amount, created_by) VALUES ($1,$2,$3,$4)", [p.id, str(fd, "method") || "cash", paid, user.id]);
    }
    for (const l of computed) {
      await t("INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, vat, total) VALUES ($1,$2,$3,$4,$5,$6)", [
        p.id, l.product_id, l.qty, l.unit_cost, l.v, r2(l.net + l.v),
      ]);
      if (l.track_serial) {
        for (const imei of l.imeis) {
          await t("INSERT INTO units (product_id, imei, cost, source, purchase_id) VALUES ($1,$2,$3,'purchase',$4)", [l.product_id, imei, l.unit_cost, p.id]);
        }
      } else {
        await t("UPDATE products SET stock_qty = stock_qty + $1 WHERE id=$2 AND NOT is_service", [l.qty, l.product_id]);
      }
      // keep last purchase cost on the product
      await t("UPDATE products SET cost = $1 WHERE id=$2", [l.unit_cost, l.product_id]);
    }
    await log(user.id, "Purchase", `${number} · ${total.toFixed(2)}`, `/purchases/${p.id}`, t);
    return p.id;
  });
  revalidatePath("/purchases");
  revalidatePath("/products");
  redirect(`/purchases/${id}`);
}

export async function paySupplier(fd: FormData) {
  const user = await requireUser("purchases");
  const id = Number(fd.get("id"));
  const p = await one<{ total: number; paid: number }>("SELECT total, paid FROM purchases WHERE id=$1", [id]);
  if (!p) return;
  const amount = Math.min(numf(fd, "amount"), r2(p.total - p.paid));
  if (amount <= 0) return;
  await tx(async (t) => {
    await t("INSERT INTO supplier_payments (purchase_id, method, amount, created_by) VALUES ($1,$2,$3,$4)", [id, str(fd, "method"), amount, user.id]);
    await t("UPDATE purchases SET paid = paid + $1 WHERE id=$2", [amount, id]);
    await log(user.id, "Supplier paid", `${amount.toFixed(2)} by ${str(fd, "method")}`, `/purchases/${id}`, t);
  });
  revalidatePath(`/purchases/${id}`);
}
