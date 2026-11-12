import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { todayDubai } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import PurchaseForm from "./form";

export default async function NewPurchase() {
  await requireUser("purchases");
  const s = await getSettings();
  const suppliers = await q<{ id: number; name: string }>("SELECT id, name FROM suppliers ORDER BY name");
  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase" subtitle="Stock received from a supplier. Quantities and IMEIs go straight into stock." />
      <PurchaseForm suppliers={suppliers} vatRate={s.vat_registered ? s.vat_rate : 0} today={todayDubai()} />
    </div>
  );
}
