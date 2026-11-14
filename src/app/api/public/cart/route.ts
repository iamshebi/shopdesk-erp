import { q } from "@/lib/db";
import { cors, tooMany, foreignOrigin } from "@/lib/public-api";

export async function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: await cors(req, true) }); }

/** The website saves the cart as the customer fills it, so unfinished carts can be followed up. */
export async function POST(req: Request) {
  const headers = await cors(req, true);
  if (await foreignOrigin(req)) return Response.json({ error: "Not allowed" }, { status: 403, headers });
  if (tooMany(req, 30)) return Response.json({ error: "Slow down" }, { status: 429, headers });
  const b = await req.json().catch(() => null);
  const token = String(b?.token ?? "").slice(0, 64);
  if (!token || !Array.isArray(b.items)) return Response.json({ error: "token and items[] required" }, { status: 400, headers });
  const items = b.items.slice(0, 60).map((i: any) => ({ id: String(i.id ?? "").slice(0, 80), name: String(i.name ?? "").slice(0, 160), qty: Math.max(1, Math.round(Number(i.qty) || 1)), price: Number(i.price) || 0 }));
  const total = items.reduce((a: number, i: any) => a + i.qty * i.price, 0);
  await q(`INSERT INTO web_carts (token, name, phone, email, items, total) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (token) DO UPDATE SET name=COALESCE(NULLIF($2,''), web_carts.name), phone=COALESCE(NULLIF($3,''), web_carts.phone), email=COALESCE(NULLIF($4,''), web_carts.email), items=$5, total=$6, updated_at=now() WHERE web_carts.status='open'`,
    [token, String(b.name ?? "").slice(0, 120), String(b.phone ?? "").slice(0, 20), String(b.email ?? "").slice(0, 120), JSON.stringify(items), total]);
  return Response.json({ ok: true }, { headers });
}
