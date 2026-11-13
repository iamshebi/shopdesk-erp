import "server-only";
import { tx } from "./db";
import { moveQty } from "./inventory";
import { getSettings } from "./settings";
import { priceLines, addEvent } from "./orders";
import { nextNumber } from "./db";

// Fictional sample data from the "Zaitoon ERP Interactive Demo" package, for trying the system.
// Replace with real data later (Settings > Start fresh, then import).

const PRODUCTS = [
  { sku: "ZAI-OLV-001", name: "Extra Virgin Olive Oil 500ml", category: "Olive Oil", brand: "Zaitoon", price: 42.5, cost: 25, stock: 84, reorder: 20, status: "active" },
  { sku: "ZAI-DAT-002", name: "Premium Ajwa Dates 1kg", category: "Dates", brand: "Zaitoon", price: 68, cost: 39, stock: 12, reorder: 15, status: "active" },
  { sku: "ZAI-HON-003", name: "Sidr Honey 250g", category: "Honey", brand: "Zaitoon", price: 95, cost: 58, stock: 31, reorder: 10, status: "active" },
  { sku: "ZAI-SPC-004", name: "Arabic Coffee Blend 250g", category: "Coffee", brand: "Zaitoon", price: 29, cost: 14, stock: 0, reorder: 12, status: "active" },
  { sku: "ZAI-OLV-005", name: "Olive Oil Gift Set", category: "Gift Sets", brand: "Zaitoon", price: 129, cost: 72, stock: 18, reorder: 8, status: "draft" },
];
const CUSTOMERS = [
  { name: "Al Noor Grocery", email: "orders@alnoor.example", phone: "+971501112233", address: "Ras Al Khaimah" },
  { name: "Mariam Hassan", email: "mariam@example.com", phone: "+971551234567", address: "Dubai" },
  { name: "Green Basket Market", email: "buying@greenbasket.example", phone: "+971502223344", address: "Sharjah" },
];
const SUPPLIERS = [
  { name: "Emirates Food Trading", email: "sales@eft.example", phone: "+97142600100", address: "Dubai · Payment terms: 30 days" },
  { name: "Date Palm Farms", email: "orders@datepalm.example", phone: "+97172200100", address: "Al Ain · Payment terms: COD" },
];

const ORDERS = [
  { ref: "ORD-3001", phone: "+971501112233", status: "confirmed", source: "phone", lines: [["ZAI-OLV-001", 12]] as [string, number][], delivery: 0, tracking: "", advance: 510, advanceMethod: "card" },
  { ref: "ORD-3002", phone: "+971551234567", status: "draft", source: "whatsapp", lines: [["ZAI-DAT-002", 1], ["ZAI-HON-003", 1]] as [string, number][], delivery: 0, tracking: "", advance: 0, advanceMethod: "cash" },
  { ref: "ORD-3003", phone: "+971502223344", status: "shipped", source: "website", lines: [["ZAI-OLV-005", 2], ["ZAI-HON-003", 3], ["ZAI-DAT-002", 4]] as [string, number][], delivery: 25, tracking: "DEMO-3003", advance: 400, advanceMethod: "bank" },
];

/** Adds the sample products, customers and suppliers. Safe to run twice (skips what already exists). */
export async function loadDemoData(userId: number) {
  let added = 0;
  const settings = await getSettings(); // read before the transaction (the embedded database allows one connection)
  await tx(async (t) => {
    for (const p of PRODUCTS) {
      if ((await t("SELECT 1 FROM products WHERE sku=$1", [p.sku])).length) continue;
      const [row] = await t<{ id: number }>(
        `INSERT INTO products (name, brand, category, sku, cost, price, reorder_level, status, tags, stock_qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'demo',0) RETURNING id`,
        [p.name, p.brand, p.category, p.sku, p.cost, p.price, p.reorder, p.status],
      );
      await moveQty(t, { productId: row.id, qty: p.stock, type: "opening", reason: "Demo data", userId });
      added++;
    }
    for (const c of CUSTOMERS) {
      if ((await t("SELECT 1 FROM customers WHERE phone=$1", [c.phone])).length) continue;
      await t("INSERT INTO customers (name, phone, email, address) VALUES ($1,$2,$3,$4)", [c.name, c.phone, c.email, c.address]);
      added++;
    }
    for (const sp of SUPPLIERS) {
      if ((await t("SELECT 1 FROM suppliers WHERE name=$1", [sp.name])).length) continue;
      await t("INSERT INTO suppliers (name, phone, email, address) VALUES ($1,$2,$3,$4)", [sp.name, sp.phone, sp.email, sp.address]);
      added++;
    }
    // Sample orders (the demo file has totals only, so the lines below are made up to match them).
    if (!(await t("SELECT 1 FROM orders WHERE notes LIKE 'Sample order%'")).length) {
      for (const o of ORDERS) {
        const [c] = await t<any>("SELECT * FROM customers WHERE phone=$1", [o.phone]);
        const lines = [] as { product_id: number; description: string; qty: number; unit_price: number; discount: number }[];
        for (const [sku, qty] of o.lines) {
          const [p] = await t<any>("SELECT id, name, price FROM products WHERE sku=$1", [sku]);
          if (p) lines.push({ product_id: p.id, description: `Zaitoon ${p.name}`, qty, unit_price: Number(p.price), discount: 0 });
        }
        const pr = priceLines(settings, lines, o.delivery);
        const number = await nextNumber(t, "order", "SO-");
        const [row] = await t<{ id: number }>(
          `INSERT INTO orders (number, kind, status, customer_id, customer_name, customer_phone, customer_email, customer_address, source, delivery_method, delivery_address,
             delivery_charge, courier, tracking_no, advance, advance_method, subtotal, discount, vat, total, notes, created_by)
           VALUES ($1,'order',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
          [number, o.status, c?.id ?? null, c?.name ?? "", o.phone, c?.email ?? "", c?.address ?? "", o.source, o.delivery ? "delivery" : "pickup", o.delivery ? c?.address ?? "" : "",
            o.delivery, o.delivery ? "Own driver" : "", o.tracking, o.advance, o.advanceMethod, pr.subtotal, pr.discount, pr.vat, pr.total, `Sample order (demo file ${o.ref})`, userId],
        );
        for (const l of pr.lines) {
          await t("INSERT INTO order_items (order_id, product_id, description, qty, unit_price, discount, net, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [row.id, l.product_id, l.description, l.qty, l.unit_price, l.discount, l.net, l.vat, l.total]);
        }
        await addEvent(t, row.id, o.status, `Sample order ${o.ref}`, userId);
        added++;
      }
    }
  });
  return added;
}
