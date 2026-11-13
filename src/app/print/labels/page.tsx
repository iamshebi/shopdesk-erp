import QRCode from "qrcode";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { code128Svg } from "@/lib/barcode";
import { num } from "@/lib/util";
import PrintButton from "@/components/print-button";

// Shelf / product labels: name, price, Code 128 barcode and a QR code. A4 sheet, 3 across.
export default async function Labels({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("products.view");
  const sp = await searchParams;
  const s = await getSettings();
  const ids = (sp.ids || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);
  const copies = Math.max(1, Math.min(50, Number(sp.copies) || 1));
  const rows = await q<any>("SELECT id, name, brand, sku, barcode, price, discount_price FROM products WHERE id = ANY($1::int[]) ORDER BY name", [ids]);
  const labels = await Promise.all(
    rows.map(async (p) => {
      const code = p.barcode || p.sku || `P${String(p.id).padStart(5, "0")}`;
      return { ...p, code, bar: code128Svg(code, { height: 40 }), qr: await QRCode.toString(code, { type: "svg", margin: 0 }) };
    }),
  );
  const all = labels.flatMap((l) => Array.from({ length: copies }, () => l));
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-4 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <div className="text-sm">{all.length} labels · {rows.length} products × {copies}</div>
        <PrintButton />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {all.map((l, i) => (
          <div key={i} className="flex h-[36mm] flex-col justify-between overflow-hidden rounded border border-slate-300 p-2" style={{ breakInside: "avoid" }}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="truncate text-[8px] uppercase tracking-wide">{s.shop_name}</div>
                <div className="line-clamp-2 text-[10px] font-semibold leading-tight">{l.brand ? `${l.brand} ` : ""}{l.name}</div>
              </div>
              <div className="h-[13mm] w-[13mm] shrink-0" dangerouslySetInnerHTML={{ __html: l.qr }} />
            </div>
            <div className="text-right text-[13px] font-bold">
              {l.discount_price ? <><span className="mr-1 text-[9px] font-normal line-through">{num(l.price)}</span>{s.currency} {num(l.discount_price)}</> : <>{s.currency} {num(l.price)}</>}
            </div>
            <div>
              <div className="h-[8mm] w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.bar }} />
              <div className="text-center font-mono text-[8px] tracking-wider">{l.code}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
