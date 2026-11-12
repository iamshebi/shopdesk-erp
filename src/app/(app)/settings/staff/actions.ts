"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can, type User } from "@/lib/auth";
import { log } from "@/lib/activity";
import { ALL_PERMS } from "@/lib/permissions";
import { str } from "@/lib/util";

const back = (msg: string, ok = false) => redirect(`/settings/staff?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);
const isOwner = (u: User) => can(u, "*") && u.perms.includes("*");

async function roleById(id: number) {
  return one<{ id: number; name: string; locked: boolean }>("SELECT id, name, locked FROM roles WHERE id=$1", [id]);
}

async function activeOwners(exceptUserId?: number) {
  const r = await one<{ n: number }>(
    "SELECT count(*)::int n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.locked AND u.active AND u.id <> $1",
    [exceptUserId ?? 0],
  );
  return r?.n ?? 0;
}

export async function addUser(fd: FormData) {
  const me = await requireUser("staff");
  const password = str(fd, "password");
  const role = await roleById(Number(fd.get("role_id")));
  if (!role) back("Choose a role");
  if (role!.locked && !isOwner(me)) back("Only an owner can create another owner");
  if (password.length < 6) back("Password must be at least 6 characters");
  const username = str(fd, "username").toLowerCase().replace(/\s+/g, "");
  if (!username || !str(fd, "name")) back("Name and username are required");
  const exists = await one("SELECT 1 FROM users WHERE lower(username)=$1", [username]);
  if (exists) back("That username is already taken");
  await q("INSERT INTO users (name, username, password_hash, role, role_id) VALUES ($1,$2,$3,$4,$5)", [
    str(fd, "name"), username, await bcrypt.hash(password, 10), role!.name.toLowerCase(), role!.id,
  ]);
  await log(me.id, "Staff added", `${str(fd, "name")} (${username}) as ${role!.name}`, "/settings/staff");
  revalidatePath("/settings/staff");
  back(`${str(fd, "name")} can now sign in as “${username}”`, true);
}

export async function changeRole(fd: FormData) {
  const me = await requireUser("staff");
  const id = Number(fd.get("id"));
  const role = await roleById(Number(fd.get("role_id")));
  const target = await one<any>("SELECT u.name, r.locked FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1", [id]);
  if (!role || !target) back("Not found");
  if (id === me.id) back("You can't change your own role");
  if ((role!.locked || target.locked) && !isOwner(me)) back("Only an owner can change an owner's role");
  if (target.locked && !role!.locked && (await activeOwners(id)) === 0) back("There must always be at least one active owner");
  await q("UPDATE users SET role_id=$1, role=$2 WHERE id=$3", [role!.id, role!.name.toLowerCase(), id]);
  await log(me.id, "Staff role changed", `${target.name} → ${role!.name}`, "/settings/staff");
  revalidatePath("/settings/staff");
}

export async function toggleUser(fd: FormData) {
  const me = await requireUser("staff");
  const id = Number(fd.get("id"));
  if (id === me.id) back("You can't disable your own login");
  const target = await one<any>("SELECT u.name, u.active, r.locked FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1", [id]);
  if (!target) back("Not found");
  if (target.locked && !isOwner(me)) back("Only an owner can disable an owner");
  if (target.locked && target.active && (await activeOwners(id)) === 0) back("There must always be at least one active owner");
  await q("UPDATE users SET active = NOT active WHERE id=$1", [id]);
  await log(me.id, target.active ? "Staff login disabled" : "Staff login enabled", target.name, "/settings/staff");
  revalidatePath("/settings/staff");
}

export async function resetPassword(fd: FormData) {
  const me = await requireUser("staff");
  const id = Number(fd.get("id"));
  const password = str(fd, "password");
  if (password.length < 6) back("Password must be at least 6 characters");
  const target = await one<any>("SELECT u.name, r.locked FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1", [id]);
  if (!target) back("Not found");
  if (target.locked && !isOwner(me) && id !== me.id) back("Only an owner can reset an owner's password");
  await q("UPDATE users SET password_hash=$1 WHERE id=$2", [await bcrypt.hash(password, 10), id]);
  await log(me.id, "Password reset", target.name, "/settings/staff");
  back(`Password changed for ${target.name}`, true);
}

export async function saveRole(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const me = await requireUser("staff");
  if (!isOwner(me)) return { error: "Only an owner can create or edit roles" };
  const id = fd.get("id") ? Number(fd.get("id")) : null;
  const name = str(fd, "name");
  if (!name) return { error: "Give the role a name" };
  const perms = fd.getAll("perm").map(String).filter((p) => ALL_PERMS.includes(p));
  if (id) {
    const role = await roleById(id);
    if (!role) return { error: "Role not found" };
    if (role.locked) return { error: "The Owner role always has full access and can't be changed" };
    const clash = await one("SELECT 1 FROM roles WHERE lower(name)=lower($1) AND id<>$2", [name, id]);
    if (clash) return { error: "Another role already has that name" };
    await q("UPDATE roles SET name=$1, permissions=$2 WHERE id=$3", [name, JSON.stringify(perms), id]);
    await log(me.id, "Role edited", `${name}: ${perms.length} permissions`, `/settings/roles/${id}`);
  } else {
    const clash = await one("SELECT 1 FROM roles WHERE lower(name)=lower($1)", [name]);
    if (clash) return { error: "A role with that name already exists" };
    const [r] = await q<{ id: number }>("INSERT INTO roles (name, permissions) VALUES ($1,$2) RETURNING id", [name, JSON.stringify(perms)]);
    await log(me.id, "Role created", `${name}: ${perms.length} permissions`, `/settings/roles/${r.id}`);
  }
  revalidatePath("/settings/staff");
  redirect(`/settings/staff?ok=${encodeURIComponent(`Role “${name}” saved`)}`);
}

export async function deleteRole(fd: FormData) {
  const me = await requireUser("staff");
  if (!isOwner(me)) back("Only an owner can delete roles");
  const id = Number(fd.get("id"));
  const role = await roleById(id);
  if (!role || role.locked) back("This role can't be deleted");
  const used = await one<{ n: number }>("SELECT count(*)::int n FROM users WHERE role_id=$1", [id]);
  if (used!.n > 0) back(`Move the ${used!.n} staff using “${role!.name}” to another role first`);
  await q("DELETE FROM roles WHERE id=$1", [id]);
  await log(me.id, "Role deleted", role!.name, "/settings/staff");
  revalidatePath("/settings/staff");
  back(`Role “${role!.name}” deleted`, true);
}
