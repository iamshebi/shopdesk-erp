"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { STAGES } from "@/lib/crm";
import { str, numf } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function saveLead(fd: FormData) {
  const user = await requireUser("crm");
  const id = Number(str(fd, "id"));
  const name = str(fd, "name");
  if (!name) go(id ? `/crm/leads/${id}` : "/crm", "Lead name is required", "err");
  const f = [name, str(fd, "phone"), str(fd, "email"), str(fd, "company"), str(fd, "source") || "walk-in", str(fd, "interest"), Math.max(0, numf(fd, "value")),
    Number(str(fd, "owner_id")) || null, str(fd, "next_followup") || null, str(fd, "notes")];
  let lid = id;
  if (id) await q("UPDATE leads SET name=$2, phone=$3, email=$4, company=$5, source=$6, interest=$7, value=$8, owner_id=$9, next_followup=$10, notes=$11, updated_at=now() WHERE id=$1", [id, ...f]);
  else lid = (await one<{ id: number }>("INSERT INTO leads (name, phone, email, company, source, interest, value, owner_id, next_followup, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id", [...f, user.id]))!.id;
  await log(user.id, id ? "Lead edited" : "Lead added", name, `/crm/leads/${lid}`);
  revalidatePath("/crm");
  go(`/crm/leads/${lid}`, "Saved");
}

export async function setStage(fd: FormData) {
  const user = await requireUser("crm");
  const id = Number(str(fd, "id"));
  const stage = str(fd, "stage");
  if (!STAGES.some((s) => s.id === stage)) go(`/crm/leads/${id}`);
  const l = await one<any>("UPDATE leads SET stage=$2, lost_reason=COALESCE(NULLIF($3,''), lost_reason), updated_at=now() WHERE id=$1 RETURNING *", [id, stage, str(fd, "lost_reason")]);
  if (l) await q("INSERT INTO crm_activities (lead_id, type, body, user_id, done) VALUES ($1,'note',$2,$3,TRUE)", [id, `Stage → ${STAGES.find((s) => s.id === stage)?.label}${str(fd, "lost_reason") ? `: ${str(fd, "lost_reason")}` : ""}`, user.id]);
  revalidatePath("/crm");
  go(str(fd, "back") || `/crm/leads/${id}`);
}

/** Lead → customer (keeps the history), optionally straight into a quotation. */
export async function convertLead(fd: FormData) {
  const user = await requireUser("crm");
  const id = Number(str(fd, "id"));
  const customerId = await tx(async (t) => {
    const [l] = await t<any>("SELECT * FROM leads WHERE id=$1", [id]);
    if (l.customer_id) return l.customer_id as number;
    let cid = l.phone ? (await t<{ id: number }>("SELECT id FROM customers WHERE phone=$1 LIMIT 1", [l.phone]))[0]?.id : undefined;
    if (!cid) cid = (await t<{ id: number }>("INSERT INTO customers (name, phone, email, notes, tags) VALUES ($1,$2,$3,$4,'from lead') RETURNING id", [l.company ? `${l.name} (${l.company})` : l.name, l.phone, l.email, l.notes]))[0].id;
    await t("UPDATE leads SET customer_id=$2, stage='won', updated_at=now() WHERE id=$1", [id, cid]);
    await t("UPDATE crm_activities SET customer_id=$2 WHERE lead_id=$1", [id, cid]);
    await t("INSERT INTO crm_activities (customer_id, lead_id, type, body, user_id, done) VALUES ($1,$2,'note','Converted from lead',$3,TRUE)", [cid, id, user.id]);
    return cid;
  });
  await log(user.id, "Lead converted", `#${id}`, `/customers/${customerId}`);
  if (str(fd, "quote") === "1") {
    const c = await one<any>("SELECT name, phone, email FROM customers WHERE id=$1", [customerId]);
    go(`/orders/new?kind=quote&name=${encodeURIComponent(c.name)}&phone=${encodeURIComponent(c.phone)}&email=${encodeURIComponent(c.email)}`);
  }
  go(`/customers/${customerId}`, "Lead converted to a customer");
}

export async function addActivity(fd: FormData) {
  const user = await requireUser(["crm", "customers"]);
  const customerId = Number(str(fd, "customer_id")) || null, leadId = Number(str(fd, "lead_id")) || null;
  const body = str(fd, "body");
  const type = str(fd, "type") || "note";
  if (!body) go(str(fd, "back"), "Write something first", "err");
  const due = type === "followup" ? str(fd, "due_date") || null : null;
  await q("INSERT INTO crm_activities (customer_id, lead_id, type, body, due_date, done, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [customerId, leadId, type, body, due, type !== "followup", user.id]);
  if (leadId && due) await q("UPDATE leads SET next_followup=$2, updated_at=now() WHERE id=$1", [leadId, due]);
  revalidatePath("/crm");
  go(str(fd, "back") || "/crm", type === "followup" ? "Follow-up reminder added" : "Added");
}

export async function completeActivity(fd: FormData) {
  await requireUser(["crm", "customers"]);
  await q("UPDATE crm_activities SET done=TRUE WHERE id=$1", [Number(str(fd, "id"))]);
  revalidatePath("/crm");
  go(str(fd, "back") || "/crm/followups", "Marked done");
}

export async function saveCustomerCrm(fd: FormData) {
  const user = await requireUser("customers");
  const id = Number(str(fd, "id"));
  await q("UPDATE customers SET group_name=$2, tags=$3, credit_limit=$4, notes=$5 WHERE id=$1", [id, str(fd, "group_name"), str(fd, "tags"), Math.max(0, numf(fd, "credit_limit")), str(fd, "notes")]);
  await log(user.id, "Customer profile edited", `#${id}`, `/customers/${id}`);
  revalidatePath(`/customers/${id}`);
  go(`/customers/${id}`, "Saved");
}
