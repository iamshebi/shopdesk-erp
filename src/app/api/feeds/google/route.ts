import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";

const x = (v: unknown) => String(v ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Product feed for Google Merchant Center (Google Shopping) and Meta / Instagram catalogues. */
export async function GET(req: Request) {
  const s = await getSettings();
  const base = new URL(req.url).origin;
  const site = s.website_url.replace(/\/$/, "") || base;
  const rows = await q<any>(`SELECT p.id, p.web_id, p.sku, p.barcode, p.name, p.brand, p.category, p.description, p.price, p.discount_price, p.image_url, p.is_service, ${STOCK_SQL} AS stock FROM products p WHERE p.active AND p.status='active' AND p.website_visible AND p.price > 0`);
  const items = rows.map((p) => {
    const img = p.image_url?.startsWith("/") ? base + p.image_url : p.image_url;
    return `<item><g:id>${x(p.sku || p.id)}</g:id><g:title>${x(p.name)}</g:title><g:description>${x(p.description || p.name)}</g:description><g:link>${x(`${site}/?p=${p.web_id || p.id}`)}</g:link>${img ? `<g:image_link>${x(img)}</g:image_link>` : ""}
<g:availability>${p.is_service || Number(p.stock) > 0 ? "in_stock" : "out_of_stock"}</g:availability><g:price>${Number(p.price).toFixed(2)} ${x(s.currency)}</g:price>${p.discount_price ? `<g:sale_price>${Number(p.discount_price).toFixed(2)} ${x(s.currency)}</g:sale_price>` : ""}
${p.brand ? `<g:brand>${x(p.brand)}</g:brand>` : ""}${p.barcode ? `<g:gtin>${x(p.barcode)}</g:gtin>` : ""}<g:condition>new</g:condition>${p.category ? `<g:product_type>${x(p.category)}</g:product_type>` : ""}</item>`;
  });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${x(s.shop_name)}</title><link>${x(site)}</link><description>${x(s.shop_name)} products</description>\n${items.join("\n")}\n</channel></rss>`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
