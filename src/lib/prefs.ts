import "server-only";
import { q, one } from "./db";

export async function getPref<T>(userId: number, key: string, fallback: T): Promise<T> {
  const r = await one<{ value: T }>("SELECT value FROM user_prefs WHERE user_id=$1 AND key=$2", [userId, key]);
  return (r?.value as T) ?? fallback;
}
export async function setPref(userId: number, key: string, value: unknown) {
  await q("INSERT INTO user_prefs (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO UPDATE SET value=$3", [userId, key, JSON.stringify(value)]);
}
export interface PageRef { href: string; title: string }
