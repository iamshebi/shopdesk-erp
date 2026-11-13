import Link from "next/link";

const TABS = [
  { href: "/inventory", label: "Warehouses" },
  { href: "/inventory/transfer", label: "Transfer" },
  { href: "/inventory/adjust", label: "Adjust" },
  { href: "/inventory/counts", label: "Stock counts" },
  { href: "/inventory/moves", label: "Movements" },
];

export default function InventoryTabs({ active }: { active: string }) {
  return (
    <div className="mb-6 flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 text-sm transition ${active === t.href ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t.label}</Link>
      ))}
    </div>
  );
}
