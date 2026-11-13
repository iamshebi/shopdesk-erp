import Submit from "./submit";
export default function EmployeeForm({ action, e = {}, departments, users }: { action: (fd: FormData) => Promise<void>; e?: any; departments: { id: number; name: string }[]; users: { id: number; name: string }[] }) {
  const F = (label: string, el: React.ReactNode) => <div><label className="label">{label}</label>{el}</div>;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      {e.id && <input type="hidden" name="id" value={e.id} />}
      {F("Full name", <input name="name" defaultValue={e.name} className="input" required />)}
      {F("Designation", <input name="designation" defaultValue={e.designation} className="input" placeholder="e.g. Sales staff" />)}
      {F("Department", <div className="flex gap-1"><select name="department_id" defaultValue={e.department_id ?? ""} className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><input name="new_department" placeholder="or new" className="input w-24" /></div>)}
      {F("Phone", <input name="phone" defaultValue={e.phone} className="input" inputMode="tel" />)}
      {F("Email", <input name="email" defaultValue={e.email} className="input" type="email" />)}
      {F("Joined on", <input type="date" name="join_date" defaultValue={e.join_date ?? ""} className="input" />)}
      {F("Basic salary / month", <input name="basic_salary" defaultValue={Number(e.basic_salary) || ""} className="input" inputMode="decimal" />)}
      {F("Allowances / month", <input name="allowances" defaultValue={Number(e.allowances) || ""} className="input" inputMode="decimal" placeholder="housing, transport…" />)}
      {F("Annual leave days / year", <input name="annual_leave_days" defaultValue={e.annual_leave_days ?? 30} className="input" inputMode="decimal" />)}
      {F("Labour card / personal no. (WPS)", <input name="labour_card_no" defaultValue={e.labour_card_no} className="input" />)}
      {F("Bank routing code (WPS)", <input name="bank_routing" defaultValue={e.bank_routing} className="input" />)}
      {F("IBAN", <input name="iban" defaultValue={e.iban} className="input" />)}
      {F("Login account (optional)", <select name="user_id" defaultValue={e.user_id ?? ""} className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>)}
      {e.id && F("Status", <select name="active" defaultValue={e.active === false ? "off" : "on"} className="input"><option value="on">Active</option><option value="off">Left / inactive</option></select>)}
      <div className="sm:col-span-3"><label className="label">Notes</label><textarea name="notes" defaultValue={e.notes} rows={2} className="input" /></div>
      <div className="sm:col-span-3"><Submit>{e.id ? "Save employee" : "Add employee"}</Submit></div>
    </form>
  );
}
