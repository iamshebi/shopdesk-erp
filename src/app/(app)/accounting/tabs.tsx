import Link from "next/link";

const TABS = [
  { href: "/accounting", label: "Overview" },
  { href: "/accounting/pl", label: "Profit & loss" },
  { href: "/accounting/balance", label: "Balance sheet" },
  { href: "/accounting/cashflow", label: "Cash flow" },
  { href: "/accounting/ledger", label: "General ledger" },
  { href: "/accounting/journal", label: "Journal entries" },
  { href: "/accounting/bank", label: "Bank reconciliation" },
  { href: "/accounting/accounts", label: "Chart of accounts" },
];

export default function AccountingTabs({ active }: { active: string }) {
  return (
    <div className="no-print mb-6 flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 text-sm transition ${active === t.href ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t.label}</Link>
      ))}
    </div>
  );
}

export function Period({ from, to, path, extra }: { from: string; to: string; path: string; extra?: React.ReactNode }) {
  return (
    <form action={path} className="no-print mb-4 flex flex-wrap items-end gap-2">
      {extra}
      <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input w-40" /></div>
      <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input w-40" /></div>
      <button className="btn-dark">Show</button>
    </form>
  );
}
