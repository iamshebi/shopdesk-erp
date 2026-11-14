import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import CrmTabs from "../tabs";
import { SEGMENTS, SEGMENT_BASE } from "@/lib/segments";



export default async function SegmentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("crm");
  const sp = await searchParams;
  const s = await getSettings();
  const seg = SEGMENTS[sp.s ?? "all"] ? sp.s ?? "all" : "all";
  const params: unknown[] = [];
  let extra = "";
  if (sp.group) { params.push(sp.group); extra += ` AND group_name = $${params.length}`; }
  if (sp.tag) { params.push(`%${sp.tag}%`); extra += ` AND tags ILIKE $${params.length}`; }
  const base = SEGMENT_BASE;
  const rows = await q<any>(`SELECT * FROM (${base}) x WHERE ${SEGMENTS[seg].where} ${extra} ORDER BY spent DESC LIMIT 500`, params);
  const groups = await q<{ g: string }>("SELECT DISTINCT group_name g FROM customers WHERE group_name <> '' ORDER BY 1");
  const csv = "data:text/csv;charset=utf-8," + encodeURIComponent(["Name,Phone,Email,Group,Spent,Invoices", ...rows.map((r) => [r.name, r.phone, r.email, r.group_name, Number(r.spent).toFixed(2), r.invoices].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n"));
  return (
    <div>
      <PageHeader title="Customer segments" subtitle="Find groups of customers for offers and follow-ups" />
      <CrmTabs active="/crm/segments" />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(SEGMENTS).map(([k, v]) => <Link key={k} href={`/crm/segments?s=${k}`} className={`rounded-full border px-3 py-1 text-sm ${seg === k ? "border-accent bg-accent/10 font-medium text-accent" : "border-slate-200 text-slate-600"}`}>{v.label}</Link>)}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="s" value={seg} />
        <select name="group" defaultValue={sp.group ?? ""} className="input w-44"><option value="">Any group</option>{groups.map((g) => <option key={g.g}>{g.g}</option>)}</select>
        <input name="tag" defaultValue={sp.tag} placeholder="Tag…" className="input w-40" />
        <button className="btn-dark">Filter</button>
        <Link href="/marketing/campaigns?new=1" className="btn-ghost">Message this segment</Link>
        <a href={csv} download={`customers-${seg}.csv`} className="btn-ghost">Export {rows.length} to CSV</a>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Customer</th><th>Group</th><th>Tags</th><th className="text-right">Invoices</th><th className="text-right">Spent ({s.currency})</th><th>Last buy</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/customers/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link><div className="text-xs text-slate-400">{r.phone}</div></td>
                <td>{r.group_name || "—"}</td><td className="text-xs text-slate-500">{r.tags}</td>
                <td className="text-right tabular-nums">{r.invoices}</td><td className="text-right tabular-nums">{num(r.spent)}</td>
                <td className="text-slate-500">{r.last_buy ? fmtDate(r.last_buy) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">No customers in this segment</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
