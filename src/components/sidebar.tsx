"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Receipt, Wrench, Recycle, Package, ScanLine, Truck, Building2,
  Users, Wallet, BarChart3, Settings, LogOut, Menu, X, UserCircle,
} from "lucide-react";
import { logout } from "@/app/auth-actions";

const NAV = [
  { area: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { area: "pos", href: "/pos", label: "New sale", icon: ShoppingCart },
  { area: "sales", href: "/sales", label: "Invoices", icon: Receipt },
  { area: "repairs", href: "/repairs", label: "Repairs", icon: Wrench },
  { area: "buyback", href: "/buyback", label: "Buy used", icon: Recycle },
  { area: "products", href: "/products", label: "Stock", icon: Package },
  { area: "imei", href: "/imei", label: "IMEI lookup", icon: ScanLine },
  { area: "purchases", href: "/purchases", label: "Purchases", icon: Truck },
  { area: "suppliers", href: "/suppliers", label: "Suppliers", icon: Building2 },
  { area: "customers", href: "/customers", label: "Customers", icon: Users },
  { area: "expenses", href: "/expenses", label: "Expenses", icon: Wallet },
  { area: "reports", href: "/reports", label: "Reports", icon: BarChart3 },
  { area: "settings", href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar(props: { shopName: string; logo: string; userName: string; role: string; areas: string[]; reportsHref?: string; settingsHref?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => props.areas.includes(n.area)).map((n) =>
    n.area === "reports" && props.reportsHref ? { ...n, href: props.reportsHref } : n.area === "settings" && props.settingsHref ? { ...n, href: props.settingsHref } : n,
  );
  const active = (href: string) => {
    if (href === "/") return path === "/";
    const base = "/" + href.split("/")[1];
    return path.startsWith(base);
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        {props.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-semibold text-white">{props.shopName.slice(0, 1)}</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{props.shopName}</div>
          <div className="text-[11px] text-slate-400">ShopDesk ERP</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
              active(href) ? "bg-accent/10 font-medium text-accent" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={17} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <Link href="/account" onClick={() => setOpen(false)} className="mb-3 flex items-center gap-2 rounded-lg p-1 -m-1 hover:bg-slate-50">
          <UserCircle size={28} strokeWidth={1.5} className="shrink-0 text-slate-400" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{props.userName}</span><span className="block text-xs capitalize text-slate-400">{props.role} · My account</span></span>
        </Link>
        <form action={logout}>
          <button className="btn-ghost btn-sm w-full">
            <LogOut size={14} /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200/80 bg-white md:block">{content}</aside>
      <div className="no-print fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <span className="font-semibold">{props.shopName}</span>
        <button onClick={() => setOpen(true)} className="btn-ghost btn-sm" aria-label="Menu">
          <Menu size={16} />
        </button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 p-1 text-slate-400" aria-label="Close">
              <X size={18} />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
