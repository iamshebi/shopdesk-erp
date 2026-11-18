import { q } from "@/lib/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { PAYMENT_METHODS } from "@/lib/util";

export const dynamic = "force-dynamic";

/** What the Windows app keeps on the PC so the till keeps working when the internet is down. */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  if (!can(user, "pos")) return Response.json({ error: "no_pos" }, { status: 403 });
  const s = await getSettings();
  const products = await q<any>(
    `SELECT p.id, p.name, p.brand, p.sku, p.barcode, p.price, p.track_serial, p.is_service, ${STOCK_SQL} AS stock
       FROM products p WHERE p.active AND COALESCE(p.status,'active') = 'active' ORDER BY p.name LIMIT 20000`,
  );
  const units = await q<any>("SELECT id, product_id, imei, imei2, price, margin_scheme FROM units WHERE status='in_stock' ORDER BY id LIMIT 50000");
  const perms = { price: can(user, "sales.price"), discount: can(user, "sales.discount"), credit: can(user, "sales.credit") };
  return Response.json({
    at: new Date().toISOString(),
    user: { id: user.id, name: user.name, username: user.username, perms },
    shop: {
      shop_name: s.shop_name, shop_name_ar: s.shop_name_ar, address: s.address, emirate: s.emirate, phone: s.phone, trn: s.trn,
      vat_registered: s.vat_registered, vat_rate: s.vat_rate, prices_include_vat: s.prices_include_vat, currency: s.currency,
      receipt_width: s.receipt_width, receipt_counter: s.receipt_counter, invoice_terms: s.invoice_terms,
    },
    payment_methods: PAYMENT_METHODS.filter((m) => m.id !== "store_credit" && (perms.credit || m.id !== "credit")),
    products: products.map((p) => ({ ...p, price: Number(p.price), stock: p.stock == null ? null : Number(p.stock) })),
    units: units.map((u) => ({ ...u, price: u.price == null ? null : Number(u.price) })),
  });
}
