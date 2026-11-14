import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { siteContent } from "@/lib/site-content";
import { cors } from "@/lib/public-api";

export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: await cors(req) }); }

/** Everything the website needs besides products: banners, promotions, menu, pages, SEO, delivery zones, featured items. */
export async function GET(req: Request) {
  const s = await getSettings();
  const c = await siteContent();
  const zones = await q("SELECT name, areas, charge, free_over, days FROM shipping_zones ORDER BY id");
  const featured = await q("SELECT id, web_id, name, price, discount_price, image_url FROM products WHERE active AND status='active' AND featured AND website_visible ORDER BY updated_at DESC LIMIT 24");
  return Response.json({
    shop: { name: s.shop_name, name_ar: s.shop_name_ar, phone: s.phone, email: s.email, address: s.address, currency: s.currency, logo: s.logo?.startsWith("data:") ? "" : s.logo },
    ...c, banners: c.banners.filter((b) => b.active), promos: c.promos.filter((p) => p.active), delivery_zones: zones, featured, orders_enabled: s.website_orders_enabled, updated_at: new Date().toISOString(),
  }, { headers: { ...(await cors(req)), "Cache-Control": "public, max-age=60" } });
}
