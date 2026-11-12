"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tx, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createReturn, SaleError, OUTSTANDING_SQL } from "@/lib/sales";
import { r2, str, numf } from "@/lib/util";

export async function receivePayment(fd: FormData) {
  const user = await requireUser("sales");
  const id = Number(fd.get("id"));
  const row = await one<{ outstanding: number }>(`SELECT ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1 AND s.type='invoice'`, [id]);
  if (!row) return;
  const amount = r2(Math.min(numf(fd, "amount"), row.outstanding));
  if (amount <= 0) return;
  await tx(async (t) => {
    await t("INSERT INTO payments (sale_id, method, amount, reference, created_by) VALUES ($1,$2,$3,$4,$5)", [id, str(fd, "method"), amount, str(fd, "reference"), user.id]);
    await t("UPDATE sales SET paid = paid + $1 WHERE id=$2", [amount, id]);
  });
  revalidatePath(`/sales/${id}`);
}

export async function returnItems(fd: FormData) {
  const user = await requireUser("sales");
  if (user.role === "technician") redirect("/");
  const s = await getSettings();
  const id = Number(fd.get("id"));
  const lines: { item_id: number; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("ret_")) lines.push({ item_id: Number(k.slice(4)), qty: Math.round(Number(v) || 0) });
  }
  let cnId: number;
  try {
    cnId = await tx((t) => createReturn(t, s, id, lines, { method: str(fd, "method"), reason: str(fd, "reason") }, user.id));
  } catch (e) {
    if (e instanceof SaleError) redirect(`/sales/${id}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/sales");
  redirect(`/sales/${cnId}?new=1`);
}
