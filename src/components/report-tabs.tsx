import Link from "next/link";
import { getUser, can } from "@/lib/auth";

const TABS = [
  { href: "/reports", label: "Sales & profit", perm: "reports" },
  { href: "/reports/day", label: "Day close", perm: "reports.day" },
  { href: "/reports/vat", label: "VAT return", perm: "reports.vat" },
  { href: "/reports/stock", label: "Stock", perm: "reports" },
];

export default async function ReportTabs({ active, from, to }: { active: string; from?: string; to?: string }) {
  const user = await getUser();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.filter((t) => user && can(user, t.perm)).map((t) => (
          <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 text-sm transition ${active === t.href ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t.label}</Link>
        ))}
      </div>
      {from && (
        <form className="ml-auto flex gap-2">
          <input type="date" name="from" defaultValue={from} className="input w-40" />
          <input type="date" name="to" defaultValue={to} className="input w-40" />
          <button className="btn-dark">Apply</button>
        </form>
      )}
    </div>
  );
}

export function monthRange(sp: Record<string, string>) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  return { from: sp.from || today.slice(0, 8) + "01", to: sp.to || today };
}
