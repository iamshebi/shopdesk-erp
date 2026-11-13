import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TASK_COLUMNS, prio } from "@/lib/tasks";
import { fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import TaskForm from "@/components/task-form";
import { saveTask, moveTask, setProjectStatus } from "./actions";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("tasks");
  const sp = await searchParams;
  const today = todayDubai();
  const users = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  const projects = await q<any>(`SELECT p.*, count(t.id)::int n, count(t.id) FILTER (WHERE t.status='done')::int done FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.status, p.name`);
  const params: unknown[] = [];
  const where: string[] = ["(t.status <> 'done' OR t.done_at > now() - interval '14 days')"];
  if (sp.mine) { params.push(user.id); where.push(`t.assignee_id=$${params.length}`); }
  if (sp.project) { params.push(Number(sp.project)); where.push(`t.project_id=$${params.length}`); }
  const tasks = await q<any>(`SELECT t.*, to_char(t.due_date,'YYYY-MM-DD') due, u.name assignee, p.name project FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN projects p ON p.id=t.project_id
    WHERE ${where.join(" AND ")} ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.due_date NULLS LAST, t.id`, params);
  const qs = (extra: Record<string, string>) => "/tasks?" + new URLSearchParams({ ...(sp.mine ? { mine: "1" } : {}), ...(sp.project ? { project: sp.project } : {}), ...extra }).toString();
  const back = qs({});
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Team to-dos and projects on a board" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <details className="card mb-4 p-5" open={!!sp.add}><summary className="cursor-pointer font-semibold">+ Add task</summary><div className="mt-4"><TaskForm action={saveTask} projects={projects.filter((p) => p.status === "active")} users={users} back={back} /></div></details>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/tasks" className={`rounded-full border px-3 py-1 ${!sp.mine && !sp.project && !sp.view ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>All tasks</Link>
        <Link href="/tasks?mine=1" className={`rounded-full border px-3 py-1 ${sp.mine ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>My tasks</Link>
        <Link href="/tasks?view=projects" className={`rounded-full border px-3 py-1 ${sp.view ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>Projects</Link>
        {projects.filter((p) => p.status === "active").map((p) => <Link key={p.id} href={`/tasks?project=${p.id}`} className={`rounded-full border px-3 py-1 ${sp.project === String(p.id) ? "border-accent bg-accent/10 text-accent" : "border-slate-200 text-slate-600"}`}>{p.name}</Link>)}
      </div>
      {sp.view === "projects" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex justify-between"><Link href={`/tasks?project=${p.id}`} className="font-semibold hover:text-accent">{p.name}</Link><Badge tone={p.status === "done" ? "green" : "blue"}>{p.status}</Badge></div>
              <div className="mt-3 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-accent" style={{ width: `${p.n ? Math.round((p.done / p.n) * 100) : 0}%` }} /></div>
              <div className="mt-1 text-xs text-slate-500">{p.done} of {p.n} tasks done</div>
              <form action={setProjectStatus} className="mt-3"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "done" ? "active" : "done"} /><Submit className="btn-ghost btn-sm">{p.status === "done" ? "Reopen" : "Mark complete"}</Submit></form>
            </div>
          ))}
          {projects.length === 0 && <div className="card p-5 text-sm text-slate-400">No projects yet. Type a new project name when adding a task.</div>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_COLUMNS.map((col, ci) => {
            const list = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="rounded-2xl bg-slate-100 p-3">
                <div className="mb-2 px-1 text-sm font-semibold">{col.label} <span className="font-normal text-slate-500">{list.length}</span></div>
                <div className="space-y-2">
                  {list.map((t) => {
                    const [, pl, pt] = prio(t.priority);
                    return (
                      <div key={t.id} className="card p-3 text-sm">
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:text-accent">{t.title}</Link>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">{t.priority !== "normal" && <Badge tone={pt}>{pl}</Badge>}{t.project && <span className="text-slate-400">{t.project}</span>}</div>
                        <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{t.assignee ?? "Unassigned"}</span>{t.due && <span className={t.due < today && t.status !== "done" ? "font-medium text-red-600" : ""}>{fmtDate(t.due)}</span>}</div>
                        <div className="mt-2 flex gap-1">
                          {ci > 0 && <form action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={TASK_COLUMNS[ci - 1].id} /><input type="hidden" name="back" value={back} /><Submit className="btn-ghost btn-sm">← Back</Submit></form>}
                          {ci < TASK_COLUMNS.length - 1 && <form action={moveTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={TASK_COLUMNS[ci + 1].id} /><input type="hidden" name="back" value={back} /><Submit className="btn-ghost btn-sm">{TASK_COLUMNS[ci + 1].label} →</Submit></form>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
