import "server-only";
import { getSettings } from "./settings";

/** CORS headers for the shop's own website (or any origin for read-only data). */
export async function cors(req: Request, write = false) {
  const s = await getSettings();
  const origin = req.headers.get("origin") ?? "";
  const site = s.website_url.replace(/\/$/, "");
  const allow = !write ? "*" : origin && site && (origin === site || origin === site.replace("://www.", "://") || origin.replace("://www.", "://") === site) ? origin : site || "null";
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

const hits = new Map<string, { n: number; t: number }>();
/** Small in-memory limiter: max n requests per minute per IP. */
export function tooMany(req: Request, max = 10) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > max;
}

/** True when a browser on another website is calling (our own site, or non-browser callers, pass). */
export async function foreignOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const s = await getSettings();
  const norm = (u: string) => u.replace(/\/$/, "").replace("://www.", "://").toLowerCase();
  const own = new URL(req.url).origin;
  return norm(origin) !== norm(own) && (!s.website_url || norm(origin) !== norm(s.website_url));
}
