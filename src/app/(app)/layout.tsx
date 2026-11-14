import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { getUser, canAny } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import Sidebar from "@/components/sidebar";
import IdleLogout from "@/components/idle-logout";
import CommandPalette from "@/components/command-palette";
import PageTools from "@/components/page-tools";
import { getPref, type PageRef } from "@/lib/prefs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (!n?.n) redirect("/setup");
  const user = await getUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  const NAV_PERMS: Record<string, string[]> = {
    dashboard: [], pos: ["pos"], orders: ["orders"], website: ["website"], accounting: ["accounting"], crm: ["crm"], support: ["support"], hr: ["hr", "payroll"], tasks: ["tasks"], marketing: ["marketing"], shipping: ["shipping"], automation: ["integrations"], sales: ["sales.view"], repairs: ["repairs"], buyback: ["buyback"], products: ["products.view"], imei: ["imei"],
    purchases: ["purchases"], suppliers: ["suppliers"], customers: ["customers"], expenses: ["expenses"],
    reports: ["reports", "reports.day", "reports.vat"], settings: ["settings", "staff", "data", "activity", "integrations"],
  };
  const areas = Object.entries(NAV_PERMS).filter(([, p]) => p.length === 0 || canAny(user, p)).map(([a]) => a);
  const ACTIONS = [
    { title: "New sale", href: "/pos", perm: "pos" },
    { title: "New sales order", href: "/orders/new", perm: "orders" },
    { title: "New quotation", href: "/orders/new?kind=quote", perm: "orders" },
    { title: "New repair job card", href: "/repairs/new", perm: "repairs" },
    { title: "Buy a used device", href: "/buyback/new", perm: "buyback" },
    { title: "Add a product", href: "/products/new", perm: "products.edit" },
    { title: "Import products from Excel / CSV", href: "/products/import", perm: "products.import" },
    { title: "New purchase from supplier", href: "/purchases/new", perm: "purchases" },
    { title: "Add a lead", href: "/crm?add=1", perm: "crm" },
    { title: "Follow-ups due", href: "/crm/followups", perm: "crm" },
    { title: "New support ticket", href: "/support?new=1", perm: "support" },
    { title: "Add a task", href: "/tasks?add=1", perm: "tasks" },
    { title: "Mark attendance", href: "/hr/attendance", perm: "hr" },
    { title: "Leave requests", href: "/hr/leave", perm: "hr" },
    { title: "Prepare payroll", href: "/hr/payroll", perm: "payroll" },
    { title: "Payment reminders (unpaid invoices)", href: "/sales/reminders", perm: "sales.payments" },
    { title: "Recurring invoices", href: "/sales/recurring", perm: "sales.payments" },
    { title: "Create a coupon", href: "/marketing", perm: "marketing" },
    { title: "New shipment", href: "/shipping?new=1", perm: "shipping" },
    { title: "Automation rules", href: "/automation", perm: "integrations" },
    { title: "Integrations: email, payments, API keys", href: "/settings/integrations", perm: "integrations" },
    { title: "Report builder", href: "/reports/builder", perm: "reports" },
    { title: "Purchase orders & requests", href: "/purchases/orders", perm: "purchases" },
    { title: "Reorder suggestions", href: "/purchases/reorder", perm: "purchases" },
    { title: "Categories & brands", href: "/products/catalog", perm: "products.view" },
    { title: "Campaigns & abandoned carts", href: "/marketing/campaigns", perm: "marketing" },
    { title: "Website banners, pages & SEO", href: "/website/content", perm: "website" },
    { title: "Delivery zones", href: "/shipping/zones", perm: "shipping" },
    { title: "Calendar", href: "/calendar", perm: "" },
    { title: "Notifications", href: "/notifications", perm: "" },
    { title: "Sales commissions", href: "/hr/commissions", perm: "payroll" },
    { title: "Public holidays", href: "/hr/holidays", perm: "hr" },
    { title: "Approvals, custom fields & closing the books", href: "/settings/workflow", perm: "settings" },
    { title: "System health & logs", href: "/settings/system", perm: "settings" },
    { title: "Team, support & delivery reports", href: "/reports/performance", perm: "reports" },
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
  const pins = await getPref<PageRef[]>(user.id, "pins", []);
  const recent = await getPref<PageRef[]>(user.id, "recent", []);
  const lang = await getPref<string>(user.id, "lang", s.default_language || "en");
  return (
    <div className="flex min-h-screen" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <CommandPalette actions={ACTIONS} />
      <Sidebar
        shopName={s.shop_name}
        logo={s.logo}
        userName={user.name}
        role={user.role}
        areas={areas}
        pins={pins}
        lang={lang}
        unread={(await one<{ n: number }>("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [user.id]))?.n ?? 0}
        reportsHref={canAny(user, ["reports"]) ? "/reports" : canAny(user, ["reports.day"]) ? "/reports/day" : "/reports/vat"}
        settingsHref={canAny(user, ["settings"]) ? "/settings" : canAny(user, ["staff"]) ? "/settings/staff" : canAny(user, ["data"]) ? "/settings/data" : canAny(user, ["integrations"]) ? "/settings/integrations" : "/settings/activity"}
      />
      <IdleLogout minutes={s.idle_timeout_minutes} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-16 md:px-8 md:pb-10 md:pt-8"><PageTools pins={pins} recent={recent} />{children}</main>
    </div>
  );
}
