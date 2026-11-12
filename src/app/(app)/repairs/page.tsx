import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, REPAIR_STATUSES, repairLabel } from "@/lib/util";
import { PageHeader, Badge, Empty, repairTone } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function RepairsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("repairs");
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const params: unknown[] = [];
  const where: string[] = [];
  if (status === "open") where.push("r.status NOT IN ('delivered','cancelled')");
  else if (status !== "all") { params.push(status); where.push(`r.status = $${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); const i = params.length; where.push(`(r.number ILIKE $${i} OR r.customer_name ILIKE $${i} OR r.customer_phone ILIKE $${i} OR r.imei ILIKE $${i} OR r.device ILIKE $${i})`); }
  const rows = await q<any>(
    `SELECT r.*, u.name tech FROM repairs r LEFT JOIN users u ON u.id = r.technician_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC LIMIT 300`,
    params,
  );
  const counts = await q<{ status: string; n: number }>("SELECT status, count(*)::int n FROM repairs GROUP BY status");
  const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
  const open = counts.filter((x) => !["delivered", "cancelled"].includes(x.status)).reduce((a, x) => a + x.n, 0);
  const tabs = [{ id: "open", label: "Open", n: open }, ...REPAIR_STATUSES.map((s) => ({ id: s.id, label: s.label, n: c(s.id) })), { id: "all", label: "All", n: undefined }];
  return (
    <div>
      <PageHeader title="Repairs" subtitle="Job cards from drop-off to delivery">
        <Link href="/repairs/new" className="btn-primary"><Plus size={16} /> New job card</Link>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Link key={t.id} href={`/repairs?status=${t.id}`} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${status === t.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {t.label}{t.n !== undefined && <span className="ml-1 opacity-60">{t.n}</span>}
          </Link>
        ))}
        <form className="ml-auto"><input type="hidden" name="status" value="all" /><input name="q" defaultValue={sp.q} placeholder="Search job, customer, IMEI…" className="input h-8 w-56 text-xs" /></form>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No repair jobs here.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Job</th><th>Customer</th><th>Device / issue</th><th>Technician</th><th>Promised</th><th className="text-right">Estimate</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/repairs/${r.id}`} className="font-medium hover:text-accent">{r.number}</Link><div className="text-xs text-slate-400">{fmtDate(r.created_at)}</div></td>
                  <td>{r.customer_name}<div className="text-xs text-slate-400">{r.customer_phone}</div></td>
                  <td className="max-w-xs"><div className="font-medium">{r.device}</div><div className="truncate text-xs text-slate-500">{r.issue}</div></td>
                  <td className="text-slate-500">{r.tech ?? "—"}</td>
                  <td className="text-slate-500">{fmtDate(r.promised_at)}</td>
                  <td className="text-right tabular-nums">{num(r.final_charge ?? r.estimate)}</td>
                  <td><Badge tone={repairTone(r.status)}>{repairLabel(r.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
