"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx, nextNumber } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createSale, SaleError } from "@/lib/sales";
import { str, numf, r2 } from "@/lib/util";
import { after } from "next/server";
import { autoMessage } from "@/lib/auto-messages";
import { baseUrl, saleToken } from "@/lib/public-link";

export async function createRepair(fd: FormData) {
  const user = await requireUser("repairs");
  const name = str(fd, "customer_name");
  const phone = str(fd, "customer_phone");
  const id = await tx(async (t) => {
    let customerId: number | null = null;
    if (phone) {
      const [c] = await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [phone]);
      customerId = c?.id ?? (await t<{ id: number }>("INSERT INTO customers (name, phone) VALUES ($1,$2) RETURNING id", [name || phone, phone]))[0].id;
    }
    const number = await nextNumber(t, "repair", "JOB-");
    const [r] = await t<{ id: number }>(
      `INSERT INTO repairs (number, customer_id, customer_name, customer_phone, device, imei, issue, accessories, condition_notes, passcode, estimate, advance, advance_method, promised_at, technician_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [
        number, customerId, name, phone, str(fd, "device"), str(fd, "imei"), str(fd, "issue"), str(fd, "accessories"), str(fd, "condition_notes"), str(fd, "passcode"),
        numf(fd, "estimate"), numf(fd, "advance"), str(fd, "advance_method") || "cash", str(fd, "promised_at") || null, Number(fd.get("technician_id")) || null, user.id,
      ],
    );
    await t("INSERT INTO repair_logs (repair_id, status, note, user_id) VALUES ($1,'received',$2,$3)", [r.id, "Device received", user.id]);
    await log(user.id, "Repair job created", `${number} · ${str(fd, "device")} · ${name}`, `/repairs/${r.id}`, t);
    return r.id;
  });
  if (phone) {
    const v = { number: "", device: str(fd, "device"), estimate: numf(fd, "estimate"), ready_by: str(fd, "promised_at") || null };
    after(async () => {
      const r = await one<{ number: string }>("SELECT number FROM repairs WHERE id=$1", [id]);
      await autoMessage("repair_received", phone, { ...v, number: r?.number ?? "" });
    });
  }
  revalidatePath("/repairs");
  redirect(`/repairs/${id}?new=1`);
}

export async function updateRepairStatus(fd: FormData) {
  const user = await requireUser("repairs");
  const id = Number(fd.get("id"));
  const status = str(fd, "status");
  if (status === "delivered") redirect(`/repairs/${id}`);
  await q("UPDATE repairs SET status=$1, updated_at=now() WHERE id=$2 AND status <> 'delivered'", [status, id]);
  await q("INSERT INTO repair_logs (repair_id, status, note, user_id) VALUES ($1,$2,$3,$4)", [id, status, str(fd, "note"), user.id]);
  const r = await one<{ number: string; customer_phone: string; device: string; estimate: number; final_charge: number | null }>("SELECT number, customer_phone, device, estimate, final_charge FROM repairs WHERE id=$1", [id]);
  await log(user.id, "Repair status", `${r?.number} → ${status.replace("_", " ")}`, `/repairs/${id}`);
  if (status === "ready" && r?.customer_phone) {
    after(() => autoMessage("repair_ready", r.customer_phone, { number: r.number, device: r.device, charge: Number(r.final_charge ?? r.estimate) || 0 }));
  }
  revalidatePath(`/repairs/${id}`);
  revalidatePath("/repairs");
}

export async function updateRepairDetails(fd: FormData) {
  await requireUser("repairs");
  const id = Number(fd.get("id"));
  const fc = str(fd, "final_charge");
  await q(
    `UPDATE repairs SET final_charge=$1, parts_cost=$2, technician_id=$3, estimate=$4, promised_at=$5, issue=$6, updated_at=now() WHERE id=$7`,
    [fc === "" ? null : numf(fd, "final_charge"), numf(fd, "parts_cost"), Number(fd.get("technician_id")) || null, numf(fd, "estimate"), str(fd, "promised_at") || null, str(fd, "issue"), id],
  );
  revalidatePath(`/repairs/${id}`);
  redirect(`/repairs/${id}?saved=1`);
}

export async function deliverRepair(fd: FormData) {
  const user = await requireUser("repairs.deliver");
  const s = await getSettings();
  const id = Number(fd.get("id"));
  const r = await one<any>("SELECT * FROM repairs WHERE id=$1", [id]);
  if (!r || r.status === "delivered") redirect(`/repairs/${id}`);
  const charge = numf(fd, "charge");
  const method = str(fd, "method") || "cash";
  let saleId: number;
  try {
    saleId = await tx(async (t) => {
      const sid = await createSale(t, s, {
        customer: { id: r.customer_id, name: r.customer_name, phone: r.customer_phone, trn: "", address: "" },
        lines: [{ product_id: null, description: `Repair service — ${r.device}: ${r.issue} (${r.number})`, qty: 1, unit_price: charge, cost: r.parts_cost }],
        payments: [
          ...(r.advance > 0 ? [{ method: r.advance_method, amount: Math.min(r.advance, charge), reference: "Advance" }] : []),
          { method, amount: method === "credit" ? 0 : r2(Math.max(0, charge - r.advance)) },
        ],
        repair_id: r.id,
        userId: user.id,
      });
      await t("UPDATE repairs SET status='delivered', final_charge=$1, sale_id=$2, delivered_at=now(), updated_at=now() WHERE id=$3", [charge, sid, id]);
      await t("INSERT INTO repair_logs (repair_id, status, note, user_id) VALUES ($1,'delivered',$2,$3)", [id, "Delivered to customer", user.id]);
      await log(user.id, "Repair delivered", `${r.number} · ${charge.toFixed(2)}`, `/sales/${sid}`, t);
      return sid;
    });
  } catch (e) {
    if (e instanceof SaleError) redirect(`/repairs/${id}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const done = await one<{ number: string; customer_phone: string; device: string }>("SELECT number, customer_phone, device FROM repairs WHERE id=$1", [id]);
  if (done?.customer_phone) {
    const link = `${await baseUrl()}/i/${await saleToken(saleId)}`;
    after(() => autoMessage("repair_delivered", done.customer_phone, { number: done.number, device: done.device, link }));
  }
  revalidatePath("/repairs");
  redirect(`/sales/${saleId}?new=1`);
}
