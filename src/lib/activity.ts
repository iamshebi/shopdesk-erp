import "server-only";
import { q, type Exec } from "./db";

/** Record who did what. Never throws — logging must not break the real action. */
export async function log(userId: number | null, action: string, details = "", ref = "", t?: Exec) {
  try {
    await (t ?? q)("INSERT INTO activity (user_id, action, details, ref) VALUES ($1,$2,$3,$4)", [userId, action, details, ref]);
  } catch (e) {
    console.error("activity log failed", e);
  }
}
