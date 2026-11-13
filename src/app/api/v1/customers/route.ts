import { q, one } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { fireWebhook } from "@/lib/webhooks";

export async function GET(req: Request) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const u = new URL(req.url);
  const s = u.searchParams.get("q");
  const rows = await q(`SELECT id, name, phone, email, trn, address, group_name, tags, created_at FROM customers ${s ? "WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1" : ""} ORDER BY id DESC LIMIT 500`, s ? [`%${s}%`] : []);
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const a = await apiAuth(req, "write");
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim(), phone = String(b.phone ?? "").trim();
  if (!name && !phone) return Response.json({ error: "name or phone is required" }, { status: 400 });
  const ex = phone ? await one<any>("SELECT id FROM customers WHERE phone=$1", [phone]) : null;
  if (ex) return Response.json({ data: { id: ex.id, existing: true } });
  const row = await one<any>("INSERT INTO customers (name, phone, email, address, tags) VALUES ($1,$2,$3,$4,'api') RETURNING id", [name || phone, phone, String(b.email ?? ""), String(b.address ?? "")]);
  await fireWebhook("customer.created", { id: row.id, name, phone });
  return Response.json({ data: { id: row.id } }, { status: 201 });
}
