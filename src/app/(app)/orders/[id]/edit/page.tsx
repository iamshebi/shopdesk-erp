import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import OrderForm from "@/components/order-form";
import { saveOrder } from "../../actions";

export default async function EditOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("orders");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const o = await one<any>("SELECT *, to_char(valid_until,'YYYY-MM-DD') valid_until, to_char(expected_date,'YYYY-MM-DD') expected_date FROM orders WHERE id=$1", [Number(id)]);
  if (!o) notFound();
  const items = await q<any>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id", [o.id]);
  const reps = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${o.number}`} />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <OrderForm action={saveOrder} kind={o.kind} order={o} items={items} reps={reps} currency={s.currency} canDiscount={can(user, "sales.discount")} defaultTerms="" />
    </div>
  );
}
