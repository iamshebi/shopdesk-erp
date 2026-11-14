import "server-only";
import { q } from "./db";

/** In-app notification for one user (bell in the sidebar). Never throws. */
export async function notify(userId: number | null | undefined, title: string, link = "", kind = "info") {
  if (!userId) return;
  try { await q("INSERT INTO notifications (user_id, title, link, kind) VALUES ($1,$2,$3,$4)", [userId, title.slice(0, 200), link, kind]); } catch (e) { console.error("notify", e); }
}

/** Notify every active user that has one of these permissions (owners always). */
export async function notifyPerm(perms: string[], title: string, link = "", kind = "info", exceptUserId?: number) {
  try {
    const users = await q<{ id: number }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.active AND (r.permissions::jsonb ? '*' OR r.permissions::jsonb ?| $1::text[])`,
      [perms],
    );
    for (const u of users) if (u.id !== exceptUserId) await notify(u.id, title, link, kind);
  } catch (e) { console.error("notifyPerm", e); }
}
