"use server";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createSale, SaleError, type SaleInput } from "@/lib/sales";

export async function checkout(payload: Omit<SaleInput, "userId">): Promise<{ id?: number; error?: string }> {
  const user = await requireUser("pos");
  const s = await getSettings();
  try {
    const id = await tx((t) => createSale(t, s, { ...payload, userId: user.id }));
    revalidatePath("/");
    revalidatePath("/sales");
    revalidatePath("/products");
    return { id };
  } catch (e) {
    if (e instanceof SaleError) return { error: e.message };
    console.error(e);
    return { error: "Could not save the sale. Please try again." };
  }
}
