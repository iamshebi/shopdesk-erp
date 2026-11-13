export const ATT_STATUSES = [
  { id: "present", label: "Present", short: "P", tone: "green" },
  { id: "late", label: "Late", short: "L", tone: "amber" },
  { id: "half", label: "Half day", short: "½", tone: "amber" },
  { id: "absent", label: "Absent", short: "A", tone: "red" },
  { id: "leave", label: "On leave", short: "LV", tone: "blue" },
  { id: "off", label: "Day off", short: "O", tone: "slate" },
] as const;
export const LEAVE_TYPES = [["annual", "Annual"], ["sick", "Sick"], ["unpaid", "Unpaid"], ["emergency", "Emergency"], ["maternity", "Maternity / paternity"], ["other", "Other"]] as const;
export const r2 = (n: number) => Math.round(n * 100) / 100;
/** UAE convention: daily rate = monthly gross / 30. */
export function payslipFor(e: { basic_salary: number; allowances: number }, unpaidDays: number, overtimeHours: number) {
  const basic = Number(e.basic_salary), allow = Number(e.allowances);
  const daily = (basic + allow) / 30;
  const deductions = r2(daily * unpaidDays);
  const overtime = r2((basic / 30 / 8) * 1.25 * overtimeHours);
  return { basic, allowances: allow, overtime, deductions, net: r2(basic + allow + overtime - deductions) };
}
