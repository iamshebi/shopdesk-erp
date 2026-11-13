import Submit from "./submit";
import { LEAD_SOURCES } from "@/lib/crm";

export default function LeadForm({ action, lead, users }: { action: (fd: FormData) => Promise<void>; lead?: any; users: { id: number; name: string }[] }) {
  const l = lead ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      {l.id && <input type="hidden" name="id" value={l.id} />}
      <div><label className="label">Name</label><input name="name" defaultValue={l.name} className="input" required /></div>
      <div><label className="label">Phone</label><input name="phone" defaultValue={l.phone} className="input" inputMode="tel" /></div>
      <div><label className="label">Email</label><input name="email" defaultValue={l.email} className="input" type="email" /></div>
      <div><label className="label">Company</label><input name="company" defaultValue={l.company} className="input" /></div>
      <div><label className="label">Source</label><select name="source" defaultValue={l.source ?? "walk-in"} className="input capitalize">{LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      <div><label className="label">Interested in</label><input name="interest" defaultValue={l.interest} className="input" placeholder="e.g. 10 phones for staff" /></div>
      <div><label className="label">Possible value</label><input name="value" defaultValue={l.value ?? ""} className="input" inputMode="decimal" /></div>
      <div><label className="label">Owner</label><select name="owner_id" defaultValue={l.owner_id ?? ""} className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div><label className="label">Next follow-up</label><input type="date" name="next_followup" defaultValue={l.next_followup ?? ""} className="input" /></div>
      <div className="sm:col-span-3"><label className="label">Notes</label><textarea name="notes" defaultValue={l.notes} rows={2} className="input" /></div>
      <div className="sm:col-span-3"><Submit>{l.id ? "Save lead" : "Add lead"}</Submit></div>
    </form>
  );
}
