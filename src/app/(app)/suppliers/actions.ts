"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export async function updateSupplier(fd: FormData) {
  const user = await requireUser("suppliers");
  const id = Number(fd.get("id"));
  const name = str(fd, "name");
  if (!id || !name) redirect(`/suppliers/${id}?err=${encodeURIComponent("Supplier name is needed")}`);
  const [before] = await q<{ name: string; phone: string; email: string; trn: string; address: string }>("SELECT name, phone, email, trn, address FROM suppliers WHERE id=$1", [id]);
  if (!before) redirect("/suppliers");
  const after = { name, phone: str(fd, "phone"), email: str(fd, "email"), trn: str(fd, "trn"), address: str(fd, "address") };
  await q("UPDATE suppliers SET name=$1, phone=$2, email=$3, trn=$4, address=$5 WHERE id=$6", [after.name, after.phone, after.email, after.trn, after.address, id]);
  const changes = (Object.keys(after) as (keyof typeof after)[]).filter((k) => (before[k] ?? "") !== after[k]).map((k) => `${k}: ${before[k] || "—"} → ${after[k] || "—"}`);
  await log(user.id, "Supplier edited", `${name}${changes.length ? ` · ${changes.join(", ")}` : ""}`, `/suppliers/${id}`);
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  redirect(`/suppliers/${id}?saved=1`);
}

export async function deleteSupplier(fd: FormData) {
  const user = await requireUser("suppliers");
  const id = Number(fd.get("id"));
  const [s] = await q<{ name: string }>("SELECT name FROM suppliers WHERE id=$1", [id]);
  if (!s) redirect("/suppliers");
  try {
    await q("DELETE FROM suppliers WHERE id=$1", [id]);
  } catch {
    // Bills, purchase orders, returns or products still point to this supplier: keep the history intact.
    redirect(`/suppliers/${id}?err=${encodeURIComponent("This supplier has bills, orders or products linked to it, so it can't be deleted. You can still edit the details.")}`);
  }
  await log(user.id, "Supplier deleted", s.name, "/suppliers");
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
