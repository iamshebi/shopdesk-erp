import QRCode from "qrcode";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { code128Svg } from "@/lib/barcode";
import { num } from "@/lib/util";
import { parseLabelSize, labelPageCss, LABEL_SIZES } from "@/lib/print";
import PrintButton from "@/components/print-button";
import AutoPrint from "@/components/auto-print";

type Label = { name: string; brand: string; code: string; price: number; discount: number | null; imei2?: string; bar: string; qr: string };

// Product labels (name, price, Code 128 barcode, QR) and IMEI labels for phones in stock.
//   ?ids=1,2&copies=2        product labels
//   ?units=5,6               IMEI labels for those units
//   ?product=3&imei=1        IMEI labels for every unit of product 3 still in stock
//   &size=50x25 | a4          override the label size from Settings → Printing
// A4: 3 across on a sheet. Label roll: one label per page, cut to the exact label size, for Zebra / TSC / Xprinter.
export default async function Labels({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("products.view");
  const sp = await searchParams;
  const s = await getSettings();
  const sizeKey = LABEL_SIZES.includes(sp.size) ? sp.size : s.label_size || "a4";
  const roll = parseLabelSize(sizeKey);
  const copies = Math.max(1, Math.min(50, Number(sp.copies) || 1));
  const list = (v?: string) => (v || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);

  let labels: Label[] = [];
  const unitIds = list(sp.units);
  const productForUnits = sp.imei ? list(sp.product)[0] : 0;
  if (unitIds.length || productForUnits) {
    const units = await q<any>(
      `SELECT u.id, u.imei, u.imei2, COALESCE(u.price, p.price) price, p.discount_price, p.name, p.brand
         FROM units u JOIN products p ON p.id = u.product_id
        WHERE ${unitIds.length ? "u.id = ANY($1::int[])" : "u.product_id = $1 AND u.status = 'in_stock'"}
        ORDER BY u.id LIMIT 300`,
      [unitIds.length ? unitIds : productForUnits],
    );
    labels = await Promise.all(
      units.map(async (u) => ({
        name: u.name, brand: u.brand || "", code: u.imei, imei2: u.imei2 || "", price: Number(u.price), discount: u.discount_price ? Number(u.discount_price) : null,
        bar: code128Svg(u.imei, { height: 40 }), qr: await QRCode.toString(u.imei, { type: "svg", margin: 0 }),
      })),
    );
  } else {
    const rows = await q<any>("SELECT id, name, brand, sku, barcode, price, discount_price FROM products WHERE id = ANY($1::int[]) ORDER BY name", [list(sp.ids)]);
    labels = await Promise.all(
      rows.map(async (p) => {
        const code = p.barcode || p.sku || `P${String(p.id).padStart(5, "0")}`;
        return { name: p.name, brand: p.brand || "", code, price: Number(p.price), discount: p.discount_price ? Number(p.discount_price) : null, bar: code128Svg(code, { height: 40 }), qr: await QRCode.toString(code, { type: "svg", margin: 0 }) };
      }),
    );
  }
  const all = labels.flatMap((l) => Array.from({ length: copies }, () => l));
  const priceLine = (l: Label) =>
    l.discount ? <><span className="mr-1 text-[0.7em] font-normal line-through">{num(l.price)}</span>{s.currency} {num(l.discount)}</> : <>{s.currency} {num(l.price)}</>;

  const toolbar = (
    <div className="no-print mb-4 flex items-center justify-between gap-3 p-4">
      <div className="text-sm">{all.length} labels · {roll ? `label roll ${roll.w} × ${roll.h} mm` : "A4 sheet"}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Size:</span>
        {["a4", ...(roll ? [sizeKey] : []), "50x25", "40x30"].filter((v, i, a) => a.indexOf(v) === i).map((v) => {
          const qs = new URLSearchParams({ ...sp, size: v });
          return <a key={v} href={`?${qs}`} className={`rounded px-2 py-1 text-xs ${v === sizeKey ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{v === "a4" ? "A4" : v.replace("x", "×")}</a>;
        })}
        <PrintButton kind={roll ? "label" : "a4"} size={roll ? sizeKey : ""} />
      </div>
    </div>
  );

  if (roll) {
    // Small labels: barcode gets most of the height; QR only when the label is tall enough.
    const tall = roll.h >= 30;
    return (
      <div className="bg-white text-black">
        <style>{labelPageCss(roll.w, roll.h)}</style>
        {sp.auto && <AutoPrint enabled kind="label" size={sizeKey} />}
        {toolbar}
        <div className="flex flex-col items-center gap-3 print:block">
          {all.map((l, i) => (
            <div key={i} data-label className="flex flex-col justify-between bg-white px-[1.5mm] py-[1mm] outline outline-1 outline-slate-300 print:outline-none">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[7px] uppercase">{s.shop_name}</div>
                  <div className={`${tall ? "line-clamp-2" : "truncate"} text-[9px] font-bold`}>{l.brand ? `${l.brand} ` : ""}{l.name}</div>
                </div>
                {tall && <div className="h-[10mm] w-[10mm] shrink-0" dangerouslySetInnerHTML={{ __html: l.qr }} />}
              </div>
              <div className="text-right text-[11px] font-bold leading-none">{priceLine(l)}</div>
              <div>
                <div className={`${tall ? "h-[9mm]" : "h-[7mm]"} w-full [&>svg]:h-full [&>svg]:w-full`} dangerouslySetInnerHTML={{ __html: l.bar }} />
                <div className="truncate whitespace-nowrap text-center font-mono text-[7px] leading-tight tracking-wider">{l.imei2 && roll.w >= 50 ? `${l.code} · ${l.imei2}` : l.code}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white text-black">
      <style>{`@media print { @page { size: A4; margin: 8mm; } }`}</style>
      {sp.auto && <AutoPrint enabled kind="a4" />}
      {toolbar}
      <div className="grid grid-cols-3 gap-2 px-4">
        {all.map((l, i) => (
          <div key={i} className="flex h-[36mm] flex-col justify-between overflow-hidden rounded border border-slate-300 p-2" style={{ breakInside: "avoid" }}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="truncate text-[8px] uppercase tracking-wide">{s.shop_name}</div>
                <div className="line-clamp-2 text-[10px] font-semibold leading-tight">{l.brand ? `${l.brand} ` : ""}{l.name}</div>
              </div>
              <div className="h-[13mm] w-[13mm] shrink-0" dangerouslySetInnerHTML={{ __html: l.qr }} />
            </div>
            <div className="text-right text-[13px] font-bold">{priceLine(l)}</div>
            <div>
              <div className="h-[8mm] w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.bar }} />
              <div className="text-center font-mono text-[8px] tracking-wider">{l.imei2 ? `IMEI ${l.code} · ${l.imei2}` : l.code}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
