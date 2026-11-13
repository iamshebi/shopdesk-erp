import { one } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { PRODUCT_API_SQL } from "@/lib/stock";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const { id } = await params;
  const row = await one(`${PRODUCT_API_SQL} WHERE p.id=$1 OR p.sku=$2 LIMIT 1`, [Number(id) || 0, id]);
  return row ? Response.json({ data: row }) : Response.json({ error: "Not found" }, { status: 404 });
}
