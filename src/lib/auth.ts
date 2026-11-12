import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { one } from "./db";
import { getSecret } from "./settings";

export type Role = "owner" | "manager" | "cashier" | "technician";

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
}

const COOKIE = "sd_session";

// What each role may open. Owners can do everything.
const ACCESS: Record<Role, string[]> = {
  owner: ["*"],
  manager: ["dashboard", "pos", "sales", "customers", "products", "purchases", "suppliers", "repairs", "buyback", "expenses", "reports", "imei"],
  cashier: ["dashboard", "pos", "sales", "customers", "products", "repairs", "buyback", "imei"],
  technician: ["dashboard", "repairs", "imei"],
};

export function can(user: User, area: string) {
  const a = ACCESS[user.role] ?? [];
  return a.includes("*") || a.includes(area);
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
    secure: process.env.NODE_ENV === "production",
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
    const u = await one<User>("SELECT id, name, username, role FROM users WHERE id = $1 AND active", [payload.uid]);
    return u ?? null;
  } catch {
    return null;
  }
});

/** Use at the top of every page and server action. */
export async function requireUser(area?: string): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (area && !can(u, area)) redirect("/?denied=1");
  return u;
}
