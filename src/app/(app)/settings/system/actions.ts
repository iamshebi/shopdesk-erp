"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
export async function clearErrors() {
  await requireUser("settings");
  await q("DELETE FROM error_log");
  revalidatePath("/settings/system");
}
