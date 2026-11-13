import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";

/** UAE WPS Salary Information File (SIF): one EDR line per employee + one SCR control line. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser("payroll");
  const { id } = await params;
  const url = new URL(req.url);
  const employer = (url.searchParams.get("employer") ?? "").replace(/\D/g, "");
  const bank = (url.searchParams.get("bank") ?? "").replace(/\D/g, "");
  await saveSettings({ wps_employer_id: employer, wps_bank_routing: bank });
  const r = await one<any>("SELECT * FROM payroll_runs WHERE id=$1", [Number(id)]);
  if (!r) return new Response("Not found", { status: 404 });
  const slips = await q<any>("SELECT p.*, e.labour_card_no, e.bank_routing, e.iban FROM payslips p JOIN employees e ON e.id=p.employee_id WHERE run_id=$1 AND p.net > 0 ORDER BY e.id", [r.id]);
  const [y, m] = r.month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const start = `${r.month}-01`, end = `${r.month}-${String(last).padStart(2, "0")}`;
  const now = new Date(Date.now() + 4 * 3600e3);
  const d = now.toISOString().slice(0, 10), hhmm = now.toISOString().slice(11, 16).replace(":", "");
  const f2 = (n: number) => Number(n).toFixed(2);
  const lines = slips.map((p) => ["EDR", p.labour_card_no.padStart(14, "0"), p.bank_routing, p.iban, start, end, Number(p.days_paid), f2(Number(p.basic) + Number(p.allowances) - Number(p.deductions)), f2(Number(p.overtime) + Number(p.bonus)), Number(p.unpaid_days)].join(","));
  const total = slips.reduce((a, p) => a + Number(p.net), 0);
  lines.push(["SCR", employer.padStart(13, "0"), bank, d, hhmm, `${String(m).padStart(2, "0")}${y}`, slips.length, f2(total), "AED", ""].join(","));
  const name = `${employer.padStart(13, "0")}${d.slice(2).replace(/-/g, "")}${hhmm}00.SIF`;
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
