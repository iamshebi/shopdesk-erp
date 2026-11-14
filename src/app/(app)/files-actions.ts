"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { FILE_KINDS, MAX_FILE } from "@/lib/files";

function back(fd: FormData, msg: string, kind: "ok" | "err" = "ok"): never {
  const b = String(fd.get("back") || "/");
  redirect(`${b}${b.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

export async function uploadFiles(fd: FormData) {
  const kind = String(fd.get("kind"));
  const cfg = FILE_KINDS[kind];
  if (!cfg) back(fd, "Unknown file type", "err");
  const user = await requireUser(cfg.perm);
  const ownerId = Number(fd.get("owner_id"));
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) back(fd, "Choose a file first", "err");
  let n = 0;
  for (const f of files) {
    if (f.size > MAX_FILE) back(fd, `${f.name} is over 3 MB. Please use a smaller file.`, "err");
    if (cfg.images && !f.type.startsWith("image/")) back(fd, `${f.name} is not an image`, "err");
    const buf = Buffer.from(await f.arrayBuffer());
    const [{ s }] = await q<{ s: number }>("SELECT COALESCE(max(sort),0)+1 s FROM files WHERE kind=$1 AND owner_id=$2", [kind, ownerId]);
    await q("INSERT INTO files (kind, owner_id, name, mime, size, data, sort, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [kind, ownerId, f.name.slice(0, 200), f.type || "application/octet-stream", f.size, buf, s, user.id]);
    n++;
  }
  if (kind === "product") {
    const first = await one<{ id: number }>("SELECT id FROM files WHERE kind='product' AND owner_id=$1 ORDER BY sort, id LIMIT 1", [ownerId]);
    if (first) await q("UPDATE products SET image_url = CASE WHEN image_url='' OR image_url LIKE '/api/files/%' THEN $2 ELSE image_url END, updated_at=now() WHERE id=$1", [ownerId, `/api/files/${first.id}`]);
  }
  await log(user.id, "Files uploaded", `${n} × ${cfg.label} (${kind} #${ownerId})`);
  revalidatePath(String(fd.get("back") || "/"));
  back(fd, `${n} file(s) uploaded`);
}

export async function deleteFile(fd: FormData) {
  const id = Number(fd.get("id"));
  const f = await one<{ kind: string; owner_id: number; name: string }>("SELECT kind, owner_id, name FROM files WHERE id=$1", [id]);
  if (!f) back(fd, "File not found", "err");
  const user = await requireUser(FILE_KINDS[f.kind]?.perm ?? "settings");
  await q("DELETE FROM files WHERE id=$1", [id]);
  if (f.kind === "product") {
    const first = await one<{ id: number }>("SELECT id FROM files WHERE kind='product' AND owner_id=$1 ORDER BY sort, id LIMIT 1", [f.owner_id]);
    await q("UPDATE products SET image_url=$2, updated_at=now() WHERE id=$1 AND image_url=$3", [f.owner_id, first ? `/api/files/${first.id}` : "", `/api/files/${id}`]);
  }
  await log(user.id, "File deleted", f.name);
  back(fd, "File deleted");
}

export async function makeMainImage(fd: FormData) {
  await requireUser("products.edit");
  const id = Number(fd.get("id"));
  const f = await one<{ owner_id: number }>("SELECT owner_id FROM files WHERE id=$1 AND kind='product'", [id]);
  if (f) {
    await q("UPDATE files SET sort = sort + 1 WHERE kind='product' AND owner_id=$1", [f.owner_id]);
    await q("UPDATE files SET sort = 0 WHERE id=$1", [id]);
    await q("UPDATE products SET image_url=$2, updated_at=now() WHERE id=$1", [f.owner_id, `/api/files/${id}`]);
  }
  back(fd, "Main image set");
}
