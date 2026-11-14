"use server";
import { revalidatePath } from "next/cache";
import { moveQty, moveUnit, moveBatches, defaultWarehouseId } from "@/lib/inventory";
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
  batch_no?: string;
  expiry?: string;
}

export async function createPurchase(_: unknown, fd: FormData) {
  const user = await requireUser("purchases");
  const s = await getSettings();
  const lines: Line[] = JSON.parse(str(fd, "lines") || "[]");
  if (!lines.length) return { error: "Add at least one item" };
  const locked = await (await import("@/lib/books")).lockedMessage(str(fd, "date"));
  if (locked) return { error: locked };
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
  const poId = Number(fd.get("po_id")) || null;

  const id = await tx(async (t) => {
    const number = await nextNumber(t, "purchase", "PUR-");
    const [p] = await t<{ id: number }>(
      `INSERT INTO purchases (number, supplier_id, bill_ref, date, subtotal, vat, total, paid, notes, created_by, po_id, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [number, supplierId, str(fd, "bill_ref"), str(fd, "date") || new Date().toISOString().slice(0, 10), subtotal, vat, total, paid, str(fd, "notes"), user.id, poId, str(fd, "due_date") || null],
    );
    if (paid > 0) {
      await t("INSERT INTO supplier_payments (purchase_id, method, amount, created_by) VALUES ($1,$2,$3,$4)", [p.id, str(fd, "method") || "cash", paid, user.id]);
    }
    const wh = Number(str(fd, "warehouse_id")) || (await defaultWarehouseId(t));
    for (const l of computed) {
      await t("INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, vat, total, batch_no, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
        p.id, l.product_id, l.qty, l.unit_cost, l.v, r2(l.net + l.v), l.batch_no ?? "", l.expiry || null,
      ]);
      const [pr] = await t<{ track_batch: boolean }>("SELECT track_batch FROM products WHERE id=$1", [l.product_id]);
      if (pr?.track_batch) await t("INSERT INTO batches (product_id, warehouse_id, batch_no, expiry_date, qty, cost, purchase_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [l.product_id, wh, l.batch_no || number, l.expiry || null, l.qty, l.unit_cost, p.id]);
      if (poId) await t("UPDATE purchase_order_items SET received_qty = received_qty + $3 WHERE id = (SELECT id FROM purchase_order_items WHERE po_id=$1 AND product_id=$2 ORDER BY (received_qty < qty) DESC, id LIMIT 1)", [poId, l.product_id, l.qty]);
      if (l.track_serial) {
        for (const imei of l.imeis) {
          const [u] = await t<{ id: number }>("INSERT INTO units (product_id, imei, cost, source, purchase_id, warehouse_id) VALUES ($1,$2,$3,'purchase',$4,$5) RETURNING id", [l.product_id, imei, l.unit_cost, p.id, wh]);
          await moveUnit(t, { unitId: u.id, productId: l.product_id, qty: 1, type: "purchase", ref: number, userId: user.id, warehouseId: wh });
        }
      } else {
        await moveQty(t, { productId: l.product_id, qty: l.qty, type: "purchase", ref: number, userId: user.id, warehouseId: wh });
      }
      // keep last purchase cost on the product
      await t("UPDATE products SET cost = $1 WHERE id=$2", [l.unit_cost, l.product_id]);
    }
    if (poId) await t("UPDATE purchase_orders SET status = CASE WHEN NOT EXISTS (SELECT 1 FROM purchase_order_items WHERE po_id=$1 AND received_qty < qty) THEN 'received' ELSE 'partial' END, updated_at=now() WHERE id=$1", [poId]);
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
  const p = await one<{ total: number; paid: number }>("SELECT total - returned AS total, paid FROM purchases WHERE id=$1", [id]);
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

function go(path: string, msg: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

/** Purchase request -> (approval) -> order sent to supplier -> goods received as a purchase. */
export async function savePO(fd: FormData) {
  const user = await requireUser("purchases");
  const s = await getSettings();
  const lines: { product_id: number; qty: number; unit_cost: number }[] = JSON.parse(str(fd, "lines") || "[]").filter((l: any) => l.product_id && l.qty > 0);
  if (!lines.length) go("/purchases/orders/new", "Add at least one item", "err");
  const subtotal = r2(lines.reduce((a, l) => a + l.qty * l.unit_cost, 0));
  const canApprove = (await import("@/lib/auth")).can(user, "purchases.approve");
  const auto = canApprove || (s.po_approval_limit > 0 && subtotal <= s.po_approval_limit);
  const id = await tx(async (t) => {
    const number = await nextNumber(t, "po", "PO-");
    const [po] = await t<{ id: number }>(
      `INSERT INTO purchase_orders (number, supplier_id, status, warehouse_id, expected_date, supplier_quote_ref, notes, subtotal, requested_by, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [number, Number(str(fd, "supplier_id")) || null, auto ? "approved" : "request", Number(str(fd, "warehouse_id")) || null, str(fd, "expected_date") || null, str(fd, "supplier_quote_ref"), str(fd, "notes"), subtotal, user.id, auto ? user.id : null, auto ? new Date() : null],
    );
    for (const l of lines) await t("INSERT INTO purchase_order_items (po_id, product_id, qty, unit_cost) VALUES ($1,$2,$3,$4)", [po.id, l.product_id, Math.round(l.qty), l.unit_cost]);
    await log(user.id, auto ? "Purchase order created" : "Purchase request raised", `${number} · ${subtotal.toFixed(2)}`, `/purchases/orders/${po.id}`, t);
    return po.id;
  });
  if (!auto) await (await import("@/lib/notify")).notifyPerm(["purchases.approve"], `Purchase request from ${user.name} needs approval (${subtotal.toFixed(2)})`, `/purchases/orders/${id}`, "approval", user.id);
  revalidatePath("/purchases/orders");
  go(`/purchases/orders/${id}`, auto ? "Purchase order created" : "Request sent for approval");
}

export async function setPOStatus(fd: FormData) {
  const id = Number(str(fd, "id")), to = str(fd, "status");
  const po = await one<any>("SELECT * FROM purchase_orders WHERE id=$1", [id]);
  if (!po) go("/purchases/orders", "Not found", "err");
  const user = await requireUser(["approved", "rejected"].includes(to) ? "purchases.approve" : "purchases");
  const allowed: Record<string, string[]> = { request: ["approved", "rejected", "cancelled"], approved: ["ordered", "cancelled"], ordered: ["cancelled"], partial: ["received"], rejected: ["request"] };
  if (!(allowed[po.status] ?? []).includes(to)) go(`/purchases/orders/${id}`, "That step is not possible now", "err");
  await q(`UPDATE purchase_orders SET status=$2, updated_at=now(), approved_by = CASE WHEN $2='approved' THEN $3 ELSE approved_by END, approved_at = CASE WHEN $2='approved' THEN now() ELSE approved_at END,
     sent_at = CASE WHEN $2='ordered' THEN now() ELSE sent_at END, supplier_quote_ref = COALESCE(NULLIF($4,''), supplier_quote_ref) WHERE id=$1`, [id, to, user.id, str(fd, "supplier_quote_ref")]);
  await log(user.id, `Purchase order ${to}`, po.number, `/purchases/orders/${id}`);
  if (po.requested_by && po.requested_by !== user.id && ["approved", "rejected"].includes(to)) await (await import("@/lib/notify")).notify(po.requested_by, `${po.number} was ${to}`, `/purchases/orders/${id}`);
  revalidatePath("/purchases/orders");
  go(`/purchases/orders/${id}`, `Marked ${to}`);
}

/** Debit note: send goods back to the supplier, reduce stock and what we owe. */
export async function returnToSupplier(fd: FormData) {
  const user = await requireUser("purchases");
  const id = Number(str(fd, "id"));
  const s = await getSettings();
  try {
    const rid = await tx(async (t) => {
      const [p] = await t<any>("SELECT * FROM purchases WHERE id=$1", [id]);
      const items = await t<any>(`SELECT pi.*, pr.track_serial, pi.qty - COALESCE((SELECT sum(ri.qty) FROM purchase_return_items ri WHERE ri.purchase_item_id=pi.id),0)::int AS returnable
        FROM purchase_items pi JOIN products pr ON pr.id=pi.product_id WHERE pi.purchase_id=$1`, [id]);
      const picked: any[] = [];
      for (const it of items) {
        if (it.track_serial) {
          const imeis = str(fd, `imeis_${it.id}`).split(/[\s,]+/).filter(Boolean);
          for (const imei of imeis) {
            const [u] = await t<any>("SELECT id FROM units WHERE imei=$1 AND product_id=$2 AND purchase_id=$3 AND status='in_stock'", [imei, it.product_id, id]);
            if (!u) throw new Error(`IMEI ${imei} is not in stock from this purchase`);
            picked.push({ it, qty: 1, unitId: u.id });
          }
        } else {
          const qty = Math.round(numf(fd, `ret_${it.id}`));
          if (qty > it.returnable) throw new Error(`Only ${it.returnable} can still be returned`);
          if (qty > 0) picked.push({ it, qty, unitId: null });
        }
      }
      if (!picked.length) throw new Error("Choose what to return");
      const number = await nextNumber(t, "debit_note", "DN-");
      let subtotal = 0, vat = 0;
      const [r] = await t<{ id: number }>("INSERT INTO purchase_returns (number, purchase_id, supplier_id, reason, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [number, id, p.supplier_id, str(fd, "reason"), user.id]);
      for (const x of picked) {
        const net = r2(x.qty * Number(x.it.unit_cost)), v = r2((Number(x.it.vat) / x.it.qty) * x.qty);
        subtotal += net; vat += v;
        await t("INSERT INTO purchase_return_items (return_id, purchase_item_id, product_id, unit_id, qty, unit_cost, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [r.id, x.it.id, x.it.product_id, x.unitId, x.qty, x.it.unit_cost, v, r2(net + v)]);
        if (x.unitId) {
          await t("UPDATE units SET status='returned_supplier' WHERE id=$1", [x.unitId]);
          await moveUnit(t, { unitId: x.unitId, productId: x.it.product_id, qty: -1, type: "purchase_return", ref: number, userId: user.id });
        } else {
          const [st] = await t<{ q: number }>("SELECT COALESCE(sum(qty),0)::int q FROM product_stock WHERE product_id=$1", [x.it.product_id]);
          if (st.q < x.qty) throw new Error("Not enough stock left to return that quantity");
          await moveQty(t, { productId: x.it.product_id, qty: -x.qty, type: "purchase_return", ref: number, userId: user.id });
          await moveBatches(t, x.it.product_id, -x.qty);
        }
      }
      subtotal = r2(subtotal); vat = r2(vat);
      await t("UPDATE purchase_returns SET subtotal=$2, vat=$3, total=$4 WHERE id=$1", [r.id, subtotal, vat, r2(subtotal + vat)]);
      await t("UPDATE purchases SET returned = returned + $2 WHERE id=$1", [id, r2(subtotal + vat)]);
      await log(user.id, "Purchase return (debit note)", `${number} · ${s.currency} ${(subtotal + vat).toFixed(2)}`, `/purchases/${id}`, t);
      return r.id;
    });
    void rid;
  } catch (e: any) {
    go(`/purchases/${id}`, e?.message ?? "Could not save the return", "err");
  }
  revalidatePath(`/purchases/${id}`);
  go(`/purchases/${id}`, "Debit note created. Stock and the supplier balance are updated.");
}
