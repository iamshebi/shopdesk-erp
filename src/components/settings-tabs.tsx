import Link from "next/link";
import { getUser, can } from "@/lib/auth";

const TABS = [
  { href: "/settings", label: "Shop & invoices", perm: "settings" },
  { href: "/settings/staff", label: "Staff & roles", perm: "staff" },
  { href: "/settings/security", label: "Security", perm: "staff" },
  { href: "/settings/data", label: "Import, export & backup", perm: "data" },
  { href: "/settings/activity", label: "Activity log", perm: "activity" },
];

export default async function SettingsTabs({ active }: { active: string }) {
  const user = await getUser();
  return (
    <div className="mb-6 flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.filter((t) => user && can(user, t.perm)).map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 text-sm transition ${active === t.href ? "bg-white font-medium shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
