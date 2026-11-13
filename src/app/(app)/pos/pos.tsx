"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, User, X } from "lucide-react";
import ProductPicker from "@/components/product-picker";
import { availableUnits, searchCustomers, type ProductHit } from "../lookup-actions";
import { checkout, previewCoupon } from "./actions";
import { PAYMENT_METHODS } from "@/lib/util";

interface Line {
  key: string;
  product: ProductHit;
  unit_id: number | null;
  imei: string;
  units: { id: number; imei: string; margin_scheme: boolean; price: number | null }[];
  qty: number;
  price: string;
  discount: string;
}

const n = (v: string | number) => {
  const x = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const f2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Pos({ vatRate, inclusive, currency, preset, perms }: {
  vatRate: number; inclusive: boolean; currency: string; preset: ProductHit | null; perms: { price: boolean; discount: boolean; credit: boolean };
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState({ id: null as number | null, name: "", phone: "", trn: "", address: "" });
  const [custHits, setCustHits] = useState<any[]>([]);
  const [showB2B, setShowB2B] = useState(false);
  const [pays, setPays] = useState<{ method: string; amount: string }[]>([{ method: "cash", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ discount: number; label: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function add(p: ProductHit) {
    setError("");
    if (p.track_serial) {
      const units = await availableUnits(p.id);
      const taken = new Set(lines.map((l) => l.unit_id));
      const free = units.filter((u) => !taken.has(u.id));
      const chosen = p.match_unit && !taken.has(p.match_unit.id) ? p.match_unit : free.length === 1 ? free[0] : null;
      if (!free.length) {
        setError(`${p.name}: no IMEI in stock`);
        return;
      }
      setLines((ls) => [...ls, { key: crypto.randomUUID(), product: p, unit_id: chosen?.id ?? null, imei: chosen?.imei ?? "", units: free, qty: 1, price: String(chosen?.price ?? p.price), discount: "" }]);
    } else {
      setLines((ls) => {
        const ex = ls.find((l) => l.product.id === p.id && !p.track_serial);
        if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
        return [...ls, { key: crypto.randomUUID(), product: p, unit_id: null, imei: "", units: [], qty: 1, price: String(p.price), discount: "" }];
      });
    }
  }

  useEffect(() => {
    if (preset) add(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const grossSum = useMemo(() => lines.reduce((a, l) => a + Math.max(0, l.qty * n(l.price) - n(l.discount)), 0), [lines]);
  const totals = useMemo(() => {
    let total = 0, vat = 0, disc = couponInfo ? Math.min(couponInfo.discount, grossSum) : 0;
    const factor = grossSum > 0 ? (grossSum - disc) / grossSum : 1;
    for (const l of lines) {
      const gross = (l.qty * n(l.price) - n(l.discount)) * factor;
      disc += n(l.discount);
      const marginUnit = l.units.find((u) => u.id === l.unit_id)?.margin_scheme;
      if (vatRate > 0 && !marginUnit) {
        if (inclusive) { vat += (gross * vatRate) / (100 + vatRate); total += gross; }
        else { vat += (gross * vatRate) / 100; total += gross * (1 + vatRate / 100); }
      } else total += gross;
    }
    return { total, vat, disc, net: total - vat };
  }, [lines, vatRate, inclusive, couponInfo, grossSum]);
  useEffect(() => { setCouponInfo(null); }, [grossSum]);
  async function applyCoupon() {
    if (!coupon.trim()) { setCouponInfo(null); return; }
    const r = await previewCoupon(coupon, grossSum, { id: customer.id, phone: customer.phone });
    if (r.error) { setError(r.error); setCouponInfo(null); } else { setError(""); setCouponInfo({ discount: r.discount!, label: r.label! }); }
  }

  const paid = pays.filter((p) => p.method !== "credit").reduce((a, p) => a + n(p.amount), 0);
  const effectivePaid = pays.length === 1 && pays[0].amount === "" && pays[0].method !== "credit" ? totals.total : paid;
  const change = effectivePaid - totals.total;

  useEffect(() => {
    const h = setTimeout(async () => {
      const t = customer.phone.length >= 3 ? customer.phone : customer.name.length >= 2 ? customer.name : "";
      if (!customer.id && t) setCustHits(await searchCustomers(t));
      else setCustHits([]);
    }, 200);
    return () => clearTimeout(h);
  }, [customer.name, customer.phone, customer.id]);

  function complete() {
    setError("");
    const missing = lines.find((l) => l.product.track_serial && !l.unit_id);
    if (missing) return setError(`Choose the IMEI for ${missing.product.name}`);
    const payments = pays.length === 1 && pays[0].amount === "" ? [{ method: pays[0].method, amount: pays[0].method === "credit" ? 0 : totals.total }] : pays.map((p) => ({ method: p.method, amount: n(p.amount) }));
    start(async () => {
      const r = await checkout({
        customer,
        notes,
        coupon: couponInfo ? coupon : "",
        lines: lines.map((l) => ({ product_id: l.product.id, unit_id: l.unit_id, qty: l.qty, unit_price: n(l.price), discount: n(l.discount) })),
        payments,
      });
      if (r.error) setError(r.error);
      else router.push(`/sales/${r.id}?new=1`);
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9" && lines.length && !pending) { e.preventDefault(); complete(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">New sale</h1>
          {lines.length > 0 && <button className="btn-ghost btn-sm" onClick={() => setLines([])}>Clear</button>}
        </div>
        <ProductPicker onPick={add} autoFocus />
        <div className="card divide-y divide-slate-100">
          {lines.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-400">Scan a barcode or IMEI, or search to add items.</div>}
          {lines.map((l) => {
            const lineTotal = l.qty * n(l.price) - n(l.discount);
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 fade-in md:flex-nowrap">
                <div className="min-w-0 basis-full flex-1 md:basis-auto">
                  <div className="font-medium">{l.product.name}</div>
                  {l.product.track_serial ? (
                    <select value={l.unit_id ?? ""} onChange={(e) => { const u = l.units.find((x) => x.id === Number(e.target.value)); upd(l.key, { unit_id: u?.id ?? null, imei: u?.imei ?? "", ...(u?.price ? { price: String(u.price) } : {}) }); }}
                      className={`input mt-1 h-8 max-w-xs font-mono text-xs ${!l.unit_id ? "border-amber-400" : ""}`}>
                      <option value="">Select IMEI…</option>
                      {l.units.filter((u) => u.id === l.unit_id || !lines.some((o) => o.unit_id === u.id)).map((u) => (
                        <option key={u.id} value={u.id}>{u.imei}{u.margin_scheme ? " (used)" : ""}{u.price ? ` · ${u.price}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-slate-400">{l.product.stock !== null && l.qty > l.product.stock ? <span className="text-amber-600">Only {l.product.stock} in stock</span> : l.product.sku}</div>
                  )}
                </div>
                {!l.product.track_serial && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="btn-ghost btn-sm px-2" onClick={() => upd(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="Less"><Minus size={14} /></button>
                    <input className="input h-8 w-12 text-center" value={l.qty} onChange={(e) => upd(l.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })} />
                    <button className="btn-ghost btn-sm px-2" onClick={() => upd(l.key, { qty: l.qty + 1 })} aria-label="More"><Plus size={14} /></button>
                  </div>
                )}
                <div className="w-24 shrink-0"><div className="text-[10px] uppercase text-slate-400">Price</div><input className="input h-8 text-right disabled:bg-slate-50 disabled:text-slate-500" inputMode="decimal" value={l.price} disabled={!perms.price} title={perms.price ? "" : "Your role can't change prices"} onChange={(e) => upd(l.key, { price: e.target.value })} /></div>
                {perms.discount && <div className="w-20 shrink-0"><div className="text-[10px] uppercase text-slate-400">Discount</div><input className="input h-8 text-right" inputMode="decimal" value={l.discount} placeholder="0" onChange={(e) => upd(l.key, { discount: e.target.value })} /></div>}
                <div className="ml-auto w-24 shrink-0 text-right font-semibold tabular-nums">{f2(lineTotal)}</div>
                <button className="shrink-0 p-1 text-slate-400 hover:text-red-500" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><User size={16} /> Customer</h2>
            {customer.id && <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setCustomer({ id: null, name: "", phone: "", trn: "", address: "" })}><X size={14} /></button>}
          </div>
          <div className="relative grid grid-cols-2 gap-2">
            <input className="input" placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, id: null, name: e.target.value })} />
            <input className="input" placeholder="Phone" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, id: null, phone: e.target.value })} />
            {custHits.length > 0 && (
              <div className="absolute top-11 z-10 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {custHits.map((c) => (
                  <button key={c.id} className="flex w-full justify-between rounded-lg px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                    onClick={() => { setCustomer({ id: c.id, name: c.name, phone: c.phone, trn: c.trn, address: c.address }); setCustHits([]); if (c.trn) setShowB2B(true); }}>
                    <span>{c.name}</span><span className="text-slate-400">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {showB2B ? (
            <div className="grid gap-2">
              <input className="input" placeholder="Customer TRN" value={customer.trn} onChange={(e) => setCustomer({ ...customer, trn: e.target.value })} />
              <input className="input" placeholder="Customer address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            </div>
          ) : (
            <button className="text-xs text-accent hover:underline" onClick={() => setShowB2B(true)}>+ Business customer (TRN)</button>
          )}
        </div>

        <div className="card space-y-4 p-5">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Items</span><span>{lines.reduce((a, l) => a + l.qty, 0)}</span></div>
            {totals.disc > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span className="tabular-nums">−{f2(totals.disc)}</span></div>}
            <div className="flex justify-between text-slate-500"><span>Net</span><span className="tabular-nums">{f2(totals.net)}</span></div>
            <div className="flex justify-between text-slate-500"><span>VAT {vatRate}%</span><span className="tabular-nums">{f2(totals.vat)}</span></div>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{currency} {f2(totals.total)}</span>
          </div>

          <div className="space-y-2">
            {pays.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select className="input w-36" value={p.method} onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>
                  {PAYMENT_METHODS.filter((m) => perms.credit || m.id !== "credit").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <input className="input text-right" inputMode="decimal" placeholder={pays.length === 1 ? f2(totals.total) : "0.00"} value={p.amount}
                  onChange={(e) => setPays((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} disabled={p.method === "credit"} />
                {pays.length > 1 && <button className="p-1 text-slate-400" onClick={() => setPays((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>}
              </div>
            ))}
            <button className="text-xs text-accent hover:underline" onClick={() => setPays((ps) => [...ps, { method: "card", amount: "" }])}>+ Split payment</button>
          </div>
          {lines.length > 0 && (
            <div className="text-sm">
              {change > 0.004 && <div className="flex justify-between font-medium text-emerald-700"><span>Change to give</span><span className="tabular-nums">{f2(change)}</span></div>}
              {change < -0.004 && <div className="flex justify-between font-medium text-amber-700"><span>Balance on credit</span><span className="tabular-nums">{f2(-change)}</span></div>}
            </div>
          )}
          <div className="flex gap-2">
            <input className="input uppercase" placeholder="Coupon / voucher code" value={coupon} onChange={(e) => { setCoupon(e.target.value); setCouponInfo(null); }} />
            <button type="button" className="btn-ghost shrink-0" onClick={applyCoupon} disabled={!lines.length}>Apply</button>
          </div>
          {couponInfo && <div className="flex justify-between text-sm text-emerald-700"><span>Coupon {coupon.toUpperCase()} ({couponInfo.label})</span><span className="tabular-nums">−{f2(couponInfo.discount)}</span></div>}
          <input className="input" placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary h-12 w-full text-base" disabled={!lines.length || pending} onClick={complete}>
            {pending ? "Saving…" : "Complete sale"} <span className="text-xs opacity-70">F9</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
