import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import { openNotification, markAllRead } from "./actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await q<any>("SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 200", [user.id]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" subtitle={`${rows.filter((r) => !r.read_at).length} unread`}>
        <form action={markAllRead}><Submit className="btn-ghost">Mark all as read</Submit></form>
      </PageHeader>
      <div className="card divide-y divide-slate-100">
        {rows.map((n) => (
          <form key={n.id} action={openNotification}>
            <input type="hidden" name="id" value={n.id} />
            <button className={`flex w-full items-start gap-3 p-4 text-left text-sm hover:bg-slate-50 ${n.read_at ? "text-slate-500" : "font-medium"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
              <span className="flex-1">{n.title}<span className="block text-xs font-normal text-slate-400">{fmtDate(n.created_at, true)}</span></span>
            </button>
          </form>
        ))}
        {rows.length === 0 && <div className="p-6 text-sm text-slate-400">Nothing yet. New website orders, approvals, tasks given to you and low-stock alerts appear here.</div>}
      </div>
    </div>
  );
}
