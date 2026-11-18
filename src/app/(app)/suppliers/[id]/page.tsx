import Link from "next/link";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/util";
import { PageHeader, Field } from "@/components/ui";
import Submit from "@/components/submit";
import { updateSupplier, deleteSupplier } from "../actions";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("suppliers");
  const { id } = await params;
  const sp = await searchParams;
  const s = await one<any>(
    `SELECT s.*, (SELECT count(*)::int FROM purchases p WHERE p.supplier_id=s.id) bills,
       (SELECT COALESCE(sum(p.total - p.paid - p.returned),0) FROM purchases p WHERE p.supplier_id=s.id) balance
     FROM suppliers s WHERE s.id=$1`,
    [Number(id)],
  );
  if (!s) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={s.name} subtitle={`${s.bills} bill${s.bills === 1 ? "" : "s"} · we owe ${num(s.balance)}`}>
        <Link href={`/purchases?supplier=${s.id}`} className="btn-ghost">View bills</Link>
        <Link href="/suppliers" className="btn-ghost">All suppliers</Link>
      </PageHeader>
      {sp.saved && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">Saved.</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={updateSupplier} className="card space-y-4 p-6">
        <input type="hidden" name="id" value={s.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name"><input name="name" defaultValue={s.name} className="input" required /></Field>
          <Field label="Phone"><input name="phone" defaultValue={s.phone} className="input" /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={s.email} className="input" /></Field>
          <Field label="TRN"><input name="trn" defaultValue={s.trn} className="input" inputMode="numeric" /></Field>
          <Field label="Address" className="sm:col-span-2"><input name="address" defaultValue={s.address} className="input" /></Field>
        </div>
        <Submit>Save changes</Submit>
      </form>
      <form action={deleteSupplier} className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-red-100 p-4 text-sm">
        <input type="hidden" name="id" value={s.id} />
        <span className="text-slate-500">Delete is only possible when the supplier has no bills or orders.</span>
        <Submit className="btn-ghost text-red-600" confirm={`Delete supplier ${s.name}?`}>Delete supplier</Submit>
      </form>
    </div>
  );
}
