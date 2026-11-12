import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import Sidebar from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (!n?.n) redirect("/setup");
  const user = await getUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  const areas = ["dashboard", "pos", "sales", "repairs", "buyback", "products", "imei", "purchases", "suppliers", "customers", "expenses", "reports", "settings"].filter((a) =>
    can(user, a),
  );
  return (
    <div className="flex min-h-screen">
      <Sidebar shopName={s.shop_name} logo={s.logo} userName={user.name} role={user.role} areas={areas} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-16 md:px-8 md:pb-10 md:pt-8">{children}</main>
    </div>
  );
}
