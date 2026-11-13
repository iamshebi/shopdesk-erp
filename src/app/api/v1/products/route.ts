import { q } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { PRODUCT_API_SQL } from "@/lib/stock";

export async function GET(req: Request) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const u = new URL(req.url);
  const params: unknown[] = [];
  const where = ["p.active"];
  if (u.searchParams.get("q")) { params.push(`%${u.searchParams.get("q")}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`); }
  if (u.searchParams.get("updated_since")) { params.push(u.searchParams.get("updated_since")); where.push(`p.updated_at >= $${params.length}::timestamptz`); }
  if (u.searchParams.get("website") === "1") where.push("p.website_visible");
  const limit = Math.min(1000, Number(u.searchParams.get("limit")) || 500), offset = Number(u.searchParams.get("offset")) || 0;
  const rows = await q(`${PRODUCT_API_SQL} WHERE ${where.join(" AND ")} ORDER BY p.id LIMIT ${limit} OFFSET ${offset}`, params);
  return Response.json({ data: rows, limit, offset });
}
