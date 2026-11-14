import { notFound } from "next/navigation";
import { one, q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { code128Svg } from "@/lib/barcode";
import { num } from "@/lib/util";
import PrintButton from "@/components/print-button";

export default async function ShippingLabel({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("shipping");
  const { id } = await params;
  const s = await getSettings();
  const sh = await one<any>("SELECT sh.*, o.number order_no FROM shipments sh LEFT JOIN orders o ON o.id=sh.order_id WHERE sh.id=$1", [Number(id)]);
  if (!sh) notFound();
  const items = sh.order_id ? await q<any>("SELECT description, qty FROM order_items WHERE order_id=$1 ORDER BY id", [sh.order_id]) : [];
  const code = sh.tracking_no || sh.number;
  return (
    <div className="mx-auto bg-white p-4 text-black" style={{ width: "100mm" }}>
      <div className="no-print mb-3"><PrintButton /></div>
      <div className="border-2 border-black p-3 text-sm" style={{ minHeight: "140mm" }}>
        <div className="flex justify-between border-b border-black pb-2"><div><div className="text-xs">FROM</div><div className="font-bold">{s.shop_name}</div><div className="text-xs">{s.address}</div><div className="text-xs">{s.phone}</div></div><div className="text-right text-xs">{sh.courier}<div className="font-bold">{sh.number}</div>{sh.order_no}</div></div>
        <div className="border-b border-black py-3"><div className="text-xs">DELIVER TO</div><div className="text-lg font-bold">{sh.customer_name}</div><div className="text-base">{sh.customer_phone}</div><div className="mt-1">{sh.address}</div></div>
        {Number(sh.cod_amount) > 0 && <div className="border-b border-black py-2 text-center text-lg font-bold">COLLECT CASH: {s.currency} {num(sh.cod_amount)}</div>}
        <div className="py-3 text-center" dangerouslySetInnerHTML={{ __html: code128Svg(code, { height: 60 }) }} />
        <div className="text-center font-mono text-xs">{code}</div>
        {items.length > 0 && <ul className="mt-3 border-t border-black pt-2 text-xs">{items.map((i, k) => <li key={k}>{i.qty} × {i.description}</li>)}</ul>}
        {sh.notes && <div className="mt-2 text-xs">Note: {sh.notes}</div>}
      </div>
    </div>
  );
}
