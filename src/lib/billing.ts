import "server-only";
import { q, one, tx } from "./db";
import { getSettings } from "./settings";
import { OUTSTANDING_SQL, createSale } from "./sales";
import { sendEmail, esc } from "./email";
import { saleToken } from "./public-link";
import { num } from "./util";
import { fireWebhook } from "./webhooks";

export async function invoiceEmailHtml(saleId: number, base: string, reminder = false) {
  const s = await getSettings();
  const sale = await one<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1`, [saleId]);
  const link = `${base}/i/${await saleToken(saleId)}`;
  const intro = reminder
    ? `This is a friendly reminder that invoice <b>${esc(sale.number)}</b> has <b>${esc(s.currency)} ${num(sale.outstanding)}</b> still due${sale.due_date ? ` (due ${esc(String(sale.due_date).slice(0, 10))})` : ""}.`
    : `Thank you for your business. Your invoice <b>${esc(sale.number)}</b> for <b>${esc(s.currency)} ${num(sale.total)}</b> is ready.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1e293b">
    <h2 style="margin:0 0 12px">${esc(s.shop_name)}</h2><p>Hello ${esc(sale.customer_name || "there")},</p><p>${intro}</p>
    <p><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View invoice${sale.pay_link && sale.outstanding > 0.004 ? " &amp; pay online" : ""}</a></p>
    <p style="color:#64748b;font-size:13px">${esc(s.address)}<br>${esc(s.phone)}</p></div>`;
  return { sale, html, subject: `${reminder ? "Reminder: " : ""}Invoice ${sale.number} from ${s.shop_name}`, link };
}

export async function customerEmail(sale: any) {
  if (!sale.customer_id) return "";
  return (await one<{ email: string }>("SELECT email FROM customers WHERE id=$1", [sale.customer_id]))?.email ?? "";
}

/** Sends a reminder on every overdue invoice not reminded in the last N days (needs email set up). */
export async function autoReminders(base: string) {
  const s = await getSettings();
  if (!s.auto_reminders) return 0;
  const rows = await q<any>(
    `SELECT s.id FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.type='invoice' AND ${OUTSTANDING_SQL} > 0.004 AND c.email <> ''
       AND COALESCE(s.due_date, s.date::date + 7) < (now() AT TIME ZONE 'Asia/Dubai')::date
       AND (s.last_reminder_at IS NULL OR s.last_reminder_at < now() - make_interval(days => $1))`,
    [Math.max(1, s.reminder_every_days)],
  );
  let n = 0;
  for (const r of rows) {
    const { sale, html, subject } = await invoiceEmailHtml(r.id, base, true);
    const res = await sendEmail(await customerEmail(sale), subject, html);
    if (res.ok) { await q("UPDATE sales SET last_reminder_at=now() WHERE id=$1", [r.id]); n++; }
  }
  return n;
}

function addInterval(d: string, every: string) {
  const dt = new Date(d + "T00:00:00Z");
  if (every === "week") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (every === "quarter") dt.setUTCMonth(dt.getUTCMonth() + 3);
  else if (every === "year") dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  else dt.setUTCMonth(dt.getUTCMonth() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Creates the invoices of every recurring template that is due. */
export async function runRecurring(base: string, userId: number | null, onlyId?: number) {
  const s = await getSettings();
  const owner = userId ?? (await one<{ id: number }>("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.permissions LIKE '%\"*\"%' ORDER BY u.id LIMIT 1"))?.id ?? 1;
  const due = await q<any>(
    `SELECT r.*, to_char(r.next_date,'YYYY-MM-DD') nd, c.name, c.phone, c.trn, c.address, c.email FROM recurring_invoices r JOIN customers c ON c.id=r.customer_id
     WHERE r.active AND ${onlyId ? "r.id=$1" : "r.next_date <= (now() AT TIME ZONE 'Asia/Dubai')::date"}`,
    onlyId ? [onlyId] : [],
  );
  let made = 0;
  for (const r of due) {
    const lines = (r.lines as any[]).map((l) => ({ product_id: l.product_id ?? null, description: l.description, qty: Number(l.qty) || 1, unit_price: Number(l.price) || 0 }));
    if (!lines.length) continue;
    const next = addInterval(r.nd, r.every);
    const dueDate = new Date(Date.now() + r.due_days * 864e5).toISOString().slice(0, 10);
    const saleId = await tx(async (t) => {
      const id = await createSale(t, s, { customer: { id: r.customer_id, name: r.name, phone: r.phone, trn: r.trn, address: r.address }, lines, payments: [], notes: `Recurring: ${r.name}`, due_date: dueDate, userId: owner });
      await t("UPDATE recurring_invoices SET next_date=$2, runs=runs+1, last_sale_id=$3, active = ($4::date IS NULL OR $2::date <= $4::date) WHERE id=$1", [r.id, next, id, r.end_date]);
      return id;
    });
    made++;
    await fireWebhook("sale.created", { id: saleId, recurring: r.name });
    if (r.auto_email && r.email) {
      const { html, subject } = await invoiceEmailHtml(saleId, base);
      await sendEmail(r.email, subject, html);
    }
  }
  return made;
}
