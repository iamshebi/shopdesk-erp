"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { restoreBackup, resetAllData } from "@/lib/backup";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { loadDemoData } from "@/lib/demo-data";
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

export async function resetEverything(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const me = await requireUser("data");
  if (!me.perms.includes("*")) return { error: "Only an owner can reset the system" };
  const s = await getSettings();
  if (str(fd, "confirm") !== "RESET") return { error: "Type RESET in capital letters to confirm" };
  if (str(fd, "shop").toLowerCase() !== s.shop_name.toLowerCase()) return { error: `Type the shop name exactly: ${s.shop_name}` };
  console.warn(`Factory reset requested by user ${me.id} (${me.username})`);
  await resetAllData();
  revalidatePath("/", "layout");
  redirect("/setup");
}

export async function loadDemo() {
  const me = await requireUser("data");
  const n = await loadDemoData(me.id);
  await log(me.id, "Demo data loaded", `${n} sample records`, "/settings/data");
  revalidatePath("/", "layout");
  redirect(`/settings/data?ok=${encodeURIComponent(n ? `Added ${n} sample records` : "Sample data is already loaded")}`);
}
