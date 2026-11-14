import "server-only";
import { q, one } from "./db";
import { getSettings } from "./settings";
import { STOCK_SQL } from "./stock";
import { OUTSTANDING_SQL } from "./sales";
import { sendEmail, esc } from "./email";
import { fireWebhook } from "./webhooks";
import { num } from "./util";

export const TRIGGERS = [
  { id: "low_stock", label: "Product stock at or below its reorder level", unit: "", hint: "uses each product's reorder level (or this number if the product has none)" },
  { id: "invoice_overdue", label: "Invoice unpaid for more than N days", unit: "days" },
  { id: "lead_stale", label: "Open lead not updated for N days", unit: "days" },
  { id: "followup_due", label: "Follow-up reminder is due today", unit: "" },
  { id: "ticket_waiting", label: "Support ticket open for more than N hours", unit: "hours" },
  { id: "quote_expiring", label: "Quotation expires within N days", unit: "days" },
  { id: "order_late", label: "Order past its expected date and not shipped", unit: "" },
] as const;
export const ACTIONS = [
  { id: "task", label: "Create a task for…" },
  { id: "email", label: "Send an email to…" },
  { id: "notify", label: "Show an in-app notification to…" },
  { id: "webhook", label: "Send a webhook event" },
] as const;

type Hit = { key: string; title: string; link: string };

async function findHits(trigger: string, n: number): Promise<Hit[]> {
  const week = Math.floor(Date.now() / (7 * 864e5));
  switch (trigger) {
    case "low_stock":
      return (await q<any>(`SELECT * FROM (SELECT p.id, p.name, p.reorder_level, ${STOCK_SQL} stock FROM products p WHERE p.active AND p.status='active' AND NOT p.is_service) x
        WHERE stock IS NOT NULL AND stock <= CASE WHEN reorder_level > 0 THEN reorder_level ELSE $1 END`, [n]))
        .map((r) => ({ key: `p${r.id}w${week}`, title: `Low stock: ${r.name} (${r.stock} left)`, link: `/products/${r.id}` }));
    case "invoice_overdue":
      return (await q<any>(`SELECT s.id, s.number, s.customer_name, ${OUTSTANDING_SQL} o FROM sales s WHERE s.type='invoice' AND ${OUTSTANDING_SQL} > 0.004 AND s.date < now() - make_interval(days => $1::int)`, [n]))
        .map((r) => ({ key: `s${r.id}`, title: `Chase payment: ${r.number} ${r.customer_name} owes ${num(r.o)}`, link: `/sales/${r.id}` }));
    case "lead_stale":
      return (await q<any>(`SELECT id, name FROM leads WHERE stage NOT IN ('won','lost') AND updated_at < now() - make_interval(days => $1::int)`, [n]))
        .map((r) => ({ key: `l${r.id}w${week}`, title: `Follow up lead: ${r.name}`, link: `/crm/leads/${r.id}` }));
    case "followup_due":
      return (await q<any>(`SELECT a.id, a.body, COALESCE(c.name, l.name) who, a.customer_id, a.lead_id FROM crm_activities a LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN leads l ON l.id=a.lead_id
        WHERE a.type='followup' AND NOT a.done AND a.due_date <= (now() AT TIME ZONE 'Asia/Dubai')::date`))
        .map((r) => ({ key: `a${r.id}`, title: `Follow up ${r.who ?? ""}: ${r.body}`, link: r.customer_id ? `/customers/${r.customer_id}` : `/crm/leads/${r.lead_id}` }));
    case "ticket_waiting":
      return (await q<any>(`SELECT id, number, subject FROM tickets WHERE status='open' AND created_at < now() - make_interval(hours => $1::int)`, [n]))
        .map((r) => ({ key: `t${r.id}`, title: `Ticket waiting: ${r.number} ${r.subject}`, link: `/support/${r.id}` }));
    case "quote_expiring":
      return (await q<any>(`SELECT id, number, customer_name FROM orders WHERE kind='quote' AND status IN ('draft','sent') AND valid_until BETWEEN (now() AT TIME ZONE 'Asia/Dubai')::date AND (now() AT TIME ZONE 'Asia/Dubai')::date + $1::int`, [n]))
        .map((r) => ({ key: `q${r.id}`, title: `Quotation ${r.number} for ${r.customer_name} expires soon`, link: `/orders/${r.id}` }));
    case "order_late":
      return (await q<any>(`SELECT id, number, customer_name FROM orders WHERE kind='order' AND status IN ('draft','confirmed','packed') AND expected_date < (now() AT TIME ZONE 'Asia/Dubai')::date`))
        .map((r) => ({ key: `o${r.id}`, title: `Late order ${r.number} (${r.customer_name})`, link: `/orders/${r.id}` }));
  }
  return [];
}

/** Runs every active rule once; each hit is acted on only once (deduplicated in automation_log). */
export async function runAutomations(base: string, onlyId?: number) {
  const rules = await q<any>(`SELECT * FROM automation_rules WHERE active ${onlyId ? "AND id=$1" : ""}`, onlyId ? [onlyId] : []);
  const s = await getSettings();
  let total = 0;
  for (const r of rules) {
    const hits = await findHits(r.trigger, Number(r.threshold));
    const fresh: Hit[] = [];
    for (const h of hits) {
      const ins = await one("INSERT INTO automation_log (rule_id, dedupe_key, message) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", [r.id, h.key, h.title]);
      if (ins) fresh.push(h);
    }
    if (fresh.length) {
      if (r.action === "task") {
        for (const h of fresh) await q("INSERT INTO tasks (title, assignee_id, link, priority, description) VALUES ($1,$2,$3,'normal',$4)", [h.title.slice(0, 200), r.assignee_id, h.link, `Created by automation “${r.name}”`]);
      } else if (r.action === "email" && r.email) {
        await sendEmail(r.email, `${s.shop_name}: ${r.name} (${fresh.length})`, `<h3>${esc(r.name)}</h3><ul>${fresh.map((h) => `<li><a href="${base}${h.link}">${esc(h.title)}</a></li>`).join("")}</ul>`);
      } else if (r.action === "notify") {
        const { notify, notifyPerm } = await import("./notify");
        for (const h of fresh) { if (r.assignee_id) await notify(r.assignee_id, h.title, h.link, "alert"); else await notifyPerm(["settings"], h.title, h.link, "alert"); }
      } else if (r.action === "webhook") {
        await fireWebhook(r.trigger === "low_stock" ? "stock.low" : `automation.${r.trigger}`, { rule: r.name, items: fresh });
      }
    }
    await q("UPDATE automation_rules SET last_run_at=now() WHERE id=$1", [r.id]);
    total += fresh.length;
  }
  return total;
}

export async function dailySummaryEmail(base: string) {
  const s = await getSettings();
  if (!s.daily_report_email) return false;
  const y = await one<any>(`SELECT COALESCE(sum(CASE WHEN type='invoice' THEN total ELSE -total END),0) sales, COALESCE(sum(CASE WHEN type='invoice' THEN total-vat-cost ELSE 0 END),0) gp, count(*) FILTER (WHERE type='invoice')::int n
    FROM sales WHERE (date AT TIME ZONE 'Asia/Dubai')::date = (now() AT TIME ZONE 'Asia/Dubai')::date - 1`);
  const due = await one<any>(`SELECT COALESCE(sum(${OUTSTANDING_SQL}),0) d FROM sales s WHERE s.type='invoice'`);
  const low = await one<any>(`SELECT count(*)::int n FROM (SELECT p.reorder_level, ${STOCK_SQL} stock FROM products p WHERE p.active AND NOT p.is_service) x WHERE stock IS NOT NULL AND stock <= GREATEST(reorder_level, 0)`);
  const orders = await one<any>(`SELECT count(*)::int n FROM orders WHERE kind='order' AND status IN ('draft','confirmed','packed')`);
  const tickets = await one<any>(`SELECT count(*)::int n FROM tickets WHERE status IN ('open','pending')`);
  const row = (l: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${l}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1e293b"><h2>${esc(s.shop_name)}: yesterday</h2><table>
    ${row("Sales", `${s.currency} ${num(y.sales)} (${y.n} invoices)`)}${row("Gross profit", `${s.currency} ${num(y.gp)}`)}${row("Customers owe", `${s.currency} ${num(due.d)}`)}
    ${row("Orders to fulfil", String(orders.n))}${row("Open tickets", String(tickets.n))}${row("Products at or below reorder level", String(low.n))}</table>
    <p><a href="${base}">Open ShopDesk</a></p></div>`;
  return (await sendEmail(s.daily_report_email, `${s.shop_name} daily summary`, html)).ok;
}
