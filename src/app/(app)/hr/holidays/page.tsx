import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import HrTabs from "../tabs";
import { saveHoliday, applyHoliday } from "../actions";

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("hr");
  const sp = await searchParams;
  const rows = await q<any>("SELECT * FROM holidays ORDER BY date DESC");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Public holidays" subtitle="Shown on the calendar. One click marks the day off for all staff." />
      <HrTabs active="/hr/holidays" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <form action={saveHoliday} className="card mb-6 flex flex-wrap items-end gap-3 p-5"><div><label className="label">Date</label><input type="date" name="date" className="input" required /></div><div className="flex-1"><label className="label">Holiday</label><input name="name" className="input" placeholder="National Day" required /></div><Submit>Add</Submit></form>
      <div className="card"><table className="tbl"><tbody>
        {rows.map((h) => <tr key={h.id}><td>{fmtDate(h.date)}</td><td className="font-medium">{h.name}</td><td className="text-right"><div className="flex justify-end gap-1"><form action={applyHoliday}><input type="hidden" name="id" value={h.id} /><Submit className="btn-ghost btn-sm">Mark day off for all</Submit></form><form action={saveHoliday}><input type="hidden" name="delete" value={h.id} /><Submit className="btn-ghost btn-sm">Remove</Submit></form></div></td></tr>)}
        {rows.length === 0 && <tr><td className="text-slate-400">No holidays added</td></tr>}
      </tbody></table></div>
    </div>
  );
}
