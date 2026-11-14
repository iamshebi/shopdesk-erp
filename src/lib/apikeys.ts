import "server-only";
import crypto from "node:crypto";
import { q, one } from "./db";

export const hashKey = (k: string) => crypto.createHash("sha256").update(k).digest("hex");
export function newKey() {
  const k = `sdk_${crypto.randomBytes(24).toString("base64url")}`;
  return { key: k, prefix: k.slice(0, 10), hash: hashKey(k) };
}

/** Checks the Authorization: Bearer <key> header. Returns the key row or a Response to send back. */
export async function apiAuth(req: Request, need: "read" | "write") {
  const h = req.headers.get("authorization") ?? "";
  const k = h.startsWith("Bearer ") ? h.slice(7).trim() : req.headers.get("x-api-key") ?? "";
  if (!k) return { error: Response.json({ error: "Missing API key. Send Authorization: Bearer <key>" }, { status: 401 }) };
  const row = await one<any>("SELECT * FROM api_keys WHERE key_hash=$1 AND NOT revoked", [hashKey(k)]);
  if (!row) return { error: Response.json({ error: "Invalid or revoked API key" }, { status: 401 }) };
  if (need === "write" && row.scopes !== "write") return { error: Response.json({ error: "This key is read-only" }, { status: 403 }) };
  await q("UPDATE api_keys SET last_used_at=now() WHERE id=$1", [row.id]);
  await q("INSERT INTO api_log (key_id, method, path) VALUES ($1,$2,$3)", [row.id, req.method, new URL(req.url).pathname]);
  return { key: row };
}
