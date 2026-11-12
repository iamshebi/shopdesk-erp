"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { log } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/util";

export async function addSupplier(fd: FormData) {
  const user = await requireUser("suppliers");
  await q("INSERT INTO suppliers (name, phone, email, trn, address) VALUES ($1,$2,$3,$4,$5)", [
    str(fd, "name"), str(fd, "phone"), str(fd, "email"), str(fd, "trn"), str(fd, "address"),
  ]);
  await log(user.id, "Supplier added", str(fd, "name"), "/suppliers");
  revalidatePath("/suppliers");
}
