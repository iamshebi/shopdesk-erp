export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function money(n: number | string | null | undefined, currency = "AED") {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function num(n: number | string | null | undefined) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00") : new Date(d);
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Today's date in Dubai as YYYY-MM-DD */
export function todayDubai() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

export interface VatLine {
  net: number;
  vat: number;
  total: number;
}

/**
 * VAT for one line.
 * - pricesIncludeVat: the entered amount already contains VAT (normal for UAE retail).
 * - marginScheme: second-hand goods under Article 29 — VAT only on the profit margin.
 */
export function lineVat(opts: {
  amount: number;
  rate: number;
  pricesIncludeVat: boolean;
  registered: boolean;
  marginScheme?: boolean;
  cost?: number;
}): VatLine {
  const { amount, rate, pricesIncludeVat, registered, marginScheme, cost = 0 } = opts;
  if (!registered || rate <= 0) return { net: r2(amount), vat: 0, total: r2(amount) };
  if (marginScheme) {
    // Margin scheme prices are always treated as VAT-inclusive.
    const margin = amount - cost;
    const vat = margin > 0 ? r2((margin * rate) / (100 + rate)) : 0;
    return { net: r2(amount - vat), vat, total: r2(amount) };
  }
  if (pricesIncludeVat) {
    const vat = r2((amount * rate) / (100 + rate));
    return { net: r2(amount - vat), vat, total: r2(amount) };
  }
  const vat = r2((amount * rate) / 100);
  return { net: r2(amount), vat, total: r2(amount + vat) };
}

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "tabby", label: "Tabby" },
  { id: "tamara", label: "Tamara" },
  { id: "bank", label: "Bank transfer" },
  { id: "store_credit", label: "Store credit" },
  { id: "credit", label: "On credit" },
] as const;

export const methodLabel = (m: string) => PAYMENT_METHODS.find((p) => p.id === m)?.label ?? m;

export const REPAIR_STATUSES = [
  { id: "received", label: "Received" },
  { id: "diagnosing", label: "Diagnosing" },
  { id: "waiting_parts", label: "Waiting for parts" },
  { id: "in_progress", label: "In progress" },
  { id: "ready", label: "Ready for pickup" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export const repairLabel = (s: string) => REPAIR_STATUSES.find((x) => x.id === s)?.label ?? s;

export const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;

export function waLink(phone: string, text: string) {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("05") && p.length === 10) p = "971" + p.slice(1);
  else if (p.startsWith("5") && p.length === 9) p = "971" + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export function numf(fd: FormData, key: string) {
  const v = parseFloat(String(fd.get(key) ?? "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}
