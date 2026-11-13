import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser, can } from "@/lib/auth";
import { STOCK_SQL } from "@/lib/stock";

export const dynamic = "force-dynamic";

export interface SearchHit {
  group: string;
  title: string;
  sub: string;
  href: string;
}

// Global search (Ctrl+K). Only returns what the signed-in user is allowed to open.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });
  const term = (new URL(req.url).searchParams.get("q") || "").trim();
  if (term.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${term}%`;
  const hits: SearchHit[] = [];
  const jobs: Promise<void>[] = [];

  if (can(user, "products.view"))
    jobs.push(
      q<any>(
        `SELECT p.id, p.name, p.brand, p.sku, p.barcode, ${STOCK_SQL} stock FROM products p
         WHERE p.name ILIKE $1 OR p.brand ILIKE $1 OR p.sku ILIKE $1 OR p.barcode = $2 ORDER BY p.active DESC, p.name LIMIT 6`,
        [like, term],
      ).then((r) => r.forEach((p) => hits.push({ group: "Products", title: `${p.brand ? p.brand + " " : ""}${p.name}`, sub: [p.sku, p.stock === null ? "service" : `${p.stock} in stock`].filter(Boolean).join(" · "), href: `/products/${p.id}` }))),
    );
  if (can(user, "imei") && /^\d{6,}$/.test(term))
    jobs.push(
      q<any>(`SELECT u.imei, u.status, p.name FROM units u JOIN products p ON p.id=u.product_id WHERE u.imei LIKE $1 OR u.imei2 LIKE $1 LIMIT 5`, [`%${term}%`]).then((r) =>
        r.forEach((u) => hits.push({ group: "IMEI", title: u.imei, sub: `${u.name} · ${u.status.replace("_", " ")}`, href: `/imei?q=${u.imei}` })),
      ),
    );
  if (can(user, "customers"))
    jobs.push(
      q<any>(`SELECT id, name, phone FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY name LIMIT 5`, [like]).then((r) =>
        r.forEach((c) => hits.push({ group: "Customers", title: c.name || c.phone, sub: c.phone, href: `/customers/${c.id}` })),
      ),
    );
  if (can(user, "sales.view")) {
    const own = can(user, "sales.all") ? "" : ` AND created_by = ${Number(user.id)}`;
    jobs.push(
      q<any>(`SELECT id, number, type, customer_name, total FROM sales WHERE (number ILIKE $1 OR customer_name ILIKE $1 OR customer_phone ILIKE $1)${own} ORDER BY id DESC LIMIT 5`, [like]).then((r) =>
        r.forEach((s) => hits.push({ group: "Invoices", title: s.number, sub: `${s.type === "credit_note" ? "Credit note · " : ""}${s.customer_name || "Walk-in"} · AED ${Number(s.total).toFixed(2)}`, href: `/sales/${s.id}` })),
      ),
    );
  }
  if (can(user, "repairs"))
    jobs.push(
      q<any>(`SELECT id, number, device, customer_name, status FROM repairs WHERE number ILIKE $1 OR customer_name ILIKE $1 OR customer_phone ILIKE $1 OR imei ILIKE $1 OR device ILIKE $1 ORDER BY id DESC LIMIT 5`, [like]).then((r) =>
        r.forEach((j) => hits.push({ group: "Repairs", title: `${j.number} · ${j.device}`, sub: `${j.customer_name} · ${j.status.replace("_", " ")}`, href: `/repairs/${j.id}` })),
      ),
    );
  if (can(user, "suppliers"))
    jobs.push(
      q<any>(`SELECT id, name, phone FROM suppliers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY name LIMIT 4`, [like]).then((r) =>
        r.forEach((s) => hits.push({ group: "Suppliers", title: s.name, sub: s.phone, href: `/suppliers` })),
      ),
    );
  if (can(user, "purchases"))
    jobs.push(
      q<any>(`SELECT p.id, p.number, p.bill_ref, s.name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.number ILIKE $1 OR p.bill_ref ILIKE $1 ORDER BY p.id DESC LIMIT 4`, [like]).then((r) =>
        r.forEach((p) => hits.push({ group: "Purchases", title: p.number, sub: [p.name, p.bill_ref].filter(Boolean).join(" · "), href: `/purchases/${p.id}` })),
      ),
    );
  await Promise.all(jobs);
  const order = ["Products", "IMEI", "Invoices", "Customers", "Repairs", "Purchases", "Suppliers"];
  hits.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return NextResponse.json({ hits });
}
