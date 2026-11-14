"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { str, numf, r2 } from "@/lib/util";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { lockedMessage } from "@/lib/books";
import { notify, notifyPerm } from "@/lib/notify";

export async function addExpense(fd: FormData) {
  const user = await requireUser("expenses");
  const s = await getSettings();
  const total = numf(fd, "total");
  const locked = await lockedMessage(str(fd, "date"));
  if (locked) redirect(`/expenses?err=${encodeURIComponent(locked)}`);
  const needs = s.expense_approval_limit > 0 && total > s.expense_approval_limit && !can(user, "expenses.approve");
  const hasVat = fd.get("has_vat") === "on" && s.vat_registered;
  const vat = hasVat ? r2((total * s.vat_rate) / (100 + s.vat_rate)) : 0;
  const [row] = await q<{ id: number }>("INSERT INTO expenses (date, category, description, amount, vat, total, method, created_by, status, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", [
    str(fd, "date"), str(fd, "category") || "General", str(fd, "description"), r2(total - vat), vat, total, str(fd, "method"), user.id, needs ? "pending" : "approved", needs ? null : user.id,
  ]);
  if (needs) await notifyPerm(["expenses.approve"], `Expense needs approval: ${str(fd, "category")} ${total.toFixed(2)}`, `/expenses/${row.id}`, "approval", user.id);
  await log(user.id, "Expense", `${str(fd, "category")} · ${total.toFixed(2)}`, "/expenses");
  revalidatePath("/expenses");
}

export async function deleteExpense(fd: FormData) {
  const user = await requireUser("expenses.delete");
  const cur = await q<any>("SELECT to_char(date,'YYYY-MM-DD') d FROM expenses WHERE id=$1", [Number(fd.get("id"))]);
  const locked = await lockedMessage(cur[0]?.d);
  if (locked) redirect(`/expenses?err=${encodeURIComponent(locked)}`);
  await q("DELETE FROM files WHERE kind='expense' AND owner_id=$1", [Number(fd.get("id"))]);
  const rows = await q<any>("DELETE FROM expenses WHERE id=$1 RETURNING category, total", [Number(fd.get("id"))]);
  if (rows[0]) await log(user.id, "Expense deleted", `${rows[0].category} · ${Number(rows[0].total).toFixed(2)}`, "/expenses");
  revalidatePath("/expenses");
}

export async function decideExpense(fd: FormData) {
  const user = await requireUser("expenses.approve");
  const id = Number(fd.get("id"));
  const ok = str(fd, "decision") !== "reject";
  const [e] = await q<any>("UPDATE expenses SET status=$2, approved_by=$3 WHERE id=$1 AND status='pending' RETURNING category, total, created_by", [id, ok ? "approved" : "rejected", user.id]);
  if (e) {
    await log(user.id, ok ? "Expense approved" : "Expense rejected", `${e.category} · ${Number(e.total).toFixed(2)}`, `/expenses/${id}`);
    await notify(e.created_by, `Your expense (${e.category} ${Number(e.total).toFixed(2)}) was ${ok ? "approved" : "rejected"}`, `/expenses/${id}`);
  }
  revalidatePath("/expenses");
  redirect(`/expenses/${id}?ok=${encodeURIComponent(ok ? "Approved" : "Rejected")}`);
}
