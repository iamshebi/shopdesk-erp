import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import Pos from "./pos";

export default async function PosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("pos");
  const s = await getSettings();
  const sp = await searchParams;
  const preset = sp.add
    ? await one<any>(`SELECT p.id, p.name, p.brand, p.category, p.sku, p.barcode, p.price, p.cost, p.track_serial, p.is_service, ${STOCK_SQL} AS stock FROM products p WHERE p.id=$1`, [Number(sp.add)])
    : null;
  return <Pos vatRate={s.vat_registered ? s.vat_rate : 0} inclusive={s.prices_include_vat} currency={s.currency} preset={preset ?? null} />;
}
