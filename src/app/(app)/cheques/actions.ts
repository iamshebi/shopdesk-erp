"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { num, str, numf } from "@/lib/util";

const back = (msg: string, ok = false, dir = ""): never => redirect(`/cheques?${dir ? `dir=${dir}&` : ""}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);

export async function addCheque(fd: FormData) {
  const user = await requireUser("cheques");
  const direction = str(fd, "direction") === "issued" ? "issued" : "received";
  const amount = numf(fd, "amount");
  const party = str(fd, "party");
  const number = str(fd, "number");
  const due = str(fd, "due_date");
  if (!number || !party || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) back("Cheque number, name, amount and cheque date are required.", false, direction);
  const dup = await one("SELECT 1 FROM cheques WHERE direction=$1 AND number=$2 AND lower(bank)=lower($3) AND status<>'cancelled'", [direction, number, str(fd, "bank")]);
  if (dup) back(`Cheque ${number} from ${str(fd, "bank") || "this bank"} is already in the register.`, false, direction);
  const cust = direction === "received" ? await one<{ id: number }>("SELECT id FROM customers WHERE lower(name)=lower($1) LIMIT 1", [party]) : undefined;
  const supp = direction === "issued" ? await one<{ id: number }>("SELECT id FROM suppliers WHERE lower(name)=lower($1) LIMIT 1", [party]) : undefined;
  await q(
    "INSERT INTO cheques (direction, number, bank, party, customer_id, supplier_id, amount, due_date, reference, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [direction, number, str(fd, "bank"), party, cust?.id ?? null, supp?.id ?? null, amount, due, str(fd, "reference"), str(fd, "notes"), user.id],
  );
  await log(user.id, direction === "received" ? "Cheque received" : "Cheque issued", `${number} · ${party} · ${num(amount)} · dated ${due}`, "/cheques");
  revalidatePath("/cheques");
  back(`Cheque ${number} saved.`, true, direction);
}

const NEXT: Record<string, string[]> = {
  pending: ["deposited", "cleared", "bounced", "returned", "cancelled"],
  deposited: ["cleared", "bounced"],
  bounced: ["deposited", "returned", "cancelled"],
};

export async function setChequeStatus(fd: FormData) {
  const user = await requireUser("cheques");
  const id = Number(fd.get("id"));
  const status = str(fd, "status");
  const c = await one<any>("SELECT * FROM cheques WHERE id=$1", [id]);
  if (!c) back("Cheque not found.");
  if (!(NEXT[c.status] ?? []).includes(status)) back(`A ${c.status} cheque cannot be marked ${status}.`, false, c.direction);
  await q("UPDATE cheques SET status=$2, updated_at=now(), notes = CASE WHEN $3 = '' THEN notes ELSE trim(notes || ' ' || $3) END WHERE id=$1", [id, status, str(fd, "note")]);
  await log(user.id, `Cheque ${status}`, `${c.number} · ${c.party} · ${num(c.amount)}`, "/cheques");
  revalidatePath("/cheques");
  back(`Cheque ${c.number} marked ${status}.`, true, c.direction);
}
