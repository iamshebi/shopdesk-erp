import { closeDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Called only by the desktop app (with its private key) so the database closes cleanly before the app quits.
export async function POST(req: Request) {
  const key = req.headers.get("x-backup-key");
  if (!process.env.BACKUP_KEY || key !== process.env.BACKUP_KEY) return new Response("Forbidden", { status: 403 });
  await closeDb();
  setTimeout(() => process.exit(0), 100);
  return new Response("ok");
}
