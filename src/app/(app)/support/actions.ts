"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx, nextNumber } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { TICKET_STATUSES, PRIORITIES } from "@/lib/support";
import { str } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function createTicket(fd: FormData) {
  const user = await requireUser("support");
  const subject = str(fd, "subject");
  if (!subject) go("/support?new=1", "Subject is required", "err");
  const name = str(fd, "customer_name"), phone = str(fd, "customer_phone");
  const id = await tx(async (t) => {
    let cid: number | null = Number(str(fd, "customer_id")) || null;
    if (!cid && phone) cid = (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [phone]))[0]?.id ?? null;
    if (!cid && phone && name) cid = (await t<{ id: number }>("INSERT INTO customers (name, phone) VALUES ($1,$2) RETURNING id", [name, phone]))[0].id;
    const number = await nextNumber(t, "ticket", "TKT-");
    const [r] = await t<{ id: number }>(
      `INSERT INTO tickets (number, customer_id, customer_name, customer_phone, subject, category, priority, channel, reference, assignee_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [number, cid, name, phone, subject, str(fd, "category") || "inquiry", str(fd, "priority") || "normal", str(fd, "channel") || "shop", str(fd, "reference"), Number(str(fd, "assignee_id")) || null, user.id],
    );
    const body = str(fd, "body");
    if (body) await t("INSERT INTO ticket_messages (ticket_id, body, user_id) VALUES ($1,$2,$3)", [r.id, body, user.id]);
    return r.id;
  });
  await log(user.id, "Ticket opened", subject, `/support/${id}`);
  revalidatePath("/support");
  go(`/support/${id}`, "Ticket opened");
}

export async function updateTicket(fd: FormData) {
  const user = await requireUser("support");
  const id = Number(str(fd, "id"));
  const before = await one<any>("SELECT * FROM tickets WHERE id=$1", [id]);
  if (!before) go("/support");
  const status = TICKET_STATUSES.some((s) => s.id === str(fd, "status")) ? str(fd, "status") : before.status;
  const priority = PRIORITIES.some((s) => s.id === str(fd, "priority")) ? str(fd, "priority") : before.priority;
  const assignee = str(fd, "assignee_id") === "" ? null : Number(str(fd, "assignee_id"));
  await q(
    `UPDATE tickets SET status=$2, priority=$3, assignee_id=$4, updated_at=now(),
       resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE NULL END WHERE id=$1`,
    [id, status, priority, assignee],
  );
  const changes: string[] = [];
  if (status !== before.status) changes.push(`status → ${status}`);
  if (priority !== before.priority) changes.push(`priority → ${priority}`);
  if ((assignee ?? null) !== (before.assignee_id ?? null)) {
    const u = assignee ? await one<{ name: string }>("SELECT name FROM users WHERE id=$1", [assignee]) : null;
    changes.push(`assigned to ${u?.name ?? "nobody"}`);
  }
  if (changes.length) await q("INSERT INTO ticket_messages (ticket_id, body, internal, user_id) VALUES ($1,$2,TRUE,$3)", [id, changes.join(", "), user.id]);
  revalidatePath(`/support/${id}`);
  go(`/support/${id}`, "Updated");
}

export async function replyTicket(fd: FormData) {
  const user = await requireUser("support");
  const id = Number(str(fd, "id"));
  const body = str(fd, "body");
  if (!body) go(`/support/${id}`, "Write a message first", "err");
  await q("INSERT INTO ticket_messages (ticket_id, body, internal, user_id) VALUES ($1,$2,$3,$4)", [id, body, str(fd, "internal") === "on", user.id]);
  const st = str(fd, "then");
  await q(`UPDATE tickets SET updated_at=now() ${st ? ", status=$2, resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE NULL END" : ""} WHERE id=$1`, st ? [id, st] : [id]);
  revalidatePath(`/support/${id}`);
  go(`/support/${id}`, "Added");
}

export async function saveArticle(fd: FormData) {
  const user = await requireUser("support");
  const id = Number(str(fd, "id"));
  const title = str(fd, "title");
  if (!title) go("/support/kb", "Title is required", "err");
  const f = [title, str(fd, "body"), str(fd, "category") || "General", str(fd, "published") === "on"];
  if (id) await q("UPDATE kb_articles SET title=$2, body=$3, category=$4, published=$5, updated_at=now() WHERE id=$1", [id, ...f]);
  else await q("INSERT INTO kb_articles (title, body, category, published, created_by) VALUES ($1,$2,$3,$4,$5)", [...f, user.id]);
  revalidatePath("/support/kb");
  go("/support/kb", "Article saved");
}

export async function deleteArticle(fd: FormData) {
  await requireUser("support");
  await q("DELETE FROM kb_articles WHERE id=$1", [Number(str(fd, "id"))]);
  revalidatePath("/support/kb");
  go("/support/kb", "Deleted");
}
