"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/util";

export async function updateCustomer(fd: FormData) {
  await requireUser("customers");
  const id = Number(fd.get("id"));
  await q("UPDATE customers SET name=$1, phone=$2, email=$3, trn=$4, address=$5 WHERE id=$6", [str(fd, "name"), str(fd, "phone"), str(fd, "email"), str(fd, "trn"), str(fd, "address"), id]);
  revalidatePath(`/customers/${id}`);
}
