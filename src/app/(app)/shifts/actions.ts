"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { log } from "@/lib/activity";
import { saveSettings } from "@/lib/settings";
import { num, str, numf } from "@/lib/util";
import { openShiftOf, shiftTotals } from "@/lib/shifts";

const back = (msg: string, ok = false): never => redirect(`/shifts?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function openShift(fd: FormData) {
  const user = await requireUser("pos");
  if (await openShiftOf(user.id)) back("Your shift is already open.");
  const float = numf(fd, "opening_float");
  if (!(float >= 0)) back("Enter the cash in the drawer at the start (0 if empty).");
  await q("INSERT INTO cash_shifts (user_id, counter, opening_float) VALUES ($1,$2,$3)", [user.id, str(fd, "counter"), float]);
  await log(user.id, "Cash shift opened", `${str(fd, "counter") || "Counter"} · float ${num(float)}`, "/shifts");
  revalidatePath("/shifts");
  back("Shift opened. Good selling!", true);
}

export async function addCashMove(fd: FormData) {
  const user = await requireUser("pos");
  const shift = await openShiftOf(user.id);
  if (!shift) back("Open your shift first.");
  const kind = str(fd, "kind") === "in" ? "in" : "out";
  const amount = numf(fd, "amount");
  if (!(amount > 0)) back("Enter an amount.");
  if (!str(fd, "reason")) back("Write the reason, e.g. change from the bank, petrol, paid to owner.");
  await q("INSERT INTO cash_moves (shift_id, kind, amount, reason, created_by) VALUES ($1,$2,$3,$4,$5)", [shift!.id, kind, amount, str(fd, "reason"), user.id]);
  await log(user.id, kind === "in" ? "Cash put in drawer" : "Cash taken from drawer", `${num(amount)} · ${str(fd, "reason")}`, "/shifts");
  revalidatePath("/shifts");
  back(`Cash ${kind === "in" ? "in" : "out"} saved.`, true);
}

export async function closeShift(fd: FormData) {
  const user = await requireUser(["pos", "shifts.all"]);
  const id = Number(fd.get("id"));
  const shift = await one<any>("SELECT * FROM cash_shifts WHERE id=$1 AND closed_at IS NULL", [id]);
  if (!shift) back("That shift is already closed.");
  if (shift.user_id !== user.id && !can(user, "shifts.all")) back("You can only close your own shift.");
  const counted = numf(fd, "counted_cash");
  if (!(counted >= 0) || str(fd, "counted_cash") === "") back("Count the cash in the drawer and enter the total.");
  const closedAt = new Date().toISOString();
  const t = await shiftTotals({ ...shift, closed_at: closedAt });
  await q("UPDATE cash_shifts SET closed_at=$2, expected_cash=$3, counted_cash=$4, notes=$5, closed_by=$6 WHERE id=$1", [id, closedAt, t.expected, counted, str(fd, "notes"), user.id]);
  const diff = Math.round((counted - t.expected) * 100) / 100;
  await log(user.id, "Cash shift closed", `expected ${num(t.expected)} · counted ${num(counted)} · ${diff === 0 ? "exact" : diff > 0 ? `over ${num(diff)}` : `short ${num(-diff)}`}`, "/shifts");
  revalidatePath("/shifts");
  redirect(`/shifts?closed=${id}`);
}

export async function setRequireShift(fd: FormData) {
  const user = await requireUser("settings");
  const on = fd.get("on") === "1";
  await saveSettings({ require_open_shift: on });
  await log(user.id, on ? "Cash shifts made required" : "Cash shifts made optional", "", "/shifts");
  revalidatePath("/", "layout");
  back(on ? "Cashiers now open a shift before their first sale." : "Shifts are now optional.", true);
}
