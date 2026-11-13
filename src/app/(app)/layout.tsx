import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { getUser, canAny } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import Sidebar from "@/components/sidebar";
import IdleLogout from "@/components/idle-logout";
import CommandPalette from "@/components/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (!n?.n) redirect("/setup");
  const user = await getUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  const NAV_PERMS: Record<string, string[]> = {
    dashboard: [], pos: ["pos"], sales: ["sales.view"], repairs: ["repairs"], buyback: ["buyback"], products: ["products.view"], imei: ["imei"],
    purchases: ["purchases"], suppliers: ["suppliers"], customers: ["customers"], expenses: ["expenses"],
    reports: ["reports", "reports.day", "reports.vat"], settings: ["settings", "staff", "data", "activity"],
  };
  const areas = Object.entries(NAV_PERMS).filter(([, p]) => p.length === 0 || canAny(user, p)).map(([a]) => a);
  const ACTIONS = [
    { title: "New sale", href: "/pos", perm: "pos" },
    { title: "New repair job card", href: "/repairs/new", perm: "repairs" },
    { title: "Buy a used device", href: "/buyback/new", perm: "buyback" },
    { title: "Add a product", href: "/products/new", perm: "products.edit" },
    { title: "Import products from Excel / CSV", href: "/products/import", perm: "products.import" },
    { title: "New purchase from supplier", href: "/purchases/new", perm: "purchases" },
    { title: "Record an expense", href: "/expenses", perm: "expenses" },
    { title: "Day close", href: "/reports/day", perm: "reports.day" },
    { title: "VAT return report", href: "/reports/vat", perm: "reports.vat" },
    { title: "Staff & roles", href: "/settings/staff", perm: "staff" },
    { title: "Security & login history", href: "/settings/security", perm: "staff" },
    { title: "Backup & export", href: "/settings/data", perm: "data" },
    { title: "My account & two-step login", href: "/account", perm: "" },
  ]
    .filter((a) => !a.perm || canAny(user, [a.perm]))
    .map(({ title, href }) => ({ group: "Quick actions", title, sub: "", href }));
  return (
    <div className="flex min-h-screen">
      <CommandPalette actions={ACTIONS} />
      <Sidebar
        shopName={s.shop_name}
        logo={s.logo}
        userName={user.name}
        role={user.role}
        areas={areas}
        reportsHref={canAny(user, ["reports"]) ? "/reports" : canAny(user, ["reports.day"]) ? "/reports/day" : "/reports/vat"}
        settingsHref={canAny(user, ["settings"]) ? "/settings" : canAny(user, ["staff"]) ? "/settings/staff" : canAny(user, ["data"]) ? "/settings/data" : "/settings/activity"}
      />
      <IdleLogout minutes={s.idle_timeout_minutes} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-16 md:px-8 md:pb-10 md:pt-8">{children}</main>
    </div>
  );
}
