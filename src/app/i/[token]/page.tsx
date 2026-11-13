import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { readSaleToken } from "@/lib/public-link";
import { fmtDate, num } from "@/lib/util";

export const metadata = { robots: { index: false } };

export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = await readSaleToken(token);
  if (!id) notFound();
  const s = await getSettings();
  const sale = await one<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1`, [id]);
  if (!sale) notFound();
  const items = await q<any>("SELECT description, imei, qty, unit_price, discount, total FROM sale_items WHERE sale_id=$1 ORDER BY id", [id]);
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-between gap-4">
          <div>{s.logo && <img src={s.logo} alt="" className="mb-2 h-12" />}<div className="text-lg font-bold">{s.legal_name || s.shop_name}</div><div className="text-sm text-slate-500">{s.address}</div>{s.trn && <div className="text-sm text-slate-500">TRN {s.trn}</div>}</div>
          <div className="text-right"><div className="text-lg font-semibold">{sale.type === "credit_note" ? "Credit note" : s.vat_registered ? "Tax invoice" : "Invoice"}</div><div>{sale.number}</div><div className="text-sm text-slate-500">{fmtDate(sale.date)}</div></div>
        </div>
        {sale.customer_name && <div className="mb-4 text-sm"><span className="text-slate-500">Bill to:</span> {sale.customer_name}{sale.customer_trn && ` · TRN ${sale.customer_trn}`}</div>}
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-slate-500"><th className="py-2">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
          <tbody>{items.map((i, k) => <tr key={k} className="border-b border-slate-100"><td className="py-2">{i.description}{i.imei && <div className="font-mono text-xs text-slate-400">{i.imei}</div>}</td><td className="text-right">{i.qty}</td><td className="text-right">{num(i.unit_price)}</td><td className="text-right">{num(i.total)}</td></tr>)}</tbody>
        </table>
        <div className="mt-4 space-y-1 text-right text-sm">
          {Number(sale.discount) > 0 && <div>Discount: −{num(sale.discount)}</div>}
          <div>VAT: {num(sale.vat)}</div>
          <div className="text-lg font-bold">Total: {s.currency} {num(sale.total)}</div>
          <div className="text-slate-500">Paid: {num(sale.paid)}</div>
          {sale.type === "invoice" && sale.outstanding > 0.004 && <div className="font-semibold text-amber-700">Balance due: {s.currency} {num(sale.outstanding)}{sale.due_date && ` · by ${fmtDate(sale.due_date)}`}</div>}
        </div>
        {sale.type === "invoice" && sale.outstanding > 0.004 && sale.pay_link && <a href={sale.pay_link} className="mt-6 block rounded-xl bg-teal-700 py-3 text-center font-medium text-white">Pay {s.currency} {num(sale.outstanding)} online</a>}
        <p className="mt-8 text-center text-xs text-slate-400">{s.shop_name} · {s.phone}</p>
      </div>
    </div>
  );
}
