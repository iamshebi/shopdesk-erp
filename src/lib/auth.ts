import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { one } from "./db";
import { getSecret } from "./settings";

export interface User {
  id: number;
  name: string;
  username: string;
  role_id: number;
  role: string; // role name, e.g. "Cashier"
  perms: string[];
}

const COOKIE = "sd_session";

/** True if the user's role grants this permission (Owner has "*"). */
export function can(user: User, perm: string) {
  return user.perms.includes("*") || user.perms.includes(perm);
}

export function canAny(user: User, perms: string[]) {
  return perms.some((p) => can(user, p));
}

async function key() {
  return new TextEncoder().encode(await getSecret());
}

export async function startSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(await key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Desktop app serves plain http on the shop network, so cookies can't be "secure" there.
    secure: process.env.NODE_ENV === "production" && process.env.SHOPDESK_DESKTOP !== "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key());
    const u = await one<any>(
      `SELECT u.id, u.name, u.username, u.role_id, r.name AS role, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.active`,
      [payload.uid],
    );
    if (!u) return null;
    let perms: string[] = [];
    try {
      perms = JSON.parse(u.permissions);
    } catch {}
    return { id: u.id, name: u.name, username: u.username, role_id: u.role_id, role: u.role, perms };
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
