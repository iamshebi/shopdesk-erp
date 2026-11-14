import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { cors } from "@/lib/public-api";

export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: await cors(req) }); }

/** Live products for the website: only active, approved, website-visible items. Stock is shown as in/out, never the count. */
export async function GET(req: Request) {
  const s = await getSettings();
  const base = new URL(req.url).origin;
  const rows = await q<any>(`SELECT p.id, p.web_id, p.sku, p.name, p.brand, p.category, p.description, p.specs, p.price, p.discount_price, p.featured, p.tags, p.image_url, p.seo_title, p.seo_description, p.parent_id, p.attributes, p.related_ids, p.is_service, ${STOCK_SQL} AS stock,
      (SELECT array_agg('/api/files/' || f.id ORDER BY f.sort, f.id) FROM files f WHERE f.kind='product' AND f.owner_id=p.id) AS images
    FROM products p WHERE p.active AND p.status='active' AND p.website_visible ORDER BY p.featured DESC, p.name`);
  const abs = (u: string) => (u?.startsWith("/") ? base + u : u);
  return Response.json({
    currency: s.currency, show_prices: s.website_show_prices,
    products: rows.map(({ stock, images, image_url, price, discount_price, ...p }) => ({ ...p, image: abs(image_url), images: (images ?? []).map(abs), in_stock: p.is_service || Number(stock) > 0, ...(s.website_show_prices ? { price: Number(price), offer_price: discount_price ? Number(discount_price) : null } : {}) })),
  }, { headers: { ...(await cors(req)), "Cache-Control": "public, max-age=60" } });
}
