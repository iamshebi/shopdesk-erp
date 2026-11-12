"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { str, numf } from "@/lib/util";

export async function updateSettings(fd: FormData) {
  await requireUser("settings");
  await saveSettings({
    shop_name: str(fd, "shop_name") || "My Shop",
    shop_name_ar: str(fd, "shop_name_ar"),
    legal_name: str(fd, "legal_name"),
    trn: str(fd, "trn"),
    address: str(fd, "address"),
    emirate: str(fd, "emirate"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    website: str(fd, "website"),
    logo: str(fd, "logo"),
    accent: str(fd, "accent") || "#0f766e",
    vat_registered: fd.get("vat_registered") === "on",
    vat_rate: numf(fd, "vat_rate"),
    prices_include_vat: fd.get("prices_include_vat") === "on",
    invoice_prefix: str(fd, "invoice_prefix") || "INV-",
    invoice_terms: str(fd, "invoice_terms"),
    repair_terms: str(fd, "repair_terms"),
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function addUser(fd: FormData) {
  await requireUser("settings");
  const password = str(fd, "password");
  if (password.length < 6) redirect("/settings?err=Password+must+be+6%2B+characters");
  try {
    await q("INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)", [
      str(fd, "name"),
      str(fd, "username").toLowerCase(),
      await bcrypt.hash(password, 10),
      str(fd, "role"),
    ]);
  } catch {
    redirect("/settings?err=Username+already+taken");
  }
  revalidatePath("/settings");
}

export async function toggleUser(fd: FormData) {
  const me = await requireUser("settings");
  const id = Number(fd.get("id"));
  if (id === me.id) return;
  await q("UPDATE users SET active = NOT active WHERE id = $1", [id]);
  revalidatePath("/settings");
}

export async function resetPassword(fd: FormData) {
  await requireUser("settings");
  const password = str(fd, "password");
  if (password.length < 6) redirect("/settings?err=Password+must+be+6%2B+characters");
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 10), Number(fd.get("id"))]);
  redirect("/settings?saved=1");
}
