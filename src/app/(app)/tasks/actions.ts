"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { TASK_COLUMNS } from "@/lib/tasks";
import { str } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function saveTask(fd: FormData) {
  const user = await requireUser("tasks");
  const id = Number(str(fd, "id"));
  const title = str(fd, "title");
  const back = str(fd, "back") || "/tasks";
  if (!title) go(back, "Title is required", "err");
  let project: number | null = Number(str(fd, "project_id")) || null;
  const newProject = str(fd, "new_project");
  if (newProject) project = (await one<{ id: number }>("INSERT INTO projects (name, created_by) VALUES ($1,$2) RETURNING id", [newProject, user.id]))!.id;
  const f = [title, str(fd, "description"), project, Number(str(fd, "assignee_id")) || null, str(fd, "priority") || "normal", str(fd, "due_date") || null, str(fd, "link")];
  let tid = id;
  if (id) await q("UPDATE tasks SET title=$2, description=$3, project_id=$4, assignee_id=$5, priority=$6, due_date=$7, link=$8, updated_at=now() WHERE id=$1", [id, ...f]);
  else tid = (await one<{ id: number }>("INSERT INTO tasks (title, description, project_id, assignee_id, priority, due_date, link, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [...f, user.id]))!.id;
  await log(user.id, id ? "Task edited" : "Task added", title, `/tasks/${tid}`);
  revalidatePath("/tasks");
  go(id ? `/tasks/${tid}` : back, "Saved");
}

export async function moveTask(fd: FormData) {
  await requireUser("tasks");
  const id = Number(str(fd, "id")), status = str(fd, "status");
  if (TASK_COLUMNS.some((c) => c.id === status)) await q("UPDATE tasks SET status=$2, updated_at=now(), done_at = CASE WHEN $2='done' THEN now() ELSE NULL END WHERE id=$1", [id, status]);
  revalidatePath("/tasks");
  go(str(fd, "back") || "/tasks");
}

export async function commentTask(fd: FormData) {
  const user = await requireUser("tasks");
  const id = Number(str(fd, "id")), body = str(fd, "body");
  if (body) await q("INSERT INTO task_comments (task_id, body, user_id) VALUES ($1,$2,$3)", [id, body, user.id]);
  go(`/tasks/${id}`);
}

export async function deleteTask(fd: FormData) {
  await requireUser("tasks");
  await q("DELETE FROM tasks WHERE id=$1", [Number(str(fd, "id"))]);
  revalidatePath("/tasks");
  go("/tasks", "Task deleted");
}

export async function setProjectStatus(fd: FormData) {
  await requireUser("tasks");
  await q("UPDATE projects SET status=$2 WHERE id=$1", [Number(str(fd, "id")), str(fd, "status") === "done" ? "done" : "active"]);
  go("/tasks?view=projects");
}
