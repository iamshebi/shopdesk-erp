"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { log } from "@/lib/activity";
import { str } from "@/lib/util";

export async function restore(_: unknown, fd: FormData): Promise<{ error?: string; ok?: string }> {
  const me = await requireUser("data");
  if (!me.perms.includes("*")) return { error: "Only an owner can restore a backup" };
  if (str(fd, "confirm") !== "RESTORE") return { error: "Type RESTORE to confirm" };
  const file = fd.get("file");
  if (!file || typeof file !== "object" || !("text" in file) || file.size === 0) return { error: "Choose the backup file (.json)" };
  let data: any;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: "That file isn't a valid backup" };
  }
  try {
    await restoreBackup(data);
  } catch (e: any) {
    console.error(e);
    return { error: e?.message || "Restore failed — nothing was changed" };
  }
  await log(me.id, "Backup restored", `from ${data.created_at ?? "file"}`, "/settings/data");
  revalidatePath("/", "layout");
  return { ok: `Restored the backup from ${data.created_at?.slice(0, 16).replace("T", " ") ?? "file"}. If you can't see your account, sign in again.` };
}
