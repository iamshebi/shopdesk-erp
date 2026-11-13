"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { one, q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newTotpSecret, verifyTotp, encryptField, decryptField } from "@/lib/totp";
import { str } from "@/lib/util";
import { log } from "@/lib/activity";

function back(msg: string, kind: "ok" | "err" = "ok"): never {
  redirect(`/account?${kind}=${encodeURIComponent(msg)}`);
}

export async function changePassword(fd: FormData) {
  const me = await requireUser();
  const current = str(fd, "current");
  const next = str(fd, "next");
  const u = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [me.id]);
  if (!u || !(await bcrypt.compare(current, u.password_hash))) back("Your current password is not right", "err");
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) back("Use at least 8 characters with letters and numbers", "err");
  if (next !== str(fd, "confirm")) back("The two new passwords don't match", "err");
  await q("UPDATE users SET password_hash=$1, password_changed_at=now() WHERE id=$2", [await bcrypt.hash(next, 10), me.id]);
  await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL", [me.id, me.sid]);
  await log(me.id, "Password changed", "Other devices were signed out");
  back("Password changed. Your other devices were signed out.");
}

export async function start2fa() {
  const me = await requireUser();
  if (me.totp_enabled) back("Two-step verification is already on");
  await q("UPDATE users SET totp_secret=$1 WHERE id=$2", [await encryptField(newTotpSecret()), me.id]);
  redirect("/account?setup=1");
}

export async function confirm2fa(fd: FormData) {
  const me = await requireUser();
  const u = await one<{ totp_secret: string }>("SELECT totp_secret FROM users WHERE id=$1", [me.id]);
  if (!u?.totp_secret) redirect("/account");
  if (!verifyTotp(await decryptField(u.totp_secret), str(fd, "code"))) redirect("/account?setup=1&err=" + encodeURIComponent("That code is not right. Try the newest code in the app."));
  await q("UPDATE users SET totp_enabled=TRUE WHERE id=$1", [me.id]);
  await log(me.id, "2FA turned on");
  back("Two-step verification is on. You'll need a code from the app each time you sign in.");
}

export async function disable2fa(fd: FormData) {
  const me = await requireUser();
  const u = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [me.id]);
  if (!u || !(await bcrypt.compare(str(fd, "password"), u.password_hash))) back("Password is not right", "err");
  await q("UPDATE users SET totp_enabled=FALSE, totp_secret='' WHERE id=$1", [me.id]);
  await log(me.id, "2FA turned off");
  back("Two-step verification is off");
}

export async function revokeMySession(fd: FormData) {
  const me = await requireUser();
  const sid = str(fd, "sid");
  if (sid === me.sid) back("That's the device you're using now. Use Sign out instead.", "err");
  await q("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2", [sid, me.id]);
  await log(me.id, "Session signed out", "From My account");
  back("That device was signed out");
}

export async function revokeOtherSessions() {
  const me = await requireUser();
  await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL", [me.id, me.sid]);
  await log(me.id, "Sessions signed out", "All other devices");
  back("All your other devices were signed out");
}
