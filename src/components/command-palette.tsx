"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";

interface Hit { group: string; title: string; sub: string; href: string }

/** Global search and quick actions. Opens with Ctrl+K / ⌘K, "/" or the search button (window event "open-search"). */
export default function CommandPalette({ actions }: { actions: Hit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-search", onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setTerm(""); setHits([]); setSel(0); setTimeout(() => input.current?.focus(), 10); }
  }, [open]);

  useEffect(() => {
    if (term.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term.trim())}`, { signal: ctl.signal });
        const j = await r.json();
        setHits(j.hits ?? []);
        setSel(0);
      } catch {}
      setLoading(false);
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term]);

  if (!open) return null;
  const list = term.trim().length < 2 ? actions.filter((a) => !term || a.title.toLowerCase().includes(term.toLowerCase())) : hits;
  const go = (h?: Hit) => { if (!h) return; setOpen(false); router.push(h.href); };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div className="card w-full max-w-xl overflow-hidden shadow-2xl fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); go(list[sel]); }
            }}
            placeholder="Search products, IMEI, invoices, customers, repairs…"
            className="h-14 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {list.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-slate-400">{loading ? "Searching…" : term.trim().length < 2 ? "Type to search" : "Nothing found"}</div>
          ) : (
            list.map((h, i) => (
              <div key={h.href + i}>
                {(i === 0 || list[i - 1].group !== h.group) && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{h.group}</div>}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === sel ? "bg-accent/10 text-accent" : "text-slate-700"}`}
                >
                  <span className="min-w-0"><span className="block truncate font-medium">{h.title}</span>{h.sub && <span className="block truncate text-xs text-slate-400">{h.sub}</span>}</span>
                  {i === sel && <CornerDownLeft size={14} className="shrink-0" />}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>↑↓ to move</span><span>Enter to open</span><span>Ctrl+K or / to search anytime</span>
        </div>
      </div>
    </div>
  );
}
