"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { one, q } from "@/lib/db";
import { startSession, endSession } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { str } from "@/lib/util";

export async function login(_: unknown, fd: FormData) {
  const username = str(fd, "username").toLowerCase();
  const password = str(fd, "password");
  const u = await one<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE lower(username) = $1 AND active",
    [username],
  );
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return { error: "Wrong username or password" };
  }
  await startSession(u.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function setupShop(_: unknown, fd: FormData) {
  const count = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if ((count?.n ?? 0) > 0) redirect("/login");
  const shop_name = str(fd, "shop_name");
  const name = str(fd, "name");
  const username = str(fd, "username").toLowerCase();
  const password = str(fd, "password");
  if (!shop_name || !name || !username) return { error: "Please fill every field" };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };
  await saveSettings({
    shop_name,
    trn: str(fd, "trn"),
    phone: str(fd, "phone"),
    emirate: str(fd, "emirate") || "Dubai",
    vat_registered: fd.get("vat_registered") === "on",
  });
  const hash = await bcrypt.hash(password, 10);
  const rows = await q<{ id: number }>(
    "INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING id",
    [name, username, hash],
  );
  await startSession(rows[0].id);
  redirect("/settings?welcome=1");
}
