import Submit from "./submit";
import { TASK_PRIORITIES } from "@/lib/tasks";
export default function TaskForm({ action, t = {}, projects, users, back }: { action: (fd: FormData) => Promise<void>; t?: any; projects: { id: number; name: string }[]; users: { id: number; name: string }[]; back?: string }) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      {t.id && <input type="hidden" name="id" value={t.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="sm:col-span-2"><label className="label">Task</label><input name="title" defaultValue={t.title} className="input" required /></div>
      <div><label className="label">Assign to</label><select name="assignee_id" defaultValue={t.assignee_id ?? ""} className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div><label className="label">Due</label><input type="date" name="due_date" defaultValue={t.due_date ?? ""} className="input" /></div>
      <div><label className="label">Project</label><select name="project_id" defaultValue={t.project_id ?? ""} className="input"><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">or new project</label><input name="new_project" className="input" /></div>
      <div><label className="label">Priority</label><select name="priority" defaultValue={t.priority ?? "normal"} className="input">{TASK_PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">Link (order, invoice…)</label><input name="link" defaultValue={t.link} className="input" placeholder="/orders/12" /></div>
      <div className="sm:col-span-4"><label className="label">Details</label><textarea name="description" defaultValue={t.description} rows={2} className="input" /></div>
      <div className="sm:col-span-4"><Submit>{t.id ? "Save task" : "Add task"}</Submit></div>
    </form>
  );
}
