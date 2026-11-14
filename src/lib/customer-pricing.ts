import type { Exec } from "./db";

export interface CustomerTerms { credit: number; discount_pct: number; prices: Record<string, number> }

export async function customerTerms(t: Exec, customerId: number): Promise<CustomerTerms> {
  const { storeCreditBalance } = await import("./store-credit");
  const [c] = await t<any>("SELECT discount_pct, price_list FROM customers WHERE id=$1", [customerId]);
  return { credit: await storeCreditBalance(t, customerId), discount_pct: Number(c?.discount_pct ?? 0), prices: c?.price_list ?? {} };
}

/** Price a customer pays: their special price for the product, else list price less their group discount. */
export function priceFor(terms: CustomerTerms | null, productId: number, list: number) {
  if (!terms) return list;
  const sp = terms.prices[String(productId)];
  if (sp != null && Number(sp) > 0) return Number(sp);
  return terms.discount_pct > 0 ? Math.round(list * (1 - terms.discount_pct / 100) * 100) / 100 : list;
}
