"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tx, one } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createReturn, SaleError, OUTSTANDING_SQL } from "@/lib/sales";
import { r2, str, numf } from "@/lib/util";

export async function receivePayment(fd: FormData) {
  const user = await requireUser("sales.payments");
  const id = Number(fd.get("id"));
  const row = await one<{ outstanding: number }>(`SELECT ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1 AND s.type='invoice'`, [id]);
  if (!row) return;
  const amount = r2(Math.min(numf(fd, "amount"), row.outstanding));
  if (amount <= 0) return;
  await tx(async (t) => {
    await t("INSERT INTO payments (sale_id, method, amount, reference, created_by) VALUES ($1,$2,$3,$4,$5)", [id, str(fd, "method"), amount, str(fd, "reference"), user.id]);
    await t("UPDATE sales SET paid = paid + $1 WHERE id=$2", [amount, id]);
    const [s] = await t<{ number: string }>("SELECT number FROM sales WHERE id=$1", [id]);
    await log(user.id, "Payment received", `${s.number} · ${amount.toFixed(2)} by ${str(fd, "method")}`, `/sales/${id}`, t);
  });
  revalidatePath(`/sales/${id}`);
}

export async function returnItems(fd: FormData) {
  const user = await requireUser("sales.returns");
  const s = await getSettings();
  const id = Number(fd.get("id"));
  const lines: { item_id: number; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("ret_")) lines.push({ item_id: Number(k.slice(4)), qty: Math.round(Number(v) || 0) });
  }
  let cnId: number;
  try {
    cnId = await tx(async (t) => {
      const cn = await createReturn(t, s, id, lines, { method: str(fd, "method"), reason: str(fd, "reason") }, user.id);
      const [r] = await t<{ number: string; total: number }>("SELECT number, total FROM sales WHERE id=$1", [cn]);
      await log(user.id, "Return / refund", `${r.number} · ${r.total.toFixed(2)} · ${str(fd, "reason")}`, `/sales/${cn}`, t);
      return cn;
    });
  } catch (e) {
    if (e instanceof SaleError) redirect(`/sales/${id}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/sales");
  redirect(`/sales/${cnId}?new=1`);
}
