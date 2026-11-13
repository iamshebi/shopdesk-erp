"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tx, one, q } from "@/lib/db";
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

function goTo(path: string, msg: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

export async function emailInvoice(fd: FormData) {
  const user = await requireUser("sales.view");
  const id = Number(fd.get("id"));
  const back = String(fd.get("back") || `/sales/${id}`);
  const { invoiceEmailHtml, customerEmail } = await import("@/lib/billing");
  const { sendEmail } = await import("@/lib/email");
  const { baseUrl } = await import("@/lib/public-link");
  const reminder = fd.get("reminder") === "1";
  const { sale, html, subject } = await invoiceEmailHtml(id, await baseUrl(), reminder);
  const to = str(fd, "to") || (await customerEmail(sale));
  if (str(fd, "to") && sale.customer_id) await q("UPDATE customers SET email=$2 WHERE id=$1 AND email=''", [sale.customer_id, to]);
  const r = await sendEmail(to, subject, html);
  if (!r.ok) goTo(back, r.error ?? "Email failed", "err");
  if (reminder) await q("UPDATE sales SET last_reminder_at=now() WHERE id=$1", [id]);
  await log(user.id, reminder ? "Reminder emailed" : "Invoice emailed", `${sale.number} → ${to}`, `/sales/${id}`);
  goTo(back, `Emailed to ${to}`);
}

export async function markReminded(fd: FormData) {
  await requireUser("sales.view");
  await q("UPDATE sales SET last_reminder_at=now() WHERE id=$1", [Number(fd.get("id"))]);
  revalidatePath("/sales/reminders");
}

export async function makePayLink(fd: FormData) {
  const user = await requireUser("sales.payments");
  const id = Number(fd.get("id"));
  const s = await (await import("@/lib/settings")).getSettings();
  const row = await one<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1 AND s.type='invoice'`, [id]);
  if (!row || row.outstanding <= 0.004) goTo(`/sales/${id}`, "Nothing is due on this invoice", "err");
  const { createPaymentLink } = await import("@/lib/stripe");
  const { baseUrl } = await import("@/lib/public-link");
  const { customerEmail } = await import("@/lib/billing");
  try {
    const link = await createPaymentLink({ amount: row.outstanding, currency: s.currency, description: `Invoice ${row.number} · ${s.shop_name}`, saleId: id, email: (await customerEmail(row)) || undefined, baseUrl: await baseUrl() });
    await q("UPDATE sales SET pay_link=$2, pay_link_ref=$3 WHERE id=$1", [id, link.url, link.id]);
  } catch (e: any) {
    goTo(`/sales/${id}`, e?.message ?? "Could not create the payment link", "err");
  }
  await log(user.id, "Payment link created", row.number, `/sales/${id}`);
  goTo(`/sales/${id}`, "Payment link created. Share it by WhatsApp or email.");
}

export async function setDueDate(fd: FormData) {
  await requireUser("sales.payments");
  const id = Number(fd.get("id"));
  await q("UPDATE sales SET due_date=$2 WHERE id=$1", [id, str(fd, "due_date") || null]);
  revalidatePath(`/sales/${id}`);
}

export async function saveRecurring(fd: FormData) {
  const user = await requireUser("sales.payments");
  const cid = Number(str(fd, "customer_id"));
  const lines = str(fd, "lines").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0])
    .map(([description, qty, price]) => ({ description, qty: Number(qty) || 1, price: Number(String(price ?? "").replace(/,/g, "")) || 0 }));
  if (!cid || !lines.length || !str(fd, "next_date")) goTo("/sales/recurring", "Choose the customer, first date and at least one line", "err");
  const every = ["week", "month", "quarter", "year"].includes(str(fd, "every")) ? str(fd, "every") : "month";
  await q("INSERT INTO recurring_invoices (name, customer_id, lines, every, next_date, end_date, due_days, auto_email, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [str(fd, "name") || "Recurring invoice", cid, JSON.stringify(lines), every, str(fd, "next_date"), str(fd, "end_date") || null, Math.max(0, Math.round(numf(fd, "due_days"))) || 7, str(fd, "auto_email") === "on", user.id]);
  await log(user.id, "Recurring invoice set up", str(fd, "name"), "/sales/recurring");
  goTo("/sales/recurring", "Saved. Invoices are created automatically every day at 6 am.");
}

export async function toggleRecurring(fd: FormData) {
  await requireUser("sales.payments");
  await q("UPDATE recurring_invoices SET active = NOT active WHERE id=$1", [Number(fd.get("id"))]);
  revalidatePath("/sales/recurring");
}

export async function runRecurringNow(fd: FormData) {
  const user = await requireUser("sales.payments");
  const { runRecurring } = await import("@/lib/billing");
  const { baseUrl } = await import("@/lib/public-link");
  const only = Number(fd.get("id")) || undefined;
  let n = 0;
  try { n = await runRecurring(await baseUrl(), user.id, only); } catch (e: any) { goTo("/sales/recurring", e?.message ?? "Failed", "err"); }
  goTo("/sales/recurring", `${n} invoice(s) created`);
}
