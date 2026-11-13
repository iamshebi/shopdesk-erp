import "server-only";
import { moveQty, moveUnit } from "./inventory";
import { Exec, nextNumber } from "./db";
import { ShopSettings } from "./settings";
import { lineVat, r2 } from "./util";

export interface SaleLineInput {
  product_id: number | null; // null = free-text line (e.g. repair service)
  unit_id?: number | null;
  description?: string;
  qty: number;
  unit_price: number; // as typed by the cashier (VAT-inclusive if the shop prices that way)
  discount?: number; // amount off this line
  cost?: number; // only used for free-text lines (e.g. parts cost on a repair)
}

export interface SaleInput {
  customer: { id?: number | null; name: string; phone: string; trn: string; address: string };
  lines: SaleLineInput[];
  payments: { method: string; amount: number; reference?: string }[];
  notes?: string;
  repair_id?: number | null;
  userId: number;
}

export class SaleError extends Error {}

/** SQL for what a customer still owes on an invoice (after part payments and credit notes). */
export const OUTSTANDING_SQL = `(s.total - s.paid - COALESCE((SELECT sum(c.total - c.paid) FROM sales c WHERE c.ref_sale_id = s.id AND c.type = 'credit_note'), 0))`;

async function upsertCustomer(t: Exec, c: SaleInput["customer"]): Promise<number | null> {
  if (c.id) {
    if (c.trn || c.address) await t("UPDATE customers SET trn = COALESCE(NULLIF($2,''), trn), address = COALESCE(NULLIF($3,''), address) WHERE id=$1", [c.id, c.trn, c.address]);
    return c.id;
  }
  if (!c.name && !c.phone) return null;
  if (c.phone) {
    const found = await t<{ id: number }>("SELECT id FROM customers WHERE phone = $1 LIMIT 1", [c.phone]);
    if (found[0]) return found[0].id;
  }
  const [row] = await t<{ id: number }>("INSERT INTO customers (name, phone, trn, address) VALUES ($1,$2,$3,$4) RETURNING id", [
    c.name || c.phone,
    c.phone,
    c.trn,
    c.address,
  ]);
  return row.id;
}

/** Creates an invoice inside an open transaction. Returns the new sale id. */
export async function createSale(t: Exec, s: ShopSettings, input: SaleInput): Promise<number> {
  if (!input.lines.length) throw new SaleError("The cart is empty");
  const usedUnits = new Set<number>();
  const computed: any[] = [];

  for (const l of input.lines) {
    const qty = Math.round(l.qty);
    if (qty <= 0) throw new SaleError("Quantity must be at least 1");
    const gross = r2(qty * l.unit_price - (l.discount ?? 0));
    if (gross < 0) throw new SaleError("Discount is bigger than the line amount");
    let description = l.description ?? "";
    let cost = l.cost ?? 0;
    let margin = false;
    let imei = "";
    let unitId: number | null = null;

    if (l.product_id) {
      const [p] = await t<any>("SELECT id, name, cost, track_serial, is_service FROM products WHERE id=$1", [l.product_id]);
      if (!p) throw new SaleError("A product in the cart no longer exists");
      description = description || p.name;
      if (p.track_serial) {
        if (!l.unit_id) throw new SaleError(`Choose the IMEI for ${p.name}`);
        if (qty !== 1) throw new SaleError("IMEI items are sold one per line");
        if (usedUnits.has(l.unit_id)) throw new SaleError("The same IMEI is in the cart twice");
        // Lock the unit row so two tills can't sell the same phone.
        const [u] = await t<any>("SELECT id, imei, cost, margin_scheme, status FROM units WHERE id=$1 AND product_id=$2 FOR UPDATE", [l.unit_id, p.id]);
        if (!u || u.status !== "in_stock") throw new SaleError(`IMEI ${u?.imei ?? ""} is not in stock any more`);
        usedUnits.add(u.id);
        unitId = u.id;
        imei = u.imei;
        cost = u.cost;
        margin = u.margin_scheme;
      } else {
        cost = p.is_service ? 0 : r2(p.cost * qty);
      }
    }

    const v = lineVat({
      amount: gross,
      rate: s.vat_rate,
      pricesIncludeVat: s.prices_include_vat,
      registered: s.vat_registered,
      marginScheme: margin,
      cost,
    });
    computed.push({ ...l, qty, description, cost, margin, imei, unitId, ...v, discount: r2(l.discount ?? 0) });
  }

  const subtotal = r2(computed.reduce((a, c) => a + c.net, 0));
  const vat = r2(computed.reduce((a, c) => a + c.vat, 0));
  const total = r2(computed.reduce((a, c) => a + c.total, 0));
  const discount = r2(computed.reduce((a, c) => a + c.discount, 0));
  const cost = r2(computed.reduce((a, c) => a + c.cost, 0));

  const pays = input.payments.filter((p) => p.amount > 0 && p.method !== "credit");
  let paid = r2(pays.reduce((a, p) => a + p.amount, 0));
  if (paid > total) {
    // Extra cash is change given back: trim the cash payment.
    let extra = r2(paid - total);
    for (const p of pays) {
      if (p.method === "cash" && extra > 0) {
        const cut = Math.min(p.amount, extra);
        p.amount = r2(p.amount - cut);
        extra = r2(extra - cut);
      }
    }
    if (extra > 0) throw new SaleError("Card / Tabby / Tamara payments are more than the total");
    paid = total;
  }
  if (paid < total && !input.customer.name && !input.customer.phone && !input.customer.id) {
    throw new SaleError("Add the customer's name and phone for a sale on credit");
  }
  if (input.customer.trn && total > 10000 && !input.customer.address) {
    throw new SaleError("For a VAT-registered customer over AED 10,000, add their name and address for a full tax invoice");
  }

  const customerId = await upsertCustomer(t, input.customer);
  if (customerId && paid < total) {
    const [c] = await t<{ credit_limit: number; name: string; owes: number }>(
      `SELECT c.credit_limit, c.name, COALESCE((SELECT sum(${OUTSTANDING_SQL}) FROM sales s WHERE s.customer_id=c.id AND s.type='invoice'),0) owes FROM customers c WHERE c.id=$1`,
      [customerId],
    );
    if (c && Number(c.credit_limit) > 0 && Number(c.owes) + (total - paid) > Number(c.credit_limit) + 0.004) {
      throw new SaleError(`${c.name} would owe ${r2(Number(c.owes) + total - paid).toFixed(2)}, over their credit limit of ${Number(c.credit_limit).toFixed(2)}. Take more payment now.`);
    }
  }
  const number = await nextNumber(t, "invoice", s.invoice_prefix || "INV-");
  const [sale] = await t<{ id: number }>(
    `INSERT INTO sales (number, type, customer_id, customer_name, customer_phone, customer_trn, customer_address, subtotal, discount, vat, total, cost, paid, notes, repair_id, created_by)
     VALUES ($1,'invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [number, customerId, input.customer.name, input.customer.phone, input.customer.trn, input.customer.address, subtotal, discount, vat, total, cost, paid, input.notes ?? "", input.repair_id ?? null, input.userId],
  );

  for (const c of computed) {
    await t(
      `INSERT INTO sale_items (sale_id, product_id, unit_id, description, imei, qty, unit_price, discount, net, vat, total, cost, margin_scheme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [sale.id, c.product_id, c.unitId, c.description, c.imei, c.qty, c.unit_price, c.discount, c.net, c.vat, c.total, c.cost, c.margin],
    );
    if (c.unitId) {
      await t("UPDATE units SET status='sold', sale_id=$1 WHERE id=$2", [sale.id, c.unitId]);
      await moveUnit(t, { unitId: c.unitId, productId: c.product_id!, qty: -1, type: "sale", ref: number, userId: input.userId });
    } else if (c.product_id) {
      await moveQty(t, { productId: c.product_id, qty: -c.qty, type: "sale", ref: number, userId: input.userId });
    }
  }
  for (const p of pays) {
    if (p.amount > 0) {
      await t("INSERT INTO payments (sale_id, method, amount, reference, created_by) VALUES ($1,$2,$3,$4,$5)", [sale.id, p.method, p.amount, p.reference ?? "", input.userId]);
    }
  }
  return sale.id;
}

/** Credit note for returned items. lines: original sale_item id + qty being returned. */
export async function createReturn(
  t: Exec,
  s: ShopSettings,
  saleId: number,
  lines: { item_id: number; qty: number }[],
  refund: { method: string; reason: string },
  userId: number,
): Promise<number> {
  const [orig] = await t<any>("SELECT * FROM sales WHERE id=$1 AND type='invoice' FOR UPDATE", [saleId]);
  if (!orig) throw new SaleError("Invoice not found");
  const items = await t<any>(
    `SELECT si.*, si.qty - COALESCE((SELECT sum(r.qty) FROM sale_items r JOIN sales c ON c.id = r.sale_id
        WHERE c.type='credit_note' AND r.ref_item_id = si.id), 0)::int AS returnable,
       p.track_serial, p.is_service
     FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id=$1`,
    [saleId],
  );
  const picked = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const it = items.find((i: any) => i.id === l.item_id);
      if (!it) throw new SaleError("Item not on this invoice");
      if (l.qty > it.returnable) throw new SaleError(`Only ${it.returnable} of “${it.description}” can still be returned`);
      const f = l.qty / it.qty;
      return { it, qty: l.qty, net: r2(it.net * f), vat: r2(it.vat * f), total: r2(it.total * f), cost: r2(it.cost * f) };
    });
  if (!picked.length) throw new SaleError("Choose at least one item to return");

  const subtotal = r2(picked.reduce((a, p) => a + p.net, 0));
  const vat = r2(picked.reduce((a, p) => a + p.vat, 0));
  const total = r2(picked.reduce((a, p) => a + p.total, 0));
  const cost = r2(picked.reduce((a, p) => a + p.cost, 0));
  // Refund in money, or reduce what the customer still owes on the invoice.
  const [{ outstanding }] = await t<{ outstanding: number }>(`SELECT ${OUTSTANDING_SQL} AS outstanding FROM sales s WHERE s.id=$1`, [saleId]);
  const applied = refund.method === "credit" ? Math.min(total, Math.max(0, outstanding)) : 0;
  if (refund.method === "credit" && applied < total) throw new SaleError(`Only ${outstanding.toFixed(2)} is outstanding on this invoice — refund the rest in cash/card`);
  const refunded = r2(total - applied);

  const number = await nextNumber(t, "credit_note", "CN-");
  const [cn] = await t<{ id: number }>(
    `INSERT INTO sales (number, type, ref_sale_id, customer_id, customer_name, customer_phone, customer_trn, customer_address, subtotal, vat, total, cost, paid, notes, created_by)
     VALUES ($1,'credit_note',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [number, saleId, orig.customer_id, orig.customer_name, orig.customer_phone, orig.customer_trn, orig.customer_address, subtotal, vat, total, cost, refunded, refund.reason, userId],
  );
  for (const p of picked) {
    await t(
      `INSERT INTO sale_items (sale_id, product_id, unit_id, ref_item_id, description, imei, qty, unit_price, discount, net, vat, total, cost, margin_scheme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13)`,
      [cn.id, p.it.product_id, p.it.unit_id, p.it.id, p.it.description, p.it.imei, p.qty, p.it.unit_price, p.net, p.vat, p.total, p.cost, p.it.margin_scheme],
    );
    if (p.it.unit_id) {
      await t("UPDATE units SET status='in_stock', sale_id=NULL, notes='Returned on ' || $2 WHERE id=$1", [p.it.unit_id, number]);
      await moveUnit(t, { unitId: p.it.unit_id, productId: p.it.product_id, qty: 1, type: "return", ref: number, userId });
    } else if (p.it.product_id && !p.it.is_service) {
      await moveQty(t, { productId: p.it.product_id, qty: p.qty, type: "return", ref: number, userId });
    }
  }
  if (refunded > 0) {
    await t("INSERT INTO payments (sale_id, method, amount, created_by) VALUES ($1,$2,$3,$4)", [cn.id, refund.method, refunded, userId]);
  }
  void s;
  return cn.id;
}
