"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx, nextNumber } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { SHIP_STATUSES } from "@/lib/shipping";
import { fireWebhook } from "@/lib/webhooks";
import { str, numf } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function createShipment(fd: FormData) {
  const user = await requireUser("shipping");
  const name = str(fd, "customer_name"), phone = str(fd, "customer_phone");
  if (!name && !phone) go("/shipping?new=1", "Add the receiver's name or phone", "err");
  const id = await tx(async (t) => {
    const number = await nextNumber(t, "shipment", "SHP-");
    const [r] = await t<{ id: number }>(`INSERT INTO shipments (number, order_id, sale_id, customer_name, customer_phone, address, courier, tracking_no, cost, cod_amount, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [number, Number(str(fd, "order_id")) || null, Number(str(fd, "sale_id")) || null, name, phone, str(fd, "address"), str(fd, "courier"), str(fd, "tracking_no"), Math.max(0, numf(fd, "cost")), Math.max(0, numf(fd, "cod_amount")), str(fd, "notes"), user.id]);
    return r.id;
  });
  await log(user.id, "Shipment created", name || phone, "/shipping");
  revalidatePath("/shipping");
  go("/shipping", "Shipment created");
}

export async function updateShipment(fd: FormData) {
  const user = await requireUser("shipping");
  const id = Number(str(fd, "id"));
  const status = SHIP_STATUSES.some((s) => s.id === str(fd, "status")) ? str(fd, "status") : null;
  const sh = await one<any>(
    `UPDATE shipments SET status=COALESCE($2,status), tracking_no=COALESCE(NULLIF($3,''),tracking_no), courier=COALESCE(NULLIF($4,''),courier),
       cod_collected = CASE WHEN $5='1' THEN TRUE ELSE cod_collected END,
       shipped_at = CASE WHEN $2 IN ('in_transit','out_for_delivery') THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
       delivered_at = CASE WHEN $2='delivered' THEN now() ELSE delivered_at END, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, status, str(fd, "tracking_no"), str(fd, "courier"), str(fd, "cod")],
  );
  if (sh?.order_id && status === "delivered") {
    await q("INSERT INTO order_events (order_id, status, note, user_id) VALUES ($1,'shipped',$2,$3)", [sh.order_id, `Courier delivered (${sh.number})`, user.id]).catch(() => {});
  }
  if (status) await fireWebhook("shipment.status", { id, number: sh?.number, status, tracking_no: sh?.tracking_no, order_id: sh?.order_id });
  revalidatePath("/shipping");
  go(str(fd, "back") || "/shipping", "Updated");
}

export async function saveZone(fd: FormData) {
  await requireUser("shipping");
  if (str(fd, "delete")) await q("DELETE FROM shipping_zones WHERE id=$1", [Number(str(fd, "delete"))]);
  else if (str(fd, "name")) {
    const f = [str(fd, "name"), str(fd, "areas"), Math.max(0, numf(fd, "charge")), Math.max(0, numf(fd, "free_over")), str(fd, "days")];
    if (Number(str(fd, "id"))) await q("UPDATE shipping_zones SET name=$2, areas=$3, charge=$4, free_over=$5, days=$6 WHERE id=$1", [Number(str(fd, "id")), ...f]);
    else await q("INSERT INTO shipping_zones (name, areas, charge, free_over, days) VALUES ($1,$2,$3,$4,$5)", f);
  }
  go("/shipping/zones", "Saved");
}
