import Link from "next/link";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num, methodLabel } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import Attachments from "@/components/attachments";
import { decideExpense } from "../actions";

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("expenses");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const e = await one<any>("SELECT e.*, u.name staff, a.name approver FROM expenses e LEFT JOIN users u ON u.id=e.created_by LEFT JOIN users a ON a.id=e.approved_by WHERE e.id=$1", [Number(id)]);
  if (!e) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader title={`${e.category}: ${s.currency} ${num(e.total)}`} subtitle={`${fmtDate(e.date)} · ${methodLabel(e.method)} · entered by ${e.staff ?? "—"}`}>
        <Badge tone={e.status === "approved" ? "green" : e.status === "pending" ? "amber" : "red"}>{e.status}{e.approver && e.status !== "pending" ? ` by ${e.approver}` : ""}</Badge>
        <Link href="/expenses" className="btn-ghost">All expenses</Link>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="card mb-6 p-5 text-sm"><div>{e.description || "No description"}</div><div className="mt-2 text-slate-500">Net {num(e.amount)} · VAT {num(e.vat)}</div></div>
      {e.status === "pending" && can(user, "expenses.approve") && (
        <div className="card mb-6 flex gap-2 p-4">
          <form action={decideExpense}><input type="hidden" name="id" value={e.id} /><Submit>Approve</Submit></form>
          <form action={decideExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="reject" /><Submit className="btn-ghost">Reject</Submit></form>
        </div>
      )}
      {e.status === "pending" && !can(user, "expenses.approve") && <div className="card mb-6 p-4 text-sm text-slate-500">This expense is over the approval limit and is waiting for a manager. It is not counted in the accounts until approved.</div>}
      <Attachments kind="expense" ownerId={e.id} back={`/expenses/${e.id}`} title="Receipts & bills" />
    </div>
  );
}
