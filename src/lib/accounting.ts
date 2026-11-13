import "server-only";
import { tx, type Exec } from "./db";
import { r2 } from "./util";

// Double-entry bookkeeping. Every sale, refund, payment, purchase, supplier payment, expense, used-device
// purchase and stock adjustment is posted automatically from the document itself (source = "<kind>:<id>").
// ensureLedger() posts whatever is missing, so the books always match the documents.

export const ACCOUNT_TYPES = [
  { id: "asset", label: "Asset" }, { id: "liability", label: "Liability" }, { id: "equity", label: "Equity" },
  { id: "income", label: "Income" }, { id: "expense", label: "Expense" },
] as const;

const DEFAULT_ACCOUNTS: [string, string, string, string, boolean?][] = [
  ["1000", "Cash in hand", "asset", "cash"],
  ["1010", "Card payments (to be settled)", "asset", "card", true],
  ["1020", "Bank account", "asset", "bank", true],
  ["1030", "Tabby receivable", "asset", "tabby"],
  ["1040", "Tamara receivable", "asset", "tamara"],
  ["1100", "Accounts receivable (customers)", "asset", "ar"],
  ["1200", "Inventory", "asset", "inventory"],
  ["1300", "VAT recoverable (input)", "asset", "vat_in"],
  ["2000", "Accounts payable (suppliers)", "liability", "ap"],
  ["2100", "VAT payable (output)", "liability", "vat_out"],
  ["3000", "Owner's capital", "equity", "capital"],
  ["3100", "Retained earnings", "equity", "retained"],
  ["4000", "Sales", "income", "sales"],
  ["4100", "Sales returns", "income", "returns"],
  ["4900", "Other income", "income", "other_income"],
  ["5000", "Cost of goods sold", "expense", "cogs"],
  ["5100", "Stock losses and adjustments", "expense", "stock_adj"],
  ["6000", "General expenses", "expense", "exp_general"],
];

export async function ensureAccounts(t: Exec) {
  const [n] = await t<{ n: number }>("SELECT count(*)::int n FROM accounts");
  if (n.n) return;
  for (const [code, name, type, key, bank] of DEFAULT_ACCOUNTS) {
    await t("INSERT INTO accounts (code, name, type, system_key, is_bank) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING", [code, name, type, key, !!bank]);
  }
}

async function accountMap(t: Exec) {
  const rows = await t<{ id: number; system_key: string }>("SELECT id, system_key FROM accounts WHERE system_key <> ''");
  return Object.fromEntries(rows.map((r) => [r.system_key, r.id])) as Record<string, number>;
}

const METHOD_KEY: Record<string, string> = { cash: "cash", card: "card", bank: "bank", tabby: "tabby", tamara: "tamara" };

async function expenseAccount(t: Exec, category: string) {
  const name = (category || "General").trim();
  const [a] = await t<{ id: number }>("SELECT id FROM accounts WHERE type='expense' AND lower(name)=lower($1) AND code LIKE '6%' LIMIT 1", [name]);
  if (a) return a.id;
  if (name.toLowerCase() === "general") return (await accountMap(t)).exp_general;
  const [{ next }] = await t<{ next: number }>("SELECT COALESCE(max(code::int), 6000) + 10 AS next FROM accounts WHERE code ~ '^6[0-9]{3}$'");
  const [made] = await t<{ id: number }>("INSERT INTO accounts (code, name, type) VALUES ($1,$2,'expense') RETURNING id", [String(next), name]);
  return made.id;
}

type Line = [number, number, number, string?]; // account, debit, credit, memo

async function post(t: Exec, date: string, number: string, source: string, memo: string, lines: Line[]) {
  const clean = lines.map(([a, d, c, m]) => [a, r2(d), r2(c), m ?? ""] as const).filter(([, d, c]) => d > 0.004 || c > 0.004);
  if (!clean.length) return;
  const dr = r2(clean.reduce((x, l) => x + l[1], 0)), cr = r2(clean.reduce((x, l) => x + l[2], 0));
  if (Math.abs(dr - cr) > 0.011) throw new Error(`Unbalanced entry ${source}: ${dr} vs ${cr}`);
  const [e] = await t<{ id: number }>("INSERT INTO journal_entries (date, number, source, memo) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id", [date, number, source, memo]);
  if (!e) return;
  for (const [a, d, c, m] of clean) await t("INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo) VALUES ($1,$2,$3,$4,$5)", [e.id, a, d, c, m]);
}

const DUBAI = (col: string) => `to_char((${col} AT TIME ZONE 'Asia/Dubai')::date, 'YYYY-MM-DD')`;
const missing = (kind: string, alias: string) => `NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = '${kind}:' || ${alias}.id)`;

let running: Promise<number> | null = null;

/** Posts every document that has no journal entry yet, and removes entries whose document was deleted. */
export function ensureLedger(): Promise<number> {
  if (!running) running = sync().finally(() => (running = null));
  return running;
}

async function sync(): Promise<number> {
  return tx(async (t) => {
    await ensureAccounts(t);
    const A = await accountMap(t);
    let n = 0;
    await t("DELETE FROM journal_entries WHERE source LIKE 'expense:%' AND NOT EXISTS (SELECT 1 FROM expenses e WHERE 'expense:' || e.id = journal_entries.source)");

    // Invoices and credit notes
    for (const s of await t<any>(`SELECT s.*, ${DUBAI("s.date")} d FROM sales s WHERE ${missing("sale", "s")} ORDER BY s.id`)) {
      const net = r2(Number(s.total) - Number(s.vat));
      if (s.type === "credit_note") {
        await post(t, s.d, s.number, `sale:${s.id}`, `Credit note ${s.number}${s.customer_name ? " · " + s.customer_name : ""}`, [
          [A.returns, net, 0], [A.vat_out, Number(s.vat), 0], [A.ar, 0, Number(s.total)], [A.inventory, Number(s.cost), 0], [A.cogs, 0, Number(s.cost)],
        ]);
      } else {
        await post(t, s.d, s.number, `sale:${s.id}`, `Invoice ${s.number}${s.customer_name ? " · " + s.customer_name : ""}`, [
          [A.ar, Number(s.total), 0], [A.sales, 0, net], [A.vat_out, 0, Number(s.vat)], [A.cogs, Number(s.cost), 0], [A.inventory, 0, Number(s.cost)],
        ]);
      }
      n++;
    }
    // Money received from customers (or paid back to them on a credit note)
    for (const p of await t<any>(`SELECT p.*, s.type, s.number, ${DUBAI("p.created_at")} d FROM payments p JOIN sales s ON s.id=p.sale_id WHERE ${missing("payment", "p")} ORDER BY p.id`)) {
      const acc = A[METHOD_KEY[p.method] ?? "bank"];
      const amt = Number(p.amount);
      const lines: Line[] = p.type === "credit_note" ? [[A.ar, amt, 0], [acc, 0, amt]] : [[acc, amt, 0], [A.ar, 0, amt]];
      await post(t, p.d, p.number, `payment:${p.id}`, `${p.type === "credit_note" ? "Refund" : "Payment"} ${p.number} (${p.method})`, lines);
      n++;
    }
    // Purchases and supplier payments
    for (const p of await t<any>(`SELECT p.*, to_char(p.date,'YYYY-MM-DD') d, s.name sup FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${missing("purchase", "p")} ORDER BY p.id`)) {
      await post(t, p.d, p.number, `purchase:${p.id}`, `Purchase ${p.number}${p.sup ? " · " + p.sup : ""}`, [[A.inventory, Number(p.subtotal), 0], [A.vat_in, Number(p.vat), 0], [A.ap, 0, Number(p.total)]]);
      n++;
    }
    for (const p of await t<any>(`SELECT sp.*, pu.number, ${DUBAI("sp.created_at")} d FROM supplier_payments sp JOIN purchases pu ON pu.id=sp.purchase_id WHERE ${missing("sp", "sp")} ORDER BY sp.id`)) {
      await post(t, p.d, p.number, `sp:${p.id}`, `Supplier payment ${p.number} (${p.method})`, [[A.ap, Number(p.amount), 0], [A[METHOD_KEY[p.method] ?? "bank"], 0, Number(p.amount)]]);
      n++;
    }
    // Expenses
    for (const e of await t<any>(`SELECT e.*, to_char(e.date,'YYYY-MM-DD') d FROM expenses e WHERE ${missing("expense", "e")} ORDER BY e.id`)) {
      const acc = await expenseAccount(t, e.category);
      await post(t, e.d, `EXP-${e.id}`, `expense:${e.id}`, `${e.category}: ${e.description}`, [[acc, Number(e.amount), 0], [A.vat_in, Number(e.vat), 0], [A[METHOD_KEY[e.method] ?? "cash"], 0, Number(e.total)]]);
      n++;
    }
    // Used devices bought from customers
    for (const b of await t<any>(`SELECT b.*, ${DUBAI("b.created_at")} d FROM buybacks b WHERE ${missing("buyback", "b")} ORDER BY b.id`)) {
      await post(t, b.d, b.number, `buyback:${b.id}`, `Bought used device ${b.number}`, [[A.inventory, Number(b.price_paid), 0], [A[METHOD_KEY[b.payment_method] ?? "cash"], 0, Number(b.price_paid)]]);
      n++;
    }
    // Stock adjustments (damaged, lost, found, counts, corrections) at cost
    for (const m of await t<any>(
      `SELECT m.*, ${DUBAI("m.created_at")} d, COALESCE(u.cost, p.cost) unit_cost, p.name FROM stock_moves m JOIN products p ON p.id=m.product_id LEFT JOIN units u ON u.id=m.unit_id
       WHERE m.type IN ('adjust','damaged','lost','found','writeoff','count','supplier_return') AND ${missing("move", "m")} ORDER BY m.id`,
    )) {
      const value = r2(Math.abs(m.qty) * Number(m.unit_cost));
      const lines: Line[] = m.qty < 0 ? [[A.stock_adj, value, 0], [A.inventory, 0, value]] : [[A.inventory, value, 0], [A.stock_adj, 0, value]];
      await post(t, m.d, m.ref || `MOVE-${m.id}`, `move:${m.id}`, `Stock ${m.type}: ${m.name} (${m.qty > 0 ? "+" : ""}${m.qty})`, lines);
      n++;
    }
    return n;
  });
}

/** Signed balance as shown in reports: assets/expenses debit-positive, others credit-positive. */
export const BAL_SQL = (type: string) => `CASE WHEN ${type} IN ('asset','expense') THEN sum(l.debit - l.credit) ELSE sum(l.credit - l.debit) END`;
