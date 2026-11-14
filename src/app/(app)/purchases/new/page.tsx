import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import PurchaseForm from "./form";

export default async function NewPurchase({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireUser("purchases");
  const s = await getSettings();
  const suppliers = await q<{ id: number; name: string }>("SELECT id, name FROM suppliers ORDER BY name");
  const warehouses = await q<{ id: number; name: string }>("SELECT id, name FROM warehouses WHERE active ORDER BY is_default DESC, name");
  let po = null;
  if (sp.po) {
    const o = (await q<any>("SELECT * FROM purchase_orders WHERE id=$1 AND status IN ('approved','ordered','partial')", [Number(sp.po)]))[0];
    if (o) {
      const items = await q<any>("SELECT i.*, p.name, p.track_serial, p.track_batch FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE i.po_id=$1 AND i.received_qty < i.qty ORDER BY i.id", [o.id]);
      po = { id: o.id, number: o.number, supplier_id: o.supplier_id, warehouse_id: o.warehouse_id, lines: items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty - i.received_qty, unit_cost: Number(i.unit_cost), vat: true, imeis: [], imeiText: "", track_serial: i.track_serial, track_batch: i.track_batch })) };
    }
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase" subtitle="Stock received from a supplier. Quantities and IMEIs go straight into stock." />
      <PurchaseForm po={po} warehouses={warehouses} suppliers={suppliers} vatRate={s.vat_registered ? s.vat_rate : 0} today={todayDubai()} />
    </div>
  );
}
