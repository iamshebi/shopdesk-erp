"use server";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { str } from "@/lib/util";

const P = "/products/catalog";
function go(msg: string, kind: "ok" | "err" = "ok"): never { redirect(`${P}?${kind}=${encodeURIComponent(msg)}`); }

export async function saveCategory(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(str(fd, "id")), name = str(fd, "name"), parent = Number(str(fd, "parent_id")) || null;
  if (!name) go("Name is required", "err");
  if (id && parent === id) go("A category cannot be inside itself", "err");
  try {
    if (id) {
      const old = await one<{ name: string }>("SELECT name FROM categories WHERE id=$1", [id]);
      await q("UPDATE categories SET name=$2, parent_id=$3, description=$4 WHERE id=$1", [id, name, parent, str(fd, "description")]);
      if (old && old.name !== name) await q("UPDATE products SET category=$2, updated_at=now() WHERE category=$1", [old.name, name]);
    } else await q("INSERT INTO categories (name, parent_id, description) VALUES ($1,$2,$3)", [name, parent, str(fd, "description")]);
  } catch { go(`“${name}” already exists`, "err"); }
  await log(user.id, "Category saved", name, P);
  go("Saved");
}

export async function deleteCategory(fd: FormData) {
  await requireUser("products.edit");
  const id = Number(str(fd, "id"));
  const c = await one<{ name: string }>("SELECT name FROM categories WHERE id=$1", [id]);
  const used = await one<{ n: number }>("SELECT count(*)::int n FROM products WHERE category=$1", [c?.name ?? ""]);
  if (used?.n) go(`${used.n} product(s) still use “${c?.name}”. Move them first (Products → select → Category).`, "err");
  await q("DELETE FROM categories WHERE id=$1", [id]);
  go("Category deleted");
}

export async function saveBrand(fd: FormData) {
  const user = await requireUser("products.edit");
  const id = Number(str(fd, "id")), name = str(fd, "name");
  if (!name) go("Name is required", "err");
  try {
    if (id) {
      const old = await one<{ name: string }>("SELECT name FROM brands WHERE id=$1", [id]);
      await q("UPDATE brands SET name=$2, website=$3 WHERE id=$1", [id, name, str(fd, "website")]);
      if (old && old.name !== name) await q("UPDATE products SET brand=$2, updated_at=now() WHERE brand=$1", [old.name, name]);
    } else await q("INSERT INTO brands (name, website) VALUES ($1,$2)", [name, str(fd, "website")]);
  } catch { go(`“${name}” already exists`, "err"); }
  await log(user.id, "Brand saved", name, P);
  go("Saved");
}

export async function deleteBrand(fd: FormData) {
  await requireUser("products.edit");
  const id = Number(str(fd, "id"));
  const b = await one<{ name: string }>("SELECT name FROM brands WHERE id=$1", [id]);
  const used = await one<{ n: number }>("SELECT count(*)::int n FROM products WHERE brand=$1", [b?.name ?? ""]);
  if (used?.n) go(`${used.n} product(s) still use “${b?.name}”.`, "err");
  await q("DELETE FROM brands WHERE id=$1", [id]);
  go("Brand deleted");
}
