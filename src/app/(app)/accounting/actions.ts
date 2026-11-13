"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, tx, nextNumber } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { ensureLedger } from "@/lib/accounting";
import { str, numf, r2 } from "@/lib/util";

function go(path: string, msg: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

export async function saveAccount(fd: FormData) {
  const user = await requireUser("accounting");
  const id = Number(str(fd, "id"));
  const code = str(fd, "code"), name = str(fd, "name"), type = str(fd, "type");
  if (!code || !name || !["asset", "liability", "equity", "income", "expense"].includes(type)) go("/accounting/accounts", "Code, name and type are needed", "err");
  try {
    if (id) await q("UPDATE accounts SET code=$2, name=$3, is_bank=$4, active=$5 WHERE id=$1", [id, code, name, fd.get("is_bank") === "on", fd.get("active") !== "off"]);
    else await q("INSERT INTO accounts (code, name, type, is_bank) VALUES ($1,$2,$3,$4)", [code, name, type, fd.get("is_bank") === "on"]);
  } catch {
    go("/accounting/accounts", "That account code is already used", "err");
  }
  await log(user.id, id ? "Account edited" : "Account added", `${code} ${name}`, "/accounting/accounts");
  revalidatePath("/accounting");
  go("/accounting/accounts", "Saved");
}

export async function saveJournal(fd: FormData) {
  const user = await requireUser("accounting");
  await ensureLedger();
  const date = str(fd, "date");
  const memo = str(fd, "memo");
  let lines: { account_id: number; debit: number; credit: number; memo: string }[] = [];
  try {
    lines = (JSON.parse(str(fd, "lines") || "[]") as any[]).map((l) => ({ account_id: Number(l.account_id), debit: r2(Number(l.debit) || 0), credit: r2(Number(l.credit) || 0), memo: String(l.memo ?? "") }))
      .filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
  } catch {}
  const dr = r2(lines.reduce((a, l) => a + l.debit, 0)), cr = r2(lines.reduce((a, l) => a + l.credit, 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) go("/accounting/journal", "Choose a date", "err");
  if (lines.length < 2) go("/accounting/journal", "A journal entry needs at least two lines", "err");
  if (Math.abs(dr - cr) > 0.004) go("/accounting/journal", `Debits (${dr.toFixed(2)}) and credits (${cr.toFixed(2)}) must be equal`, "err");
  const number = await tx(async (t) => {
    const number = await nextNumber(t, "journal", "JE-");
    const [e] = await t<{ id: number }>("INSERT INTO journal_entries (date, number, memo, created_by) VALUES ($1,$2,$3,$4) RETURNING id", [date, number, memo, user.id]);
    for (const l of lines) await t("INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo) VALUES ($1,$2,$3,$4,$5)", [e.id, l.account_id, l.debit, l.credit, l.memo]);
    return number;
  });
  await log(user.id, "Journal entry", `${number} · ${dr.toFixed(2)} · ${memo}`, "/accounting/journal");
  revalidatePath("/accounting");
  go("/accounting/journal", `${number} saved`);
}

export async function deleteJournal(fd: FormData) {
  const user = await requireUser("accounting");
  const id = Number(str(fd, "id"));
  const rows = await q<any>("DELETE FROM journal_entries WHERE id=$1 AND source='' RETURNING number", [id]);
  if (rows[0]) await log(user.id, "Journal entry deleted", rows[0].number, "/accounting/journal");
  go("/accounting/journal", rows[0] ? `${rows[0].number} deleted` : "Automatic entries can't be deleted. Change the document instead.");
}

export async function saveReconciliation(fd: FormData) {
  const user = await requireUser("accounting");
  const account = Number(str(fd, "account_id"));
  const date = str(fd, "statement_date");
  const balance = numf(fd, "statement_balance");
  const ids = fd.getAll("line").map(Number).filter(Boolean);
  const back = `/accounting/bank?account_id=${account}&statement_date=${date}&statement_balance=${balance}`;
  const [{ cleared }] = await q<{ cleared: number }>(
    `SELECT COALESCE(sum(CASE WHEN l.reconciliation_id IS NOT NULL OR l.id = ANY($2::int[]) THEN l.debit - l.credit END),0) cleared
     FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=$1 AND e.date <= $3`,
    [account, ids, date],
  );
  if (Math.abs(Number(cleared) - balance) > 0.004) go(back, `Ticked items total ${Number(cleared).toFixed(2)} but the statement says ${balance.toFixed(2)}. Find the difference first.`, "err");
  await tx(async (t) => {
    const [r] = await t<{ id: number }>("INSERT INTO bank_reconciliations (account_id, statement_date, statement_balance, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [account, date, balance, str(fd, "notes"), user.id]);
    if (ids.length) await t("UPDATE journal_lines SET reconciliation_id=$1 WHERE id = ANY($2::int[]) AND account_id=$3 AND reconciliation_id IS NULL", [r.id, ids, account]);
  });
  await log(user.id, "Bank reconciled", `${date}: ${balance.toFixed(2)}`, "/accounting/bank");
  go(`/accounting/bank?account_id=${account}`, `Reconciled to ${balance.toFixed(2)} on ${date}`);
}
