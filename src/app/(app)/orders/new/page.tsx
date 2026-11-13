import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import OrderForm from "@/components/order-form";
import { saveOrder } from "../actions";

export default async function NewOrder({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("orders");
  const sp = await searchParams;
  const s = await getSettings();
  const kind = sp.kind === "quote" ? "quote" : "order";
  const reps = await q<any>("SELECT id, name FROM users WHERE active ORDER BY name");
  return (
    <div className="max-w-5xl">
      <PageHeader title={kind === "quote" ? "New quotation" : "New sales order"} subtitle={kind === "quote" ? "A price offer you can send, then turn into an order" : "For phone, WhatsApp, website or delivery orders. Stock is reserved when you confirm it."} />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <OrderForm action={saveOrder} kind={kind} reps={reps} currency={s.currency} canDiscount={can(user, "sales.discount")} defaultTerms="Prices include VAT. Valid for 7 days. Stock subject to availability." />
    </div>
  );
}
