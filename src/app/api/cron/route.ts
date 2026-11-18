import { runRecurring, autoReminders } from "@/lib/billing";
import { runAutomations, dailySummaryEmail, scheduledReportEmail } from "@/lib/automation";
import { ensureLedger } from "@/lib/accounting";

export const maxDuration = 60;

/** Daily jobs. Vercel Cron calls this with Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin);
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => { try { out[name] = await fn(); } catch (e: any) { out[name] = `error: ${e?.message ?? e}`; console.error("cron", name, e); } };
  await step("recurring", () => runRecurring(base, null));
  await step("reminders", () => autoReminders(base));
  await step("automation", () => runAutomations(base));
  await step("summary", () => dailySummaryEmail(base));
  await step("report", () => scheduledReportEmail(base));
  await step("ledger", () => ensureLedger());
  await step("cheques", async () => {
    const { one } = await import("@/lib/db");
    const { notifyPerm } = await import("@/lib/notify");
    const r = await one<{ n: number; v: number }>("SELECT count(*)::int n, COALESCE(sum(amount),0) v FROM cheques WHERE status='pending' AND due_date BETWEEN (now() AT TIME ZONE 'Asia/Dubai')::date AND (now() AT TIME ZONE 'Asia/Dubai')::date + 1");
    if (r?.n) await notifyPerm(["cheques"], `${r.n} cheque${r.n === 1 ? "" : "s"} dated today or tomorrow (${r.v.toFixed(2)})`, "/cheques", "warning");
    return r?.n ?? 0;
  });
  console.log("cron", JSON.stringify(out));
  return Response.json(out);
}
