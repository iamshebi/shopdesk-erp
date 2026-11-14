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
  console.log("cron", JSON.stringify(out));
  return Response.json(out);
}
