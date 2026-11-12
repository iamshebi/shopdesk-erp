"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { str, numf } from "@/lib/util";

export async function updateSettings(fd: FormData) {
  const user = await requireUser("settings");
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
  await log(user.id, "Shop settings changed", "", "/settings");
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
