"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Star, History, ChevronRight } from "lucide-react";
import { recordVisit, togglePin } from "@/app/(app)/prefs-actions";

const NAMES: Record<string, string> = { pos: "New sale", crm: "CRM", hr: "HR", kb: "Knowledge base", pl: "Profit & loss", po: "Purchase orders", imei: "IMEI lookup", new: "New", edit: "Edit" };
const nice = (seg: string) => NAMES[seg] ?? (/^\d+$/.test(seg) ? `#${seg}` : seg.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

/** Breadcrumbs, "pin this page" (keeps the filters) and recently viewed pages. */
export default function PageTools({ pins, recent }: { pins: { href: string; title: string }[]; recent: { href: string; title: string }[] }) {
  const path = usePathname();
  const qs = useSearchParams().toString();
  const href = qs && !/(^|&)(ok|err|saved|new)=/.test(qs) ? `${path}?${qs}` : path;
  const [list, setList] = useState(pins);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  useEffect(() => setList(pins), [pins]);
  useEffect(() => {
    setOpen(false);
    const t = setTimeout(() => { const h1 = document.querySelector("h1")?.textContent?.trim(); if (h1) start(() => { recordVisit(path, h1); }); }, 1500);
    return () => clearTimeout(t);
  }, [path]);
  const segs = path.split("/").filter(Boolean);
  const pinned = list.some((p) => p.href === href);
  const pin = () => {
    let title = document.querySelector("h1")?.textContent?.trim() || nice(segs[segs.length - 1] ?? "Page");
    if (!pinned && qs) title = window.prompt("Name for this saved view", title) ?? "";
    if (!pinned && !title) return;
    start(async () => setList(await togglePin(href, title)));
  };
  if (path === "/") return null;
  return (
    <div className="no-print mb-3 flex items-center justify-between gap-2 text-xs text-slate-400">
      <nav className="flex min-w-0 items-center gap-1 truncate" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-700">Home</Link>
        {segs.map((s, i) => <span key={i} className="flex items-center gap-1"><ChevronRight size={12} />{i < segs.length - 1 ? <Link href={"/" + segs.slice(0, i + 1).join("/")} className="hover:text-slate-700">{nice(s)}</Link> : <span className="text-slate-600">{nice(s)}</span>}</span>)}
      </nav>
      <div className="relative flex shrink-0 items-center gap-1">
        <button onClick={pin} className={`rounded-lg p-1.5 hover:bg-slate-100 ${pinned ? "text-amber-500" : ""}`} title={pinned ? "Remove from pinned" : qs ? "Save this view (keeps the filters)" : "Pin this page"} aria-label="Pin this page"><Star size={15} fill={pinned ? "currentColor" : "none"} /></button>
        <button onClick={() => setOpen(!open)} className="rounded-lg p-1.5 hover:bg-slate-100" title="Recently viewed" aria-label="Recently viewed"><History size={15} /></button>
        {open && (
          <div className="absolute right-0 top-8 z-30 w-72 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-lg">
            <div className="px-2 py-1 text-xs font-medium text-slate-400">Recently viewed</div>
            {recent.map((r) => <Link key={r.href} href={r.href} className="block truncate rounded-lg px-2 py-1.5 hover:bg-slate-100">{r.title}</Link>)}
            {recent.length === 0 && <div className="px-2 py-1.5 text-slate-400">Nothing yet</div>}
          </div>
        )}
      </div>
    </div>
  );
}
