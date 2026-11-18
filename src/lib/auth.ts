import "server-only";
import { cache } from "react";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { one, q } from "./db";
import { getSecret, getSettings } from "./settings";

export interface User {
  id: number;
  name: string;
  username: string;
  role_id: number;
  role: string; // role name, e.g. "Cashier"
  perms: string[];
  blocked?: string[]; // permissions the DOLLAR44 plan does not include
  sid: string; // current session id
  totp_enabled: boolean;
}

const COOKIE = "sd_session";
const PENDING_2FA = "sd_2fa";

/** True if the user's role grants this permission (Owner has "*"). */
export function can(user: User, perm: string) {
  if (user.blocked?.includes(perm)) return false;
  return user.perms.includes("*") || user.perms.includes(perm);
}

export function canAny(user: User, perms: string[]) {
  return perms.some((p) => can(user, p));
}

async function key() {
  return new TextEncoder().encode(await getSecret());
}

const secure = () => process.env.NODE_ENV === "production" && process.env.SHOPDESK_DESKTOP !== "1";

/** Where the request came from, for login history and the session list. */
export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim();
  const ua = (h.get("user-agent") || "").slice(0, 300);
  return { ip, ua };
}

/** Human-readable device name from a user-agent string. */
export function deviceName(ua: string) {
  if (!ua) return "Unknown device";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? (/SM-|Samsung/i.test(ua) ? "Samsung Android" : "Android") : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Electron/.test(ua) ? "DOLLAR44 ERP app" : /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export async function startSession(userId: number) {
  const sid = crypto.randomBytes(24).toString("base64url");
  const { ip, ua } = await clientInfo();
  await q("INSERT INTO sessions (id, user_id, ip, user_agent) VALUES ($1,$2,$3,$4)", [sid, userId, ip, ua]);
  const token = await new SignJWT({ uid: userId, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(await key());
  const jar = await cookies();
  jar.delete(PENDING_2FA);
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, await key());
      if (payload.sid) await q("UPDATE sessions SET revoked_at = now() WHERE id=$1 AND revoked_at IS NULL", [payload.sid]);
    } catch {}
  }
  jar.delete(COOKIE);
}

/** Password was right but a 2FA code is still needed: remember who, for 5 minutes. */
export async function startPending2fa(userId: number) {
  const token = await new SignJWT({ uid: userId, p: "2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(await key());
  (await cookies()).set(PENDING_2FA, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 300 });
}

export async function pending2faUser(): Promise<number | null> {
  const token = (await cookies()).get(PENDING_2FA)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key());
    return payload.p === "2fa" ? Number(payload.uid) : null;
  } catch {
    return null;
  }
}

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key());
    if (!payload.sid) return null; // sessions from before server-side sessions existed
    const u = await one<any>(
      `SELECT u.id, u.name, u.username, u.role_id, u.totp_enabled, r.name AS role, r.permissions,
              s.last_seen_at, EXTRACT(EPOCH FROM (now() - s.last_seen_at))::int AS idle_s
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND u.active`,
      [payload.sid, payload.uid],
    );
    if (!u) return null;
    const idleLimit = (await getSettings()).idle_timeout_minutes;
    if (idleLimit > 0 && u.idle_s > idleLimit * 60) {
      await q("UPDATE sessions SET revoked_at = now() WHERE id=$1", [payload.sid]);
      return null;
    }
    // Keep "last active" fresh without writing on every request.
    if (u.idle_s > 60) await q("UPDATE sessions SET last_seen_at = now() WHERE id=$1", [payload.sid]);
    let perms: string[] = [];
    try {
      perms = JSON.parse(u.permissions);
    } catch {}
    const { getLicenseStatus } = await import("./license");
    const blocked = (await getLicenseStatus()).plan.blocked;
    return { id: u.id, name: u.name, username: u.username, role_id: u.role_id, role: u.role, perms, blocked, sid: String(payload.sid), totp_enabled: u.totp_enabled };
  } catch {
    return null;
  }
});

/** Use at the top of every page and server action. Pass one permission, or several (any one is enough). */
export async function requireUser(perm?: string | string[]): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (perm && !(Array.isArray(perm) ? canAny(u, perm) : can(u, perm))) redirect("/?denied=1");
  return u;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
