import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { getUser, canAny } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import Sidebar from "@/components/sidebar";
import IdleLogout from "@/components/idle-logout";

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
  return (
    <div className="flex min-h-screen">
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
