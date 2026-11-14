"use server";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { CF_ENTITIES, CF_TYPES } from "@/lib/custom-fields";
import { str, numf } from "@/lib/util";

const P = "/settings/workflow";
function go(msg: string, kind: "ok" | "err" = "ok"): never { redirect(`${P}?${kind}=${encodeURIComponent(msg)}`); }

export async function saveWorkflow(fd: FormData) {
  const user = await requireUser("settings");
  const lock = str(fd, "books_locked_until");
  await saveSettings({
    expense_approval_limit: Math.max(0, numf(fd, "expense_approval_limit")), po_approval_limit: Math.max(0, numf(fd, "po_approval_limit")),
    require_product_approval: fd.get("require_product_approval") === "on",
    books_locked_until: /^\d{4}-\d{2}-\d{2}$/.test(lock) ? lock : "", fiscal_year_start_month: Math.min(12, Math.max(1, Math.round(numf(fd, "fiscal_year_start_month")) || 1)),
  });
  await log(user.id, "Workflow settings changed", lock ? `Books closed to ${lock}` : "", P);
  go("Saved");
}

export async function addCustomField(fd: FormData) {
  const user = await requireUser("settings");
  const entity = str(fd, "entity"), label = str(fd, "label"), type = str(fd, "type");
  if (!CF_ENTITIES[entity] || !label || !CF_TYPES.some(([k]) => k === type)) go("Choose where the field goes, a name and a type", "err");
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `f${Date.now()}`;
  try {
    await q("INSERT INTO custom_fields (entity, key, label, type, options, required, sort) VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(sort),0)+1 FROM custom_fields WHERE entity=$1))", [entity, key, label, type, str(fd, "options"), fd.get("required") === "on"]);
  } catch { go("A field with that name already exists there", "err"); }
  await log(user.id, "Custom field added", `${CF_ENTITIES[entity]}: ${label}`, P);
  go(`Field “${label}” added to ${CF_ENTITIES[entity]}`);
}

export async function deleteCustomField(fd: FormData) {
  const user = await requireUser("settings");
  const [f] = await q<any>("DELETE FROM custom_fields WHERE id=$1 RETURNING label", [Number(str(fd, "id"))]);
  await log(user.id, "Custom field removed", f?.label ?? "", P);
  go("Field removed. Values already saved are kept in the records.");
}
