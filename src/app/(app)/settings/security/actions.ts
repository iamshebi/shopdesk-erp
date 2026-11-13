"use server";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { str } from "@/lib/util";
import { log } from "@/lib/activity";

function back(msg: string): never {
  redirect(`/settings/security?ok=${encodeURIComponent(msg)}`);
}

export async function saveSecuritySettings(fd: FormData) {
  const me = await requireUser("staff");
  const mins = Math.max(0, Math.min(720, Math.round(Number(str(fd, "idle_timeout_minutes")) || 0)));
  await saveSettings({ idle_timeout_minutes: mins });
  await log(me.id, "Security settings changed", mins ? `Auto sign-out after ${mins} minutes idle` : "Auto sign-out turned off");
  back("Saved");
}

export async function revokeSession(fd: FormData) {
  const me = await requireUser("staff");
  const sid = str(fd, "sid");
  const s = await one<{ name: string }>("SELECT u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1", [sid]);
  await q("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", [sid]);
  await log(me.id, "Session signed out", `Signed out a device of ${s?.name ?? "a user"}`);
  back("Device signed out");
}

export async function unlockUser(fd: FormData) {
  const me = await requireUser("staff");
  const id = Number(str(fd, "id"));
  const u = await one<{ name: string }>("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1 RETURNING name", [id]);
  await log(me.id, "Account unlocked", u?.name ?? "");
  back(`${u?.name ?? "User"} can sign in again`);
}

export async function reset2fa(fd: FormData) {
  const me = await requireUser("staff");
  const id = Number(str(fd, "id"));
  const u = await one<{ name: string }>("UPDATE users SET totp_enabled=FALSE, totp_secret='' WHERE id=$1 RETURNING name", [id]);
  await q("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [id]);
  await log(me.id, "2FA reset by admin", u?.name ?? "");
  back(`Two-step verification reset for ${u?.name ?? "user"}. They can set it up again after signing in.`);
}
