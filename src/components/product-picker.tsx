"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { searchProducts, type ProductHit } from "@/app/(app)/lookup-actions";

/** Search box with dropdown results. Enter picks the first hit (works with barcode / IMEI scanners). */
export default function ProductPicker(props: { onPick: (p: ProductHit) => void; placeholder?: string; autoFocus?: boolean }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();
  const seq = useRef(0);
  const hitsFor = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const my = ++seq.current;
    const h = setTimeout(() => {
      start(async () => {
        const r = await searchProducts(term);
        if (my === seq.current) {
          hitsFor.current = term;
          setHits(r);
          setActive(0);
        }
      });
    }, term ? 120 : 0);
    return () => clearTimeout(h);
  }, [term]);

  function pick(p: ProductHit) {
    props.onPick(p);
    setTerm("");
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={term}
        autoFocus={props.autoFocus}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={async (e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") {
            e.preventDefault();
            // Scanners type fast then press Enter: search fresh to be safe.
            const fresh = hitsFor.current === term && hits.length > 0;
            const r = fresh ? hits : await searchProducts(term);
            const choice = fresh ? r[active] ?? r[0] : r[0];
            if (choice) pick(choice);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={props.placeholder ?? "Search or scan barcode / IMEI…"}
        className="input h-12 pl-9 text-base"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl fade-in">
          {hits.map((p, i) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-slate-100" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-slate-400">
                  {[p.brand, p.category, p.sku].filter(Boolean).join(" · ")}
                  {p.match_unit && <span className="ml-1 text-accent">IMEI {p.match_unit.imei}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular-nums">{p.price.toFixed(2)}</div>
                <div className={`text-xs ${p.stock !== null && p.stock <= 0 ? "text-red-500" : "text-slate-400"}`}>{p.stock === null ? "service" : `${p.stock} in stock`}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
