import "server-only";
import crypto from "node:crypto";
import { getSecret } from "./settings";

export async function saleToken(id: number) {
  const sig = crypto.createHmac("sha256", await getSecret()).update(`sale:${id}`).digest("base64url").slice(0, 22);
  return `${id}.${sig}`;
}
export async function readSaleToken(token: string) {
  const [id] = token.split(".");
  const n = Number(id);
  if (!n) return null;
  const good = await saleToken(n);
  return good.length === token.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(token)) ? n : null;
}
export async function baseUrl() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
