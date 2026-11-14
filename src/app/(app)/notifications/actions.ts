"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function openNotification(fd: FormData) {
  const user = await requireUser();
  const n = await one<{ link: string }>("UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2 RETURNING link", [Number(fd.get("id")), user.id]);
  redirect(n?.link?.startsWith("/") ? n.link : "/notifications");
}
export async function markAllRead() {
  const user = await requireUser();
  await q("UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [user.id]);
  revalidatePath("/notifications");
}
