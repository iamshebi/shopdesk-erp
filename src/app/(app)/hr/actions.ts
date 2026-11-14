"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { ATT_STATUSES, payslipFor, r2 } from "@/lib/hr";
import { str, numf } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function saveEmployee(fd: FormData) {
  const user = await requireUser("hr");
  const id = Number(str(fd, "id"));
  const name = str(fd, "name");
  if (!name) go(id ? `/hr/${id}` : "/hr?add=1", "Name is required", "err");
  let dept: number | null = Number(str(fd, "department_id")) || null;
  const newDept = str(fd, "new_department");
  if (newDept) dept = (await one<{ id: number }>("INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id", [newDept]))!.id;
  const f = [name, str(fd, "phone"), str(fd, "email"), str(fd, "designation"), dept, Number(str(fd, "user_id")) || null, str(fd, "join_date") || null,
    Math.max(0, numf(fd, "basic_salary")), Math.max(0, numf(fd, "allowances")), str(fd, "annual_leave_days") === "" ? 30 : Math.max(0, numf(fd, "annual_leave_days")),
    str(fd, "labour_card_no"), str(fd, "bank_routing"), str(fd, "iban").replace(/\s/g, "").toUpperCase(), str(fd, "notes")];
  let eid = id;
  if (id) await q(`UPDATE employees SET name=$2, phone=$3, email=$4, designation=$5, department_id=$6, user_id=$7, join_date=$8, basic_salary=$9, allowances=$10, annual_leave_days=$11, labour_card_no=$12, bank_routing=$13, iban=$14, notes=$15, active=$16 WHERE id=$1`, [id, ...f, str(fd, "active") !== "off"]);
  else {
    eid = await tx(async (t) => {
      const [{ n }] = await t<{ n: number }>("SELECT COALESCE(max(id),0)+1 n FROM employees");
      const [r] = await t<{ id: number }>(`INSERT INTO employees (code, name, phone, email, designation, department_id, user_id, join_date, basic_salary, allowances, annual_leave_days, labour_card_no, bank_routing, iban, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`, [`EMP-${String(n).padStart(3, "0")}`, ...f]);
      return r.id;
    });
  }
  await log(user.id, id ? "Employee edited" : "Employee added", name, `/hr/${eid}`);
  revalidatePath("/hr");
  go(`/hr/${eid}`, "Saved");
}

export async function saveAttendance(fd: FormData) {
  const user = await requireUser("hr");
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) go("/hr/attendance", "Pick a date", "err");
  const ids = fd.getAll("emp").map(Number);
  await tx(async (t) => {
    for (const id of ids) {
      const status = str(fd, `status_${id}`);
      if (!status) { await t("DELETE FROM attendance WHERE employee_id=$1 AND date=$2", [id, date]); continue; }
      if (!ATT_STATUSES.some((s) => s.id === status)) continue;
      await t(`INSERT INTO attendance (employee_id, date, status, check_in, check_out, overtime_hours) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (employee_id, date) DO UPDATE SET status=$3, check_in=$4, check_out=$5, overtime_hours=$6`,
        [id, date, status, str(fd, `in_${id}`), str(fd, `out_${id}`), Math.max(0, numf(fd, `ot_${id}`))]);
    }
  });
  await log(user.id, "Attendance saved", date, `/hr/attendance?date=${date}`);
  go(`/hr/attendance?date=${date}`, "Attendance saved");
}

export async function requestLeave(fd: FormData) {
  const user = await requireUser("hr");
  const emp = Number(str(fd, "employee_id")), from = str(fd, "from_date"), to = str(fd, "to_date") || str(fd, "from_date");
  if (!emp || !from || to < from) go("/hr/leave", "Choose the employee and valid dates", "err");
  const days = numf(fd, "days") || Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  await q("INSERT INTO leave_requests (employee_id, type, from_date, to_date, days, reason) VALUES ($1,$2,$3,$4,$5,$6)", [emp, str(fd, "type") || "annual", from, to, days, str(fd, "reason")]);
  await log(user.id, "Leave requested", `${days} day(s)`, "/hr/leave");
  go("/hr/leave", "Leave request added");
}

export async function decideLeave(fd: FormData) {
  const user = await requireUser("hr");
  const id = Number(str(fd, "id")), decision = str(fd, "decision");
  if (!["approved", "rejected", "cancelled"].includes(decision)) go("/hr/leave");
  await tx(async (t) => {
    const [l] = await t<any>("UPDATE leave_requests SET status=$2, decided_by=$3 WHERE id=$1 RETURNING employee_id, to_char(from_date,'YYYY-MM-DD') f, to_char(to_date,'YYYY-MM-DD') tt", [id, decision, user.id]);
    if (l && decision === "approved") {
      await t(`INSERT INTO attendance (employee_id, date, status, note) SELECT $1, d::date, 'leave', 'Approved leave' FROM generate_series($2::date, $3::date, interval '1 day') d
               ON CONFLICT (employee_id, date) DO UPDATE SET status='leave', note='Approved leave'`, [l.employee_id, l.f, l.tt]);
    }
  });
  revalidatePath("/hr/leave");
  go("/hr/leave", `Leave ${decision}`);
}

/** Build (or rebuild) a draft payroll from salaries, unpaid leave, absences and overtime of that month. */
export async function buildPayroll(fd: FormData) {
  const user = await requireUser("payroll");
  const month = str(fd, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) go("/hr/payroll", "Pick a month", "err");
  const id = await tx(async (t) => {
    const [ex] = await t<any>("SELECT id, status FROM payroll_runs WHERE month=$1", [month]);
    if (ex && ex.status !== "draft") return -ex.id;
    const runId = ex?.id ?? (await t<{ id: number }>("INSERT INTO payroll_runs (month, created_by) VALUES ($1,$2) RETURNING id", [month, user.id]))[0].id;
    await t("DELETE FROM payslips WHERE run_id=$1", [runId]);
    const emps = await t<any>(
      `SELECT e.*,
        COALESCE((SELECT sum(CASE a.status WHEN 'absent' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END) FROM attendance a WHERE a.employee_id=e.id AND to_char(a.date,'YYYY-MM')=$1),0) absent,
        COALESCE((SELECT sum(a.overtime_hours) FROM attendance a WHERE a.employee_id=e.id AND to_char(a.date,'YYYY-MM')=$1),0) ot,
        COALESCE((SELECT sum(GREATEST(0, LEAST(l.to_date, (date_trunc('month', to_date($1,'YYYY-MM')) + interval '1 month - 1 day')::date) - GREATEST(l.from_date, to_date($1,'YYYY-MM')) + 1))
                  FROM leave_requests l WHERE l.employee_id=e.id AND l.status='approved' AND l.type='unpaid'),0) unpaid_leave
       FROM employees e WHERE e.active AND (e.join_date IS NULL OR e.join_date <= (date_trunc('month', to_date($1,'YYYY-MM')) + interval '1 month - 1 day')::date)`,
      [month],
    );
    let total = 0;
    for (const e of emps) {
      const unpaid = Math.min(30, Number(e.absent) + Number(e.unpaid_leave));
      const p = payslipFor(e, unpaid, Number(e.ot));
      total += p.net;
      await t("INSERT INTO payslips (run_id, employee_id, days_paid, unpaid_days, basic, allowances, overtime, deductions, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [runId, e.id, 30 - unpaid, unpaid, p.basic, p.allowances, p.overtime, p.deductions, p.net]);
    }
    await t("UPDATE payroll_runs SET total=$2 WHERE id=$1", [runId, r2(total)]);
    return runId;
  });
  if (id < 0) go(`/hr/payroll/${-id}`, "This month is already approved, it can't be rebuilt", "err");
  await log(user.id, "Payroll prepared", month, `/hr/payroll/${id}`);
  go(`/hr/payroll/${id}`, "Payroll prepared from attendance and leave");
}

export async function savePayslips(fd: FormData) {
  await requireUser("payroll");
  const runId = Number(str(fd, "run_id"));
  await tx(async (t) => {
    const [run] = await t<any>("SELECT status FROM payroll_runs WHERE id=$1", [runId]);
    if (run?.status !== "draft") return;
    for (const pid of fd.getAll("slip").map(Number)) {
      const bonus = Math.max(0, numf(fd, `bonus_${pid}`)), ded = Math.max(0, numf(fd, `ded_${pid}`));
      await t("UPDATE payslips SET bonus=$2, deductions=$3, note=$4, net=round(basic + allowances + overtime + $2 - $3, 2) WHERE id=$1 AND run_id=$5", [pid, bonus, ded, str(fd, `note_${pid}`), runId]);
    }
    await t("UPDATE payroll_runs SET total=(SELECT COALESCE(sum(net),0) FROM payslips WHERE run_id=$1) WHERE id=$1", [runId]);
  });
  go(`/hr/payroll/${runId}`, "Saved");
}

export async function setPayrollStatus(fd: FormData) {
  const user = await requireUser("payroll");
  const runId = Number(str(fd, "run_id")), status = str(fd, "status");
  if (status === "approved") await q("UPDATE payroll_runs SET status='approved' WHERE id=$1 AND status='draft'", [runId]);
  else if (status === "draft") await q("UPDATE payroll_runs SET status='draft' WHERE id=$1 AND status='approved'", [runId]);
  else if (status === "paid") await q("UPDATE payroll_runs SET status='paid', method=$2, paid_date=$3 WHERE id=$1 AND status='approved'", [runId, str(fd, "method") || "bank", str(fd, "paid_date") || new Date().toISOString().slice(0, 10)]);
  await log(user.id, `Payroll ${status}`, `#${runId}`, `/hr/payroll/${runId}`);
  go(`/hr/payroll/${runId}`, status === "paid" ? "Marked paid. Salaries are posted to the accounts." : `Payroll ${status}`);
}

export async function saveCommissionRates(fd: FormData) {
  const user = await requireUser("payroll");
  for (const id of fd.getAll("uid").map(Number)) {
    await q("UPDATE users SET commission_rate=$2, commission_base=$3 WHERE id=$1", [id, Math.min(100, Math.max(0, numf(fd, `rate_${id}`))), str(fd, `base_${id}`) === "sales" ? "sales" : "profit"]);
  }
  await log(user.id, "Commission rates changed", "", "/hr/commissions");
  go(`/hr/commissions?month=${str(fd, "month")}`, "Rates saved");
}
