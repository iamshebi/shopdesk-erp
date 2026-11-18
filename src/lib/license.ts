import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { q } from "./db";
import { planOf, type Plan } from "./plans";
import { STATUS_URL } from "./brand";

// Subscription licence. DOLLAR44 signs each key with its private key (scripts/license-keygen.html or
// scripts/license.mjs, kept off the shop's computer); the app only holds the public key below, so a key
// cannot be made or edited by the shop.
// Key format: D44-<payload, base64url JSON>.<Ed25519 signature, base64url>
// Payload: { v: 1, id, c: client, p: plan label, s: start, e: last day, pl?: "basic"|"pro"|"enterprise", mu?: max users }
//
// DOLLAR44 can cancel a key before it ends: the signed status file at STATUS_URL lists cancelled licence IDs.
// The app reads it twice a day when it has internet. A paid key that has not reached DOLLAR44 for
// CHECK_LOCK_DAYS locks until the computer goes online once.
const PUBLIC_KEY_DER = "MCowBQYDK2VwAyEAK13MMsYEXHZOgJ36ycK/RzKkz60X3DT5FG9V5kjJlds=";

export const TRIAL_DAYS = 14; // a fresh install runs this long before it needs a key
export const GRACE_DAYS = 5; // after a key ends, the app keeps working this long with a warning
export const CHECK_WARN_DAYS = 45; // no contact with DOLLAR44 for this long: warning
export const CHECK_LOCK_DAYS = 60; // and for this long: locked until it goes online once

const DAY = 86_400_000;
const CHECK_EVERY = 12 * 3600_000;

export interface LicensePayload { v: number; id: string; c: string; p: string; s: string; e: string; pl?: string; mu?: number }
export type LicenseState = "active" | "trial" | "grace" | "expired" | "cancelled" | "unchecked";
export interface LicenseStatus {
  state: LicenseState;
  locked: boolean;
  daysLeft: number; // days until locked (0 when locked)
  daysToEnd: number; // days until the key or trial ends
  endsOn: string; // the day the key or trial runs to, YYYY-MM-DD
  license: LicensePayload | null;
  key: string;
  plan: Plan;
  maxUsers: number; // 0 = no limit
  checkWarning: boolean; // has not reached DOLLAR44 for CHECK_WARN_DAYS
  lastCheck: number; // ms, last successful status check (0 = never)
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

/** The signed status file DOLLAR44 publishes: { data: base64url(JSON), sig: base64url }. */
export interface StatusData { v: number; t: string; revoked?: string[]; revokedPcs?: string[]; app?: { version: string; url: string; sha512: string; notes?: string } }
export function verifyStatus(text: string): StatusData | null {
  try {
    const f = JSON.parse(text);
    if (typeof f?.data !== "string" || typeof f?.sig !== "string") return null;
    if (!crypto.verify(null, Buffer.from(f.data), publicKey, Buffer.from(f.sig, "base64url"))) return null;
    const d = JSON.parse(Buffer.from(f.data, "base64url").toString("utf8"));
    return d?.v === 1 ? d : null;
  } catch {
    return null;
  }
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

/** Reads DOLLAR44's status file (at most every 12 hours). Never throws; no internet just means no news. */
async function refreshStatus(kv: Record<string, string | undefined>, now: number) {
  const tried = Number(kv.license_status_tried || 0);
  if (now - tried < CHECK_EVERY && kv.license_status) return;
  await setKv("license_status_tried", String(now));
  try {
    const r = await fetch(process.env.D44_STATUS_URL || STATUS_URL, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const text = await r.text();
    const d = verifyStatus(text);
    if (!d) return;
    // Never go back to an older status file (someone replaying an old copy).
    const prev = kv.license_status ? verifyStatus(kv.license_status) : null;
    if (prev && Date.parse(prev.t) > Date.parse(d.t)) return;
    await setKv("license_status", text);
    await setKv("license_checked_ok", String(now));
    kv.license_status = text;
    kv.license_checked_ok = String(now);
  } catch {
    /* offline */
  }
}

export const getLicenseStatus = cache(async (): Promise<LicenseStatus> => {
  const kv = await getKv(["license_key", "license_trial_start", "license_seen", "license_status", "license_status_tried", "license_checked_ok", "license_activated_at"]);
  // Guard against the computer's clock being turned back: never count from earlier than the latest time seen.
  const seen = Number(kv.license_seen || 0);
  const now = Math.max(Date.now(), seen);
  if (now - seen > 3600_000) await setKv("license_seen", String(now));

  let license: LicensePayload | null = null;
  if (kv.license_key) {
    try { license = parseKey(kv.license_key); } catch { license = null; }
  }
  if (license) await refreshStatus(kv, now);
  const status = kv.license_status ? verifyStatus(kv.license_status) : null;
  const lastCheck = Math.max(Number(kv.license_checked_ok || 0), Number(kv.license_activated_at || 0));

  let end: number;
  let state: LicenseState;
  if (license) {
    end = endOfDay(license.e);
    state = now <= end ? "active" : now <= end + GRACE_DAYS * DAY ? "grace" : "expired";
    if (status?.revoked?.includes(license.id)) state = "cancelled";
    else if (state !== "expired" && lastCheck && now - lastCheck > CHECK_LOCK_DAYS * DAY) state = "unchecked";
  } else {
    let start = Number(kv.license_trial_start || 0);
    if (!start) { start = now; await setKv("license_trial_start", String(start)); }
    end = start + TRIAL_DAYS * DAY;
    state = now <= end ? "trial" : "expired";
  }
  const plan = planOf(license?.pl);
  const lockAt = license ? end + GRACE_DAYS * DAY : end;
  const locked = state === "expired" || state === "cancelled" || state === "unchecked";
  return {
    state,
    locked,
    daysLeft: locked ? 0 : Math.max(0, Math.ceil((lockAt - now) / DAY)),
    daysToEnd: Math.max(0, Math.ceil((end - now) / DAY)),
    endsOn: ymd(end),
    license,
    key: kv.license_key || "",
    plan,
    maxUsers: license?.mu ?? (license ? plan.users : 0),
    checkWarning: !!license && !!lastCheck && now - lastCheck > CHECK_WARN_DAYS * DAY && !locked,
    lastCheck,
  };
});

/** Checks with DOLLAR44 right now (button on the subscription page). */
export async function checkNow() {
  await setKv("license_status_tried", "0");
  const kv = await getKv(["license_status", "license_status_tried", "license_checked_ok"]);
  await refreshStatus(kv, Date.now());
}

export async function activate(raw: string): Promise<LicensePayload> {
  const p = parseKey(raw);
  await checkNow();
  const kv = await getKv(["license_seen", "license_status"]);
  const seen = Math.max(Date.now(), Number(kv.license_seen || 0));
  if (endOfDay(p.e) + GRACE_DAYS * DAY < seen) throw new Error(`This key ended on ${p.e}. Ask DOLLAR44 for a renewal key.`);
  const status = kv.license_status ? verifyStatus(kv.license_status) : null;
  if (status?.revoked?.includes(p.id)) throw new Error("This key was cancelled by DOLLAR44.");
  await setKv("license_key", raw.trim().replace(/\s+/g, ""));
  await setKv("license_activated_at", String(Date.now()));
  return p;
}
