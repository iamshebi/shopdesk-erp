import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TASK_COLUMNS } from "@/lib/tasks";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import TaskForm from "@/components/task-form";
import { saveTask, moveTask, commentTask, deleteTask } from "../actions";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("tasks");
  const { id } = await params;
  const sp = await searchParams;
  const t = await one<any>("SELECT t.*, to_char(t.due_date,'YYYY-MM-DD') due_date, u.name creator FROM tasks t LEFT JOIN users u ON u.id=t.created_by WHERE t.id=$1", [Number(id)]);
  if (!t) notFound();
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const projects = await q<any>("SELECT id, name FROM projects ORDER BY name");
  const comments = await q<any>("SELECT c.*, u.name FROM task_comments c LEFT JOIN users u ON u.id=c.user_id WHERE task_id=$1 ORDER BY c.id", [t.id]);
  const back = `/tasks/${t.id}`;
  return (
    <div className="max-w-4xl">
      <PageHeader title={t.title} subtitle={`Created ${fmtDate(t.created_at)} by ${t.creator ?? "—"}`}>
        <Badge tone={t.status === "done" ? "green" : "blue"}>{TASK_COLUMNS.find((c) => c.id === t.status)?.label}</Badge>
        {t.link?.startsWith("/") && <Link href={t.link} className="btn-ghost">Open linked record</Link>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <div className="card mb-4 flex flex-wrap gap-2 p-4">
        {TASK_COLUMNS.filter((c) => c.id !== t.status).map((c) => <form key={c.id} action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={c.id} /><input type="hidden" name="back" value={back} /><Submit className="btn-ghost btn-sm">{c.label}</Submit></form>)}
        <form action={deleteTask} className="ml-auto"><input type="hidden" name="id" value={t.id} /><Submit className="btn-danger btn-sm">Delete</Submit></form>
      </div>
      <div className="card mb-6 p-6"><TaskForm action={saveTask} t={t} projects={projects} users={users} /></div>
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">Comments</h3>
        {comments.map((c) => <div key={c.id} className="mb-3 text-sm"><div className="text-xs text-slate-400">{c.name ?? "—"} · {fmtDate(c.created_at, true)}</div><div className="whitespace-pre-wrap">{c.body}</div></div>)}
        <form action={commentTask} className="flex gap-2"><input type="hidden" name="id" value={t.id} /><input name="body" className="input flex-1" placeholder="Write a comment" /><Submit className="btn-dark">Post</Submit></form>
      </div>
    </div>
  );
}
