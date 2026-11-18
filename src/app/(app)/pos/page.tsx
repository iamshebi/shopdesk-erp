import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import Pos from "./pos";

export default async function PosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("pos");
  const s = await getSettings();
  if (s.require_open_shift) {
    const { openShiftOf } = await import("@/lib/shifts");
    if (!(await openShiftOf(user.id))) redirect("/shifts?need=1");
  }
  const sp = await searchParams;
  const preset = sp.add
    ? await one<any>(`SELECT p.id, p.name, p.brand, p.category, p.sku, p.barcode, p.price, p.cost, p.track_serial, p.is_service, ${STOCK_SQL} AS stock FROM products p WHERE p.id=$1`, [Number(sp.add)])
    : null;
  const pc = sp.customer ? await one<any>("SELECT id, name, phone, trn, address FROM customers WHERE id=$1", [Number(sp.customer)]) : null;
  const { customerTerms } = await import("@/lib/customer-pricing");
  const { q } = await import("@/lib/db");
  const presetCustomer = pc ? { ...pc, terms: await customerTerms(q, pc.id) } : null;
  const ex = sp.exchange ? await one<any>("SELECT number, total FROM sales WHERE id=$1", [Number(sp.exchange)]) : null;
  return <Pos presetCustomer={presetCustomer} exchangeNote={ex ? `Exchange: ${ex.number} gave ${s.currency} ${Number(ex.total).toFixed(2)} store credit. Add the replacement item(s).` : undefined} vatRate={s.vat_registered ? s.vat_rate : 0} inclusive={s.prices_include_vat} currency={s.currency} preset={preset ?? null}
      perms={{ price: can(user, "sales.price"), discount: can(user, "sales.discount"), credit: can(user, "sales.credit") }} />;
}
