import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import SettingsTabs from "@/components/settings-tabs";

const TONE: Record<string, string> = {
  Sale: "green", "Return / refund": "red", "Payment received": "green", "Price changed": "amber", "Stock adjusted": "amber",
  "Unit written off": "red", "Failed login": "red", "Expense deleted": "red", "Staff role changed": "violet", "Role edited": "violet",
  "Backup restored": "red", "Signed in": "slate",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("activity");
  const sp = await searchParams;
  const from = sp.from || new Date(Date.now() - 6 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const to = sp.to || todayDubai();
  const params: unknown[] = [from, to];
  const where = ["(a.created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2"];
  if (sp.user) { params.push(Number(sp.user)); where.push(`a.user_id = $${params.length}`); }
  if (sp.action) { params.push(sp.action); where.push(`a.action = $${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`a.details ILIKE $${params.length}`); }
  if (!sp.logins) where.push("a.action NOT IN ('Signed in')");
  const rows = await q<any>(
    `SELECT a.*, u.name FROM activity a LEFT JOIN users u ON u.id=a.user_id WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC LIMIT 500`,
    params,
  );
  const users = await q<{ id: number; name: string }>("SELECT id, name FROM users ORDER BY name");
  const actions = await q<{ action: string }>("SELECT DISTINCT action FROM activity ORDER BY 1");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Every important action, with who did it and when" />
      <SettingsTabs active="/settings/activity" />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="user" defaultValue={sp.user ?? ""} className="input w-44"><option value="">All staff</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="action" defaultValue={sp.action ?? ""} className="input w-48"><option value="">All actions</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select>
        <input name="q" defaultValue={sp.q} placeholder="Search details (invoice no., IMEI…)" className="input w-56" />
        <input type="date" name="from" defaultValue={from} className="input w-40" />
        <input type="date" name="to" defaultValue={to} className="input w-40" />
        <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" name="logins" defaultChecked={!!sp.logins} /> Show sign-ins</label>
        <button className="btn-dark">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No activity for these filters.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Staff</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(a.created_at, true)}</td>
                  <td className="whitespace-nowrap font-medium">{a.name ?? "—"}</td>
                  <td className="whitespace-nowrap"><Badge tone={TONE[a.action] ?? "blue"}>{a.action}</Badge></td>
                  <td className="text-slate-600">{a.ref ? <Link href={a.ref} className="hover:text-accent">{a.details || "Open"}</Link> : a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
