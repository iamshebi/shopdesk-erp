import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { makeBackup } from "@/lib/backup";
import { log } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Full backup as a JSON file. The desktop app also calls this with the local backup key for automatic daily backups.
export async function GET(req: Request) {
  const key = req.headers.get("x-backup-key");
  let userId: number | null = null;
  if (!(key && process.env.BACKUP_KEY && key === process.env.BACKUP_KEY)) {
    const user = await requireUser("data");
    userId = user.id;
  }
  const s = await getSettings();
  const data = await makeBackup();
  if (userId) await log(userId, "Backup downloaded", "", "/settings/data");
  const name = `${s.shop_name.replace(/[^\w]+/g, "-")}-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
