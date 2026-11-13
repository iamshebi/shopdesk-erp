"use server";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { TRIGGERS, ACTIONS, runAutomations } from "@/lib/automation";
import { baseUrl } from "@/lib/public-link";
import { str, numf } from "@/lib/util";

function go(msg: string, kind: "ok" | "err" = "ok"): never { redirect(`/automation?${kind}=${encodeURIComponent(msg)}`); }

export async function saveRule(fd: FormData) {
  const user = await requireUser("integrations");
  const trigger = str(fd, "trigger"), action = str(fd, "action");
  if (!TRIGGERS.some((t) => t.id === trigger) || !ACTIONS.some((a) => a.id === action)) go("Choose a trigger and an action", "err");
  if (action === "email" && !str(fd, "email")) go("Enter the email address", "err");
  const name = str(fd, "name") || TRIGGERS.find((t) => t.id === trigger)!.label;
  await q("INSERT INTO automation_rules (name, trigger, threshold, action, assignee_id, email) VALUES ($1,$2,$3,$4,$5,$6)", [name, trigger, Math.max(0, numf(fd, "threshold")), action, Number(str(fd, "assignee_id")) || null, str(fd, "email")]);
  await log(user.id, "Automation added", name, "/automation");
  go("Rule saved. It runs every morning, or press “Run now”.");
}

export async function toggleRule(fd: FormData) {
  await requireUser("integrations");
  await q("UPDATE automation_rules SET active = NOT active WHERE id=$1", [Number(str(fd, "id"))]);
  go("Updated");
}

export async function deleteRule(fd: FormData) {
  await requireUser("integrations");
  await q("DELETE FROM automation_rules WHERE id=$1", [Number(str(fd, "id"))]);
  go("Rule deleted");
}

export async function runNow(fd: FormData) {
  await requireUser("integrations");
  const n = await runAutomations(await baseUrl(), Number(str(fd, "id")) || undefined);
  go(`Done: ${n} new item(s) actioned`);
}
