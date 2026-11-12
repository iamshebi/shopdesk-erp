"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { str, numf, r2 } from "@/lib/util";

export async function addExpense(fd: FormData) {
  const user = await requireUser("expenses");
  const s = await getSettings();
  const total = numf(fd, "total");
  const hasVat = fd.get("has_vat") === "on" && s.vat_registered;
  const vat = hasVat ? r2((total * s.vat_rate) / (100 + s.vat_rate)) : 0;
  await q("INSERT INTO expenses (date, category, description, amount, vat, total, method, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    str(fd, "date"), str(fd, "category") || "General", str(fd, "description"), r2(total - vat), vat, total, str(fd, "method"), user.id,
  ]);
  revalidatePath("/expenses");
}

export async function deleteExpense(fd: FormData) {
  const user = await requireUser("expenses");
  if (user.role !== "owner") return;
  await q("DELETE FROM expenses WHERE id=$1", [Number(fd.get("id"))]);
  revalidatePath("/expenses");
}
