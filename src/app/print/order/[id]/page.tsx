import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import { amountInWords } from "@/lib/words";
import PrintButton from "@/components/print-button";

const TITLES: Record<string, [string, string]> = {
  quote: ["Quotation", "عرض سعر"],
  proforma: ["Proforma Invoice", "فاتورة مبدئية"],
  delivery: ["Delivery Note", "إشعار تسليم"],
};

export default async function PrintOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("orders");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const o = await one<any>("SELECT o.*, u.name rep FROM orders o LEFT JOIN users u ON u.id=o.sales_rep_id WHERE o.id=$1", [Number(id)]);
  if (!o) notFound();
  const items = await q<any>("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id", [o.id]);
  const doc = TITLES[sp.doc ?? ""] ? sp.doc! : o.kind === "quote" ? "quote" : "proforma";
  const [title, titleAr] = TITLES[doc];
  const showPrices = doc !== "delivery";
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[12px] text-black">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <div className="flex items-start justify-between border-b border-black pb-4">
        <div>
          {s.logo ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={s.logo} alt="" className="mb-2 h-14 w-auto object-contain" />) : null}
          <div className="text-base font-bold">{s.legal_name || s.shop_name}</div>
          {s.shop_name_ar && <div>{s.shop_name_ar}</div>}
          <div>{[s.address, s.emirate].filter(Boolean).join(", ")}</div>
          <div>{[s.phone, s.email].filter(Boolean).join(" · ")}</div>
          {s.trn && <div>TRN: {s.trn}</div>}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">{title}</div>
          <div className="text-base">{titleAr}</div>
          <div className="mt-2">No: <b>{o.number}</b></div>
          <div>Date: {fmtDate(o.created_at)}</div>
          {doc === "quote" && o.valid_until && <div>Valid until: {fmtDate(o.valid_until)}</div>}
          {doc === "delivery" && o.tracking_no && <div>Tracking: {o.tracking_no}</div>}
        </div>
      </div>
      <div className="my-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase text-slate-600">{doc === "delivery" ? "Deliver to" : "Bill to"}</div>
          <div className="font-semibold">{o.customer_name}</div>
          <div>{o.customer_phone}</div>
          <div>{doc === "delivery" ? o.delivery_address || o.customer_address : o.customer_address}</div>
          {o.customer_trn && <div>TRN: {o.customer_trn}</div>}
        </div>
        {o.rep && <div className="text-right"><div className="text-[10px] uppercase text-slate-600">Sales person</div><div>{o.rep}</div></div>}
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-y border-black text-left">
          <th className="py-1.5">#</th><th>Description</th><th className="text-right">Qty</th>
          {showPrices && <><th className="text-right">Unit price</th><th className="text-right">Discount</th><th className="text-right">Net</th><th className="text-right">VAT</th><th className="text-right">Amount</th></>}
          {!showPrices && <th className="text-right">Received</th>}
        </tr></thead>
        <tbody>
          {items.map((i, k) => (
            <tr key={i.id} className="border-b border-slate-300">
              <td className="py-1.5">{k + 1}</td><td>{i.description}</td><td className="text-right">{i.qty}</td>
              {showPrices ? <><td className="text-right">{num(i.unit_price)}</td><td className="text-right">{Number(i.discount) ? num(i.discount) : "—"}</td><td className="text-right">{num(i.net)}</td><td className="text-right">{num(i.vat)}</td><td className="text-right">{num(i.total)}</td></> : <td className="text-right">☐</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {showPrices && (
        <div className="ml-auto mt-3 w-72 space-y-1">
          {Number(o.delivery_charge) > 0 && <div className="flex justify-between"><span>Delivery charge</span><span>{num(o.delivery_charge)}</span></div>}
          <div className="flex justify-between"><span>Total excl. VAT</span><span>{num(o.subtotal)}</span></div>
          <div className="flex justify-between"><span>VAT {s.vat_rate}%</span><span>{num(o.vat)}</span></div>
          <div className="flex justify-between border-t border-black pt-1 text-sm font-bold"><span>Total {s.currency}</span><span>{num(o.total)}</span></div>
          {o.currency && Number(o.fx_rate) > 0 && <div className="flex justify-between text-xs"><span>≈ Total {o.currency} (rate {Number(o.fx_rate)})</span><span>{num(Number(o.total) * Number(o.fx_rate))}</span></div>}
          {doc === "proforma" && Number(o.advance) > 0 && <div className="flex justify-between"><span>Advance received</span><span>{num(o.advance)}</span></div>}
          {doc === "proforma" && Number(o.advance) > 0 && <div className="flex justify-between font-semibold"><span>Balance due</span><span>{num(Number(o.total) - Number(o.advance))}</span></div>}
          <div className="pt-1 text-[10px]">{amountInWords(Number(o.total))}</div>
        </div>
      )}
      {doc === "proforma" && <p className="mt-4 text-[10px]">This is a proforma invoice, not a tax invoice. A tax invoice is issued on delivery.</p>}
      {(o.terms || (doc === "quote" ? "" : s.invoice_terms)) && doc !== "delivery" && <div className="mt-4"><div className="text-[10px] uppercase text-slate-600">Terms</div><div className="whitespace-pre-line">{o.terms || s.invoice_terms}</div></div>}
      {o.notes && <div className="mt-3"><div className="text-[10px] uppercase text-slate-600">Notes</div><div className="whitespace-pre-line">{o.notes}</div></div>}
      <div className="mt-16 grid grid-cols-2 gap-8 text-center">
        <div className="border-t border-black pt-1">{doc === "delivery" ? "Received by (name & signature)" : "Customer signature"}</div>
        <div className="border-t border-black pt-1">For {s.shop_name}</div>
      </div>
    </div>
  );
}
