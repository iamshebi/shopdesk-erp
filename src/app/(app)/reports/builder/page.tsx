import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DATASETS } from "@/lib/report-builder";
import { num, todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import ReportTabs from "@/components/report-tabs";

export default async function ReportBuilder({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("reports");
  const sp = await searchParams;
  const dsKey = DATASETS[sp.ds ?? ""] ? sp.ds! : "sales";
  const ds = DATASETS[dsKey];
  const dims = Object.keys(ds.dims);
  const dim = ds.dims[sp.by ?? ""] ? sp.by! : dims[0];
  const dim2 = sp.by2 && ds.dims[sp.by2] && sp.by2 !== dim ? sp.by2 : "";
  const mm = (sp as Record<string, string | string[]>).mm;
  const chosen = (Array.isArray(mm) ? mm : mm ? [mm] : (sp.m ?? "").split(",")).filter((m) => ds.metrics[m]);
  const metrics = chosen.length ? chosen : Object.keys(ds.metrics).slice(0, 3);
  const today = todayDubai();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : today.slice(0, 8) + "01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const sort = metrics.includes(sp.sort ?? "") ? sp.sort! : dim === "day" || dim === "month" || dim === "hour" ? "" : metrics[0];
  const sql = `SELECT ${ds.dims[dim][1]} d1${dim2 ? `, ${ds.dims[dim2][1]} d2` : ""}, ${metrics.map((m) => `COALESCE(${ds.metrics[m][1]},0)::float AS "${m}"`).join(", ")}
    FROM ${ds.from} WHERE (${ds.date})::date BETWEEN $1::date AND $2::date GROUP BY 1${dim2 ? ", 2" : ""} ORDER BY ${sort ? `"${sort}" DESC` : "1"} LIMIT 500`;
  const rows = await q<any>(sql, [from, to]);
  const totals = Object.fromEntries(metrics.map((m) => [m, rows.reduce((a, r) => a + Number(r[m]), 0)]));
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r[metrics[0]]))));
  const head = [ds.dims[dim][0], ...(dim2 ? [ds.dims[dim2][0]] : []), ...metrics.map((m) => ds.metrics[m][0])];
  const csv = "data:text/csv;charset=utf-8," + encodeURIComponent([head, ...rows.map((r) => [r.d1, ...(dim2 ? [r.d2] : []), ...metrics.map((m) => Number(r[m]).toFixed(2))])].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"));
  return (
    <div>
      <PageHeader title="Reports" subtitle="Build your own report: pick the data, how to group it and what to add up" />
      <ReportTabs active="/reports/builder" />
      <form className="card mb-6 grid gap-3 p-5 sm:grid-cols-6">
        <div className="sm:col-span-2"><label className="label">Data</label><select name="ds" defaultValue={dsKey} className="input">{Object.entries(DATASETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label">Group by</label><select name="by" defaultValue={dim} className="input">{dims.map((d) => <option key={d} value={d}>{ds.dims[d][0]}</option>)}</select></div>
        <div><label className="label">Then by</label><select name="by2" defaultValue={dim2} className="input"><option value="">—</option>{dims.map((d) => <option key={d} value={d}>{ds.dims[d][0]}</option>)}</select></div>
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <div className="sm:col-span-5"><label className="label">Show</label><div className="flex flex-wrap gap-3 text-sm">{Object.entries(ds.metrics).map(([k, v]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="mm" value={k} defaultChecked={metrics.includes(k)} /> {v[0]}</label>)}</div></div>
        <div className="flex items-end"><button className="btn-primary w-full">Run report</button></div>
        <p className="text-xs text-slate-400 sm:col-span-6">Tip: bookmark the page after running to save the report. Changing “Data” resets the groupings.</p>
      </form>
      <div className="mb-3 flex items-center justify-between"><div className="text-sm text-slate-500">{rows.length} rows</div><a href={csv} download={`report-${dsKey}-${from}-${to}.csv`} className="btn-ghost btn-sm">Export CSV</a></div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr>{head.map((h, i) => <th key={h + i} className={i >= (dim2 ? 2 : 1) ? "text-right" : ""}>{h}</th>)}<th className="w-48"></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.d1}</td>{dim2 && <td>{r.d2}</td>}
                {metrics.map((m) => <td key={m} className="text-right tabular-nums">{num(r[m])}</td>)}
                <td><div className="h-2 rounded bg-accent/70" style={{ width: `${Math.max(1, (Math.abs(Number(r[metrics[0]])) / max) * 100)}%` }} /></td>
              </tr>
            ))}
            {rows.length > 0 && <tr className="font-semibold"><td>Total</td>{dim2 && <td></td>}{metrics.map((m) => <td key={m} className="text-right tabular-nums">{num(totals[m])}</td>)}<td></td></tr>}
            {rows.length === 0 && <tr><td colSpan={head.length + 1} className="text-center text-slate-400">No data in this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
