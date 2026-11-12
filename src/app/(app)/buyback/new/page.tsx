import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import BuybackForm from "./form";

export default async function NewBuyback() {
  await requireUser("buyback");
  const s = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Buy a used device" subtitle="Records the seller's ID and adds the phone to stock by IMEI" />
      <BuybackForm registered={s.vat_registered} />
    </div>
  );
}
