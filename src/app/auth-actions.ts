"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { one, q } from "@/lib/db";
import { startSession, endSession, startPending2fa, pending2faUser, clientInfo, MAX_FAILED_LOGINS, LOCK_MINUTES } from "@/lib/auth";
import { verifyTotp, decryptField } from "@/lib/totp";
import { saveSettings } from "@/lib/settings";
import { str } from "@/lib/util";
import { log } from "@/lib/activity";
import { loadDemoData } from "@/lib/demo-data";

async function recordLogin(userId: number | null, username: string, success: boolean, reason = "") {
  const { ip, ua } = await clientInfo();
  await q("INSERT INTO login_events (user_id, username, success, reason, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)", [userId, username, success, reason, ip, ua]);
}

export async function login(_: unknown, fd: FormData) {
  const username = str(fd, "username").toLowerCase();
  const password = str(fd, "password");
  const u = await one<{ id: number; password_hash: string; totp_enabled: boolean; locked: boolean; mins: number }>(
    `SELECT id, password_hash, totp_enabled, (locked_until IS NOT NULL AND locked_until > now()) AS locked,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (locked_until - now())) / 60))::int AS mins
     FROM users WHERE lower(username) = $1 AND active`,
    [username],
  );
  if (u?.locked) {
    await recordLogin(u.id, username, false, "Account locked");
    return { error: `Too many wrong passwords. Try again in ${u.mins} minute${u.mins === 1 ? "" : "s"}, or ask the owner to unlock you.` };
  }
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    await recordLogin(u?.id ?? null, username, false, u ? "Wrong password" : "Unknown username");
    await log(u?.id ?? null, "Failed login", `username “${username}”`);
    if (u) {
      const r = await one<{ failed_logins: number }>(
        `UPDATE users SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
         WHERE id=$1 RETURNING failed_logins`,
        [u.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)],
      );
      if ((r?.failed_logins ?? 0) >= MAX_FAILED_LOGINS) {
        await log(u.id, "Account locked", `${MAX_FAILED_LOGINS} wrong passwords for “${username}”, locked for ${LOCK_MINUTES} minutes`);
        return { error: `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.` };
      }
    }
    return { error: "Wrong username or password" };
  }
  if (u.totp_enabled) {
    await startPending2fa(u.id);
    redirect("/login/2fa");
  }
  await finishLogin(u.id, username);
  redirect("/");
}

async function finishLogin(userId: number, username: string) {
  await q("UPDATE users SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id=$1", [userId]);
  await recordLogin(userId, username, true);
  await log(userId, "Signed in");
  await startSession(userId);
}

export async function verify2fa(_: unknown, fd: FormData) {
  const uid = await pending2faUser();
  if (!uid) redirect("/login");
  const u = await one<{ username: string; totp_secret: string }>("SELECT username, totp_secret FROM users WHERE id=$1 AND active AND totp_enabled", [uid]);
  if (!u) redirect("/login");
  const ok = verifyTotp(await decryptField(u.totp_secret), str(fd, "code"));
  if (!ok) {
    await recordLogin(uid, u.username, false, "Wrong 2FA code");
    return { error: "That code is not right. Check the time on your phone and try the newest code." };
  }
  await finishLogin(uid, u.username);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function idleLogout() {
  await endSession();
  redirect("/login?idle=1");
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
    "INSERT INTO users (name, username, password_hash, role, role_id) VALUES ($1, $2, $3, 'owner', (SELECT id FROM roles WHERE locked ORDER BY id LIMIT 1)) RETURNING id",
    [name, username, hash],
  );
  await log(rows[0].id, "Shop created", shop_name);
  if (fd.get("demo") === "on") {
    const n = await loadDemoData(rows[0].id);
    await log(rows[0].id, "Demo data loaded", `${n} sample records`);
  }
  await startSession(rows[0].id);
  redirect("/settings?welcome=1");
}
