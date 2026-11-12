import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { ALL_PERMS } from "@/lib/permissions";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import SettingsTabs from "@/components/settings-tabs";
import { Plus, Lock } from "lucide-react";
import { addUser, changeRole, toggleUser, resetPassword } from "./actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser("staff");
  const sp = await searchParams;
  const owner = me.perms.includes("*");
  const roles = await q<any>("SELECT r.*, (SELECT count(*)::int FROM users u WHERE u.role_id=r.id AND u.active) staff FROM roles r ORDER BY r.locked DESC, r.id");
  const users = await q<any>(
    `SELECT u.id, u.name, u.username, u.active, u.role_id, u.last_login_at, u.created_at, r.locked,
       (SELECT count(*)::int FROM sales s WHERE s.created_by=u.id AND s.type='invoice') invoices
     FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.active DESC, u.id`,
  );
  const assignable = roles.filter((r) => owner || !r.locked);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Who can sign in, and what each person is allowed to do" />
      <SettingsTabs active="/settings/staff" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="font-semibold">Roles</h2><p className="text-sm text-slate-500">A role is a set of permissions. Give each staff member one role.</p></div>
          {owner && <Link href="/settings/roles/new" className="btn-primary"><Plus size={16} /> New role</Link>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => {
            const perms: string[] = JSON.parse(r.permissions);
            const count = perms.includes("*") ? ALL_PERMS.length : perms.length;
            const inner = (
              <div className="card h-full p-5 transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">{r.locked && <Lock size={14} className="text-slate-400" />}{r.name}</div>
                  <span className="text-xs text-slate-400">{r.staff} staff</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-accent" style={{ width: `${(count / ALL_PERMS.length) * 100}%` }} /></div>
                <div className="mt-2 text-xs text-slate-500">{r.locked ? "Full access to everything" : `${count} of ${ALL_PERMS.length} permissions`}</div>
              </div>
            );
            return r.locked || !owner ? <div key={r.id}>{inner}</div> : <Link key={r.id} href={`/settings/roles/${r.id}`}>{inner}</Link>;
          })}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="p-6 pb-3"><h2 className="font-semibold">Staff logins</h2></div>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Last sign-in</th><th className="text-right">Invoices</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="font-medium">{u.name} {u.id === me.id && <Badge tone="blue">you</Badge>} {!u.active && <Badge tone="red">disabled</Badge>}</td>
                <td className="font-mono text-xs">{u.username}</td>
                <td>
                  {u.id === me.id || (u.locked && !owner) ? (
                    <span>{roles.find((r) => r.id === u.role_id)?.name}</span>
                  ) : (
                    <form action={changeRole} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role_id" defaultValue={u.role_id} className="input h-8 w-36 text-xs">
                        {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button className="btn-ghost btn-sm">Set</button>
                    </form>
                  )}
                </td>
                <td className="text-slate-500">{u.last_login_at ? fmtDate(u.last_login_at, true) : "never"}</td>
                <td className="text-right"><Link href={`/settings/activity?user=${u.id}`} className="link">{u.invoices}</Link></td>
                <td>
                  <div className="flex justify-end gap-2">
                    <form action={resetPassword} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input name="password" type="password" placeholder="New password" className="input h-8 w-32 text-xs" required minLength={6} />
                      <button className="btn-ghost btn-sm">Reset</button>
                    </form>
                    {u.id !== me.id && !(u.locked && !owner) && (
                      <form action={toggleUser}><input type="hidden" name="id" value={u.id} /><button className="btn-ghost btn-sm">{u.active ? "Disable" : "Enable"}</button></form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addUser} className="grid gap-3 border-t border-slate-100 bg-slate-50/50 p-6 sm:grid-cols-5">
          <input name="name" placeholder="Full name" className="input" required />
          <input name="username" placeholder="Username" className="input" required autoComplete="off" />
          <input name="password" type="password" placeholder="Password (6+)" className="input" required minLength={6} autoComplete="new-password" />
          <select name="role_id" className="input" defaultValue={assignable.find((r) => r.name === "Cashier")?.id ?? assignable[0]?.id}>
            {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Submit>Add staff</Submit>
        </form>
      </section>
      <p className="mt-3 text-xs text-slate-400">Disabled staff can&apos;t sign in, but everything they did stays in the records. Only owners can create roles or other owners.</p>
    </div>
  );
}
