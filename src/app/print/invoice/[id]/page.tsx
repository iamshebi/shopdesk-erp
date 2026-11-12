import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num, methodLabel } from "@/lib/util";
import { amountInWords } from "@/lib/words";
import AutoPrint from "@/components/auto-print";

export default async function PrintInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const sale = await one<any>("SELECT s.*, o.number ref_number, o.date ref_date, u.name cashier FROM sales s LEFT JOIN sales o ON o.id=s.ref_sale_id LEFT JOIN users u ON u.id=s.created_by WHERE s.id=$1", [Number(id)]);
  if (!sale) notFound();
  const items = await q<any>("SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id", [sale.id]);
  const pays = await q<any>("SELECT method, sum(amount) amount FROM payments WHERE sale_id=$1 GROUP BY method", [sale.id]);
  const isCN = sale.type === "credit_note";
  const std = items.filter((i) => !i.margin_scheme);
  const margin = items.filter((i) => i.margin_scheme);
  const stdNet = std.reduce((a, i) => a + i.net, 0);
  const stdVat = std.reduce((a, i) => a + i.vat, 0);
  const marginTotal = margin.reduce((a, i) => a + i.total, 0);
  const title = !s.vat_registered ? (isCN ? "Credit Note" : "Invoice") : isCN ? "Tax Credit Note" : "Tax Invoice";
  const titleAr = !s.vat_registered ? (isCN ? "إشعار دائن" : "فاتورة") : isCN ? "إشعار دائن ضريبي" : "فاتورة ضريبية";
  const due = sale.total - sale.paid;

  if (sp.format === "thermal") {
    return (
      <div className="mx-auto w-[76mm] bg-white p-2 font-mono text-[11px] leading-snug text-black">
        <AutoPrint enabled={!!sp.auto} />
        <style>{`@page { size: 80mm auto; margin: 2mm; }`}</style>
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo && <img src={s.logo} alt="" className="mx-auto mb-1 h-12 object-contain grayscale" />}
          <div className="text-sm font-bold">{s.shop_name}</div>
          {s.shop_name_ar && <div dir="rtl">{s.shop_name_ar}</div>}
          {s.address && <div>{s.address}</div>}
          {s.phone && <div>Tel {s.phone}</div>}
          {s.vat_registered && s.trn && <div>TRN {s.trn}</div>}
          <div className="my-1 border-y border-dashed border-black py-1 font-bold">{title} · {titleAr}</div>
        </div>
        <div>No: {sale.number}</div>
        <div>Date: {fmtDate(sale.date, true)}</div>
        {isCN && sale.ref_number && <div>Against: {sale.ref_number}</div>}
        {sale.customer_name && <div>Customer: {sale.customer_name} {sale.customer_phone}</div>}
        {sale.customer_trn && <div>Cust. TRN: {sale.customer_trn}</div>}
        <div className="my-1 border-t border-dashed border-black" />
        {items.map((i) => (
          <div key={i.id} className="mb-1">
            <div>{i.description}{i.margin_scheme ? " *" : ""}</div>
            {i.imei && <div>IMEI {i.imei}</div>}
            <div className="flex justify-between"><span>{i.qty} x {num(i.unit_price)}{i.discount ? ` -${num(i.discount)}` : ""}</span><span>{num(i.total)}</span></div>
          </div>
        ))}
        <div className="my-1 border-t border-dashed border-black" />
        {s.vat_registered && <>
          <div className="flex justify-between"><span>Taxable amount</span><span>{num(stdNet)}</span></div>
          <div className="flex justify-between"><span>VAT {s.vat_rate}%</span><span>{num(stdVat)}</span></div>
          {margin.length > 0 && <div className="flex justify-between"><span>Margin scheme items*</span><span>{num(marginTotal)}</span></div>}
        </>}
        <div className="flex justify-between text-sm font-bold"><span>TOTAL {s.currency}</span><span>{num(sale.total)}</span></div>
        {pays.map((p) => <div key={p.method} className="flex justify-between"><span>{isCN ? "Refund" : "Paid"} {methodLabel(p.method)}</span><span>{num(p.amount)}</span></div>)}
        {!isCN && due > 0.004 && <div className="flex justify-between font-bold"><span>BALANCE DUE</span><span>{num(due)}</span></div>}
        {margin.length > 0 && <div className="mt-1">* Second-hand goods: VAT charged under the profit margin scheme.</div>}
        <div className="mt-2 text-center">{s.invoice_terms}</div>
        <div className="mt-2 text-center">Thank you! · شكراً لكم</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-slate-900">
      <AutoPrint enabled={!!sp.auto} />
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo && <img src={s.logo} alt="" className="h-16 w-auto object-contain" />}
          <div>
            <div className="text-xl font-bold">{s.shop_name}</div>
            {s.legal_name && <div className="text-slate-600">{s.legal_name}</div>}
            <div className="text-slate-600">{[s.address, s.emirate, "United Arab Emirates"].filter(Boolean).join(", ")}</div>
            <div className="text-slate-600">{[s.phone, s.email, s.website].filter(Boolean).join(" · ")}</div>
            {s.vat_registered && <div className="mt-1 font-semibold">TRN: {s.trn || "—"}</div>}
          </div>
        </div>
        <div className="text-right">
          {s.shop_name_ar && <div dir="rtl" className="mb-1 font-semibold">{s.shop_name_ar}</div>}
          <div className="text-2xl font-bold uppercase tracking-wide">{title}</div>
          <div dir="rtl" className="text-lg">{titleAr}</div>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase text-slate-500">Bill to · العميل</div>
          <div className="mt-1 font-semibold">{sale.customer_name || "Cash customer"}</div>
          {sale.customer_address && <div>{sale.customer_address}</div>}
          {sale.customer_phone && <div>{sale.customer_phone}</div>}
          {sale.customer_trn && <div className="font-semibold">TRN: {sale.customer_trn}</div>}
        </div>
        <div className="justify-self-end">
          <table className="text-right">
            <tbody>
              <tr><td className="pr-4 text-slate-500">{isCN ? "Credit note no." : "Invoice no."}</td><td className="font-semibold">{sale.number}</td></tr>
              <tr><td className="pr-4 text-slate-500">Date of issue</td><td>{fmtDate(sale.date, true)}</td></tr>
              {isCN && sale.ref_number && <tr><td className="pr-4 text-slate-500">Original invoice</td><td>{sale.ref_number} ({fmtDate(sale.ref_date)})</td></tr>}
              <tr><td className="pr-4 text-slate-500">Currency</td><td>{s.currency}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="bg-slate-900 text-left text-[11px] uppercase text-white">
            <th className="p-2">#</th><th className="p-2">Description · الوصف</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th>
            <th className="p-2 text-right">Discount</th><th className="p-2 text-right">Taxable</th><th className="p-2 text-right">VAT</th><th className="p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id} className="border-b border-slate-200 align-top">
              <td className="p-2">{n + 1}</td>
              <td className="p-2">{i.description}{i.imei && <div className="font-mono text-[11px] text-slate-500">IMEI/Serial: {i.imei}</div>}
                {i.margin_scheme && <div className="text-[11px] text-slate-500">Second-hand — profit margin scheme</div>}</td>
              <td className="p-2 text-right">{i.qty}</td>
              <td className="p-2 text-right">{num(i.unit_price)}</td>
              <td className="p-2 text-right">{i.discount ? num(i.discount) : "—"}</td>
              <td className="p-2 text-right">{i.margin_scheme ? "—" : num(i.net)}</td>
              <td className="p-2 text-right">{i.margin_scheme ? "Incl." : `${num(i.vat)}`}</td>
              <td className="p-2 text-right font-medium">{num(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-between gap-8">
        <div className="max-w-sm text-[12px] text-slate-600">
          <div className="font-semibold text-slate-900">{amountInWords(sale.total, s.currency)}</div>
          {pays.length > 0 && <div className="mt-2">{isCN ? "Refunded" : "Paid"}: {pays.map((p) => `${methodLabel(p.method)} ${num(p.amount)}`).join(" · ")}</div>}
          {isCN && sale.notes && <div className="mt-2">Reason: {sale.notes}</div>}
          {margin.length > 0 && <div className="mt-2">Items marked as second-hand are supplied under the profit margin scheme (Art. 29, UAE VAT Law); VAT is included in the price and not shown separately.</div>}
        </div>
        <table className="w-72 text-right">
          <tbody>
            {s.vat_registered ? <>
              <tr><td className="py-1 text-slate-500">Total taxable amount</td><td className="py-1">{num(stdNet)}</td></tr>
              <tr><td className="py-1 text-slate-500">VAT @ {s.vat_rate}%</td><td className="py-1">{num(stdVat)}</td></tr>
              {margin.length > 0 && <tr><td className="py-1 text-slate-500">Margin scheme goods</td><td className="py-1">{num(marginTotal)}</td></tr>}
            </> : null}
            <tr className="border-t-2 border-slate-900 text-base font-bold"><td className="py-2">Total {s.currency}</td><td className="py-2">{num(sale.total)}</td></tr>
            {!isCN && due > 0.004 && <tr className="font-semibold text-red-700"><td>Balance due</td><td>{num(due)}</td></tr>}
          </tbody>
        </table>
      </section>

      <footer className="mt-12 grid grid-cols-2 gap-10 text-[12px]">
        <div className="text-slate-500">{s.invoice_terms}</div>
        <div className="grid grid-cols-2 gap-6 text-center">
          <div className="border-t border-slate-400 pt-1">Customer signature</div>
          <div className="border-t border-slate-400 pt-1">For {s.shop_name}</div>
        </div>
      </footer>
      <div className="mt-8 text-center text-[11px] text-slate-400">Served by {sale.cashier ?? "—"} · Thank you for your business · شكراً لتعاملكم معنا</div>
    </div>
  );
}
