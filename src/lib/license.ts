import "server-only";
import crypto from "node:crypto";
import { q } from "./db";

// Subscription licence. DOLLAR44 signs each key with its private key (scripts/license.mjs, kept off the
// shop's computer); the app only holds the public key below, so a key cannot be made or edited by the shop.
// Key format: D44-<payload, base64url JSON>.<Ed25519 signature, base64url>
// Payload: { v: 1, id: licence id, c: client name, p: plan, s: start "YYYY-MM-DD", e: last day "YYYY-MM-DD" }
const PUBLIC_KEY_DER = "MCowBQYDK2VwAyEAK13MMsYEXHZOgJ36ycK/RzKkz60X3DT5FG9V5kjJlds=";

export const TRIAL_DAYS = 14; // a fresh install runs this long before it needs a key
export const GRACE_DAYS = 5; // after a key ends, the app keeps working this long with a warning

const DAY = 86_400_000;

export interface LicensePayload { v: number; id: string; c: string; p: string; s: string; e: string }
export type LicenseState = "active" | "trial" | "grace" | "expired";
export interface LicenseStatus {
  state: LicenseState;
  locked: boolean;
  daysLeft: number; // days until locked (0 when locked)
  daysToEnd: number; // days until the key or trial ends
  endsOn: string; // the day the key or trial runs to, YYYY-MM-DD
  license: LicensePayload | null;
  key: string;
}

const publicKey = crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY_DER, "base64"), format: "der", type: "spki" });

export function parseKey(raw: string): LicensePayload {
  const key = raw.trim().replace(/\s+/g, "");
  const m = /^D44-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key);
  if (!m) throw new Error("This is not a DOLLAR44 activation key. Copy the whole key, starting with D44-.");
  const ok = crypto.verify(null, Buffer.from(m[1]), publicKey, Buffer.from(m[2], "base64url"));
  if (!ok) throw new Error("This activation key is not valid. Please check it with DOLLAR44.");
  let p: LicensePayload;
  try {
    p = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("This activation key is damaged.");
  }
  if (p.v !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(p.e)) throw new Error("This activation key is for a different version.");
  return p;
}

const endOfDay = (ymd: string) => Date.parse(`${ymd}T23:59:59+04:00`); // UAE time
const ymd = (t: number) => new Date(t + 4 * 3600_000).toISOString().slice(0, 10);

async function getKv(keys: string[]) {
  const rows = await q<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE key IN (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys);
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string | undefined>;
}
async function setKv(key: string, value: string) {
  await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]);
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const kv = await getKv(["license_key", "license_trial_start", "license_seen"]);
  // Guard against the computer's clock being turned back: never count from earlier than the latest time seen.
  const seen = Number(kv.license_seen || 0);
  const now = Math.max(Date.now(), seen);
  if (now - seen > 3600_000) await setKv("license_seen", String(now));

  let license: LicensePayload | null = null;
  if (kv.license_key) {
    try { license = parseKey(kv.license_key); } catch { license = null; }
  }

  let end: number;
  let state: LicenseState;
  if (license) {
    end = endOfDay(license.e);
    state = now <= end ? "active" : now <= end + GRACE_DAYS * DAY ? "grace" : "expired";
  } else {
    let start = Number(kv.license_trial_start || 0);
    if (!start) { start = now; await setKv("license_trial_start", String(start)); }
    end = start + TRIAL_DAYS * DAY;
    state = now <= end ? "trial" : "expired";
  }
  const lockAt = license ? end + GRACE_DAYS * DAY : end;
  return {
    state,
    locked: state === "expired",
    daysLeft: Math.max(0, Math.ceil((lockAt - now) / DAY)),
    daysToEnd: Math.max(0, Math.ceil((end - now) / DAY)),
    endsOn: ymd(end),
    license,
    key: kv.license_key || "",
  };
}

export async function activate(raw: string): Promise<LicensePayload> {
  const p = parseKey(raw);
  const seen = Math.max(Date.now(), Number((await getKv(["license_seen"])).license_seen || 0));
  if (endOfDay(p.e) + GRACE_DAYS * DAY < seen) throw new Error(`This key ended on ${p.e}. Ask DOLLAR44 for a renewal key.`);
  await setKv("license_key", raw.trim().replace(/\s+/g, ""));
  return p;
}
