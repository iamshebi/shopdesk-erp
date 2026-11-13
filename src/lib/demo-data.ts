import "server-only";
import { tx } from "./db";
import { moveQty } from "./inventory";

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

/** Adds the sample products, customers and suppliers. Safe to run twice (skips what already exists). */
export async function loadDemoData(userId: number) {
  let added = 0;
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
    for (const s of SUPPLIERS) {
      if ((await t("SELECT 1 FROM suppliers WHERE name=$1", [s.name])).length) continue;
      await t("INSERT INTO suppliers (name, phone, email, address) VALUES ($1,$2,$3,$4)", [s.name, s.phone, s.email, s.address]);
      added++;
    }
  });
  return added;
}
