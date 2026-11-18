import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num, methodLabel } from "@/lib/util";
import { amountInWords } from "@/lib/words";
import AutoPrint from "@/components/auto-print";
import { receiptPaper, receiptPageCss } from "@/lib/print";
import { code128Svg } from "@/lib/barcode";

export default async function PrintInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const sale = await one<any>("SELECT s.*, o.number ref_number, o.date ref_date, u.name cashier FROM sales s LEFT JOIN sales o ON o.id=s.ref_sale_id LEFT JOIN users u ON u.id=s.created_by WHERE s.id=$1", [Number(id)]);
  if (!sale) notFound();
  const items = await q<any>("SELECT si.*, p.sku, p.barcode FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id=$1 ORDER BY si.id", [sale.id]);
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
    const paper = receiptPaper(s.receipt_width);
    const d = new Date(sale.date);
    const dateStr = d.toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const addr = [s.address, s.address.toLowerCase().includes(s.emirate.toLowerCase()) ? "" : s.emirate, "U.A.E"].filter(Boolean).join(" , ");
    const payMode = pays.length ? pays.map((p) => methodLabel(p.method)).join(" + ").toUpperCase() : "CREDIT";
    const totalQty = items.reduce((a, i) => a + Number(i.qty), 0);
    const received = sale.tendered != null && Number(sale.tendered) > 0 ? Number(sale.tendered) : Number(sale.paid);
    const balance = received - Number(sale.total);
    const Rule = () => <div className="my-1 border-t border-black" />;
    const Info = ({ en, val, ar }: { en: string; val?: string; ar: string }) => (
      <div className="grid grid-cols-[30%_1fr_34%] items-baseline"><span>{en}</span><span className="text-center">{val}</span><span dir="rtl" className="text-right">{ar}</span></div>
    );
    const Sum = ({ en, ar, val, bold }: { en: string; ar?: string; val: string; bold?: boolean }) => (
      <div className={`grid grid-cols-[1fr_auto] items-baseline gap-2 py-[1px] ${bold ? "text-[1.15em] font-bold" : ""}`}>
        <span>{en}{ar && <span dir="rtl" className="ml-3">{ar}</span>}</span><span className="text-right tabular-nums">{val}</span>
      </div>
    );
    const vatRows = s.vat_registered ? [{ rate: s.vat_rate, net: stdNet, vat: stdVat }] : [];
    return (
      <div data-receipt className={`mx-auto bg-white px-1 py-2 leading-snug text-black ${paper.paper === 58 ? "text-[10px]" : "text-[11.5px]"}`} style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <AutoPrint enabled={!!sp.auto} kind="receipt" size={paper.size} />
        <style>{receiptPageCss(s.receipt_width)}</style>
        <div className="text-center font-bold uppercase">
          <div className="text-[1.3em] leading-tight">{s.shop_name}</div>
          {s.shop_name_ar && <div dir="rtl" className="text-[1.1em]">{s.shop_name_ar}</div>}
          {addr && <div>{addr}</div>}
          {s.phone && <div>MOB: {s.phone}</div>}
          {s.vat_registered && s.trn && <div className="mt-2">TRN :{s.trn}</div>}
        </div>
        <Rule />
        <div className="py-1 text-center text-[1.35em] font-bold" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
          {title.toUpperCase()} <span dir="rtl">{titleAr}</span>
        </div>
        <Rule />
        <div className="space-y-[1px] py-1">
          <Info en="Inv No." val={sale.number} ar="رقم الفاتورة" />
          {isCN && sale.ref_number && <Info en="Against" val={sale.ref_number} ar="الفاتورة الأصلية" />}
          <Info en="Date" val={dateStr} ar="التاريخ" />
          <Info en="Time" val={timeStr} ar="الوقت" />
          <Info en="Counter" val={s.receipt_counter || "1"} ar="الكونتر" />
          <Info en="Cashier" val={sale.cashier ?? ""} ar="المحاسب" />
          <Info en="Payment Mode" val={payMode} ar="طريقة الدفع" />
          <Info en="Customer" val={(sale.customer_name || "GENERAL").toUpperCase()} ar="الزبون" />
          {sale.customer_phone && <Info en="Mobile" val={sale.customer_phone} ar="الجوال" />}
          <Info en="TRN" val={sale.customer_trn} ar="الرقم الضريبي" />
        </div>
        <Rule />
        <div className="grid grid-cols-[1fr_11%_19%_21%] font-bold">
          <span>Item Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Amount</span>
          <span dir="rtl" className="text-center">الوصف</span><span className="text-right">كمية</span><span className="text-right">سعر</span><span className="text-right">اجمالي</span>
        </div>
        <Rule />
        {items.map((i) => (
          <div key={i.id} className="py-[2px]">
            <div className="grid grid-cols-[1fr_11%_19%_21%] items-baseline">
              <span className="font-bold uppercase">{i.description}{i.margin_scheme ? " *" : ""}</span>
              <span className="text-right">{Number(i.qty).toFixed(2)}</span>
              <span className="text-right">{num(i.unit_price)}</span>
              <span className="text-right">{num(Number(i.total))}</span>
            </div>
            {(i.imei || i.barcode || i.sku) && <div>{i.imei ? `IMEI ${i.imei}` : i.barcode || i.sku}</div>}
            {Number(i.discount) > 0 && <div>Discount -{num(i.discount)}</div>}
          </div>
        ))}
        <Rule />
        <Sum en="Total Qty" val={String(totalQty)} ar="اجمالي الكمية" />
        <Sum en="Total Items" val={String(items.length)} ar="مجموع المنتجات" />
        {Number(sale.discount) > 0 && <Sum en="Discount" val={num(sale.discount)} ar="الخصم" />}
        <div dir="rtl" className="mt-1 pr-6 text-right">المجموع ( شامل ض.ق.م )</div>
        <Sum en={s.vat_registered ? "Total Amount (In. VAT)" : "Total Amount"} val={num(sale.total)} bold />
        {!isCN && <>
          <Sum en={pays.length === 1 && pays[0].method === "cash" ? "Cash Received" : "Amount Received"} val={num(received)} />
          {balance >= -0.004
            ? <Sum en="Balance" ar="الباقي" val={num(Math.max(0, balance))} />
            : <Sum en="Balance Due" ar="المبلغ المستحق" val={num(-balance)} bold />}
        </>}
        {isCN && pays.map((p) => <Sum key={p.method} en={`Refund ${methodLabel(p.method)}`} val={num(p.amount)} />)}
        {vatRows.length > 0 && <>
          <Rule />
          <div className="grid grid-cols-[22%_1fr_30%] font-bold">
            <span dir="rtl" className="whitespace-nowrap text-left text-[0.9em] font-normal">نسبة ض.ق.م</span><span dir="rtl" className="whitespace-nowrap text-center text-[0.9em] font-normal">قيمة قبل ض.ق.م</span><span dir="rtl" className="whitespace-nowrap text-right text-[0.9em] font-normal">قيمة ض.ق.م</span>
            <span>VAT %</span><span className="text-center">Taxable Amount</span><span className="text-right">VAT Amount</span>
          </div>
          {vatRows.map((v) => (
            <div key={v.rate} className="grid grid-cols-[22%_1fr_30%] font-bold"><span>{v.rate} %</span><span className="text-center">{num(v.net)}</span><span className="text-right">{num(v.vat)}</span></div>
          ))}
          {margin.length > 0 && <div className="grid grid-cols-[1fr_auto]"><span>Margin scheme goods *</span><span>{num(marginTotal)}</span></div>}
          <Rule />
        </>}
        {margin.length > 0 && <div className="mt-1 text-[0.85em]">* Second-hand goods: VAT charged under the profit margin scheme.</div>}
        {s.invoice_terms && <div className="mt-2 text-center text-[0.9em]">{s.invoice_terms}</div>}
        <div className="mx-auto mt-3 h-[12mm] w-[80%] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: code128Svg(sale.number, { height: 40 }) }} />
        <div className="mt-1 text-center text-[1.1em]">*{sale.number}*</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-slate-900">
      <AutoPrint enabled={!!sp.auto} kind="a4" />
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
