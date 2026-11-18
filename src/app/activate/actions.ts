"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, can } from "@/lib/auth";
import { activate, getLicenseStatus, checkNow } from "@/lib/license";
import { log } from "@/lib/activity";

export async function activateKey(fd: FormData) {
  const user = await requireUser();
  const status = await getLicenseStatus();
  // While the app works, only someone who can change settings enters keys; once it is locked, any staff login can.
  if (!status.locked && !can(user, "settings")) redirect("/activate?err=" + encodeURIComponent("Only the owner or a manager can enter the activation key."));
  let msg = "";
  try {
    const p = await activate(String(fd.get("key") || ""));
    await log(user.id, "Activation key entered", `${p.c} · ${p.p} · until ${p.e}`, "/activate");
  } catch (e) {
    msg = e instanceof Error ? e.message : "Could not activate.";
  }
  revalidatePath("/", "layout");
  redirect(msg ? "/activate?err=" + encodeURIComponent(msg) : "/activate?ok=1");
}

export async function checkWithDollar44() {
  await requireUser();
  await checkNow();
  revalidatePath("/", "layout");
  redirect("/activate");
}
