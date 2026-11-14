import { trackOrder } from "@/lib/track";
import { cors, tooMany } from "@/lib/public-api";

export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: await cors(req) }); }
export async function GET(req: Request) {
  const headers = await cors(req);
  if (tooMany(req, 20)) return Response.json({ error: "Too many tries" }, { status: 429, headers });
  const u = new URL(req.url);
  const r = await trackOrder(u.searchParams.get("order") ?? "", u.searchParams.get("phone") ?? "");
  return r ? Response.json(r, { headers }) : Response.json({ error: "No order found with that number and phone" }, { status: 404, headers });
}
