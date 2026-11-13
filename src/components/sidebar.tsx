"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Receipt, Wrench, Recycle, Package, ScanLine, Truck, Building2,
  Users, Wallet, BarChart3, Settings, LogOut, Menu, X, UserCircle, Search, Moon, Sun, ChevronDown, Keyboard,
} from "lucide-react";
import { logout } from "@/app/auth-actions";

type Item = { area: string; href: string; label: string; icon: typeof LayoutDashboard; key?: string };

const GROUPS: { id: string; label: string; items: Item[] }[] = [
  {
    id: "main", label: "", items: [
      { area: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, key: "D" },
      { area: "pos", href: "/pos", label: "New sale", icon: ShoppingCart, key: "N" },
    ],
  },
  {
    id: "sales", label: "Sales", items: [
      { area: "sales", href: "/sales", label: "Invoices", icon: Receipt, key: "I" },
      { area: "customers", href: "/customers", label: "Customers", icon: Users, key: "C" },
    ],
  },
  {
    id: "inventory", label: "Inventory", items: [
      { area: "products", href: "/products", label: "Products & stock", icon: Package, key: "P" },
      { area: "imei", href: "/imei", label: "IMEI lookup", icon: ScanLine },
      { area: "purchases", href: "/purchases", label: "Purchases", icon: Truck },
      { area: "suppliers", href: "/suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  {
    id: "service", label: "Service", items: [
      { area: "repairs", href: "/repairs", label: "Repairs", icon: Wrench, key: "R" },
      { area: "buyback", href: "/buyback", label: "Buy used", icon: Recycle },
    ],
  },
  {
    id: "finance", label: "Finance", items: [
      { area: "expenses", href: "/expenses", label: "Expenses", icon: Wallet },
      { area: "reports", href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  { id: "admin", label: "Administration", items: [{ area: "settings", href: "/settings", label: "Settings", icon: Settings }] },
];

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("sd-theme", dark ? "dark" : "light"); } catch {}
}

export default function Sidebar(props: { shopName: string; logo: string; userName: string; role: string; areas: string[]; reportsHref?: string; settingsHref?: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const [help, setHelp] = useState(false);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((n) => props.areas.includes(n.area))
      .map((n) => (n.area === "reports" && props.reportsHref ? { ...n, href: props.reportsHref } : n.area === "settings" && props.settingsHref ? { ...n, href: props.settingsHref } : n)),
  })).filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    try { setClosed(JSON.parse(localStorage.getItem("sd-nav-closed") || "[]")); } catch {}
  }, []);

  // Keyboard shortcuts: Alt + letter opens a page, "?" shows the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName);
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const hit = all.find((i) => i.key && e.code === `Key${i.key}`);
        if (hit) { e.preventDefault(); router.push(hit.href); }
      } else if (e.key === "?" && !typing) setHelp((h) => !h);
      else if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [all, router]);

  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id];
    setClosed(next);
    try { localStorage.setItem("sd-nav-closed", JSON.stringify(next)); } catch {}
  };
  const active = (href: string) => {
    if (href === "/") return path === "/";
    const base = "/" + href.split("/")[1];
    return path.startsWith(base);
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
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
      <div className="px-3 pb-2">
        <button
          onClick={() => { setOpen(false); window.dispatchEvent(new Event("open-search")); }}
          className="flex h-9 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition hover:border-slate-300"
        >
          <Search size={15} /> <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[10px]">Ctrl K</kbd>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => {
          const isClosed = g.label && closed.includes(g.id) && !g.items.some((i) => active(i.href));
          return (
            <div key={g.id} className="mt-2">
              {g.label && (
                <button onClick={() => toggleGroup(g.id)} className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                  {g.label}
                  <ChevronDown size={13} className={`transition ${isClosed ? "-rotate-90" : ""}`} />
                </button>
              )}
              {!isClosed && (
                <div className="space-y-0.5">
                  {g.items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active(href) ? "bg-accent/10 font-medium text-accent" : "text-slate-600 hover:bg-slate-100"}`}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <Link href="/account" onClick={() => setOpen(false)} className="-m-1 mb-3 flex items-center gap-2 rounded-lg p-1 hover:bg-slate-50">
          <UserCircle size={28} strokeWidth={1.5} className="shrink-0 text-slate-400" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{props.userName}</span><span className="block text-xs text-slate-400">{props.role} · My account</span></span>
        </Link>
        <div className="flex gap-2">
          <button onClick={() => { setTheme(!dark); setDark(!dark); }} className="btn-ghost btn-sm" aria-label={dark ? "Light mode" : "Dark mode"} title={dark ? "Light mode" : "Dark mode"}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={() => setHelp(true)} className="btn-ghost btn-sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><Keyboard size={14} /></button>
          <form action={logout} className="flex-1">
            <button className="btn-ghost btn-sm w-full"><LogOut size={14} /> Sign out</button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200/80 bg-white md:block">{content}</aside>
      <div className="no-print fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:hidden">
        <span className="font-semibold">{props.shopName}</span>
        <div className="flex gap-2">
          <button onClick={() => window.dispatchEvent(new Event("open-search"))} className="btn-ghost btn-sm" aria-label="Search"><Search size={16} /></button>
          <button onClick={() => setOpen(true)} className="btn-ghost btn-sm" aria-label="Menu"><Menu size={16} /></button>
        </div>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 p-1 text-slate-400" aria-label="Close"><X size={18} /></button>
            {content}
          </aside>
        </div>
      )}
      {help && (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setHelp(false)}>
          <div className="card w-full max-w-sm p-6 fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-semibold">Keyboard shortcuts</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Search anything</dt><dd><kbd className="kbd">Ctrl K</kbd> or <kbd className="kbd">/</kbd></dd></div>
              {all.filter((i) => i.key).map((i) => (
                <div key={i.href} className="flex justify-between"><dt>{i.label}</dt><dd><kbd className="kbd">Alt {i.key}</kbd></dd></div>
              ))}
              <div className="flex justify-between"><dt>Complete sale (on New sale)</dt><dd><kbd className="kbd">F9</kbd></dd></div>
              <div className="flex justify-between"><dt>Show this list</dt><dd><kbd className="kbd">?</kbd></dd></div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
