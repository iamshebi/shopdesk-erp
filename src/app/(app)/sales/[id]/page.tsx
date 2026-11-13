import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { fmtDate, num, methodLabel, waLink, PAYMENT_METHODS } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { Printer, MessageCircle, Plus } from "lucide-react";
import { receivePayment, returnItems, emailInvoice, makePayLink, setDueDate } from "../actions";
import { emailReady } from "@/lib/email";
import { saleToken } from "@/lib/public-link";

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("sales.view");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const sale = await one<any>(`SELECT s.*, ${OUTSTANDING_SQL} outstanding, u.name cashier, o.number ref_number FROM sales s LEFT JOIN users u ON u.id=s.created_by LEFT JOIN sales o ON o.id = s.ref_sale_id WHERE s.id=$1`, [Number(id)]);
  if (!sale) notFound();
  if (!can(user, "sales.all") && sale.created_by !== user.id) redirect("/sales?denied=1");
  const items = await q<any>(
    `SELECT si.*, si.qty - COALESCE((SELECT sum(r.qty) FROM sale_items r JOIN sales c ON c.id=r.sale_id WHERE c.type='credit_note' AND r.ref_item_id = si.id),0)::int returnable
     FROM sale_items si WHERE si.sale_id=$1 ORDER BY si.id`,
    [sale.id],
  );
  const pays = await q<any>("SELECT * FROM payments WHERE sale_id=$1 ORDER BY created_at", [sale.id]);
  const returns = await q<any>("SELECT id, number, total, date FROM sales WHERE ref_sale_id=$1 ORDER BY id", [sale.id]);
  const isCN = sale.type === "credit_note";
  const anyReturnable = !isCN && items.some((i) => i.returnable > 0);
  const canEmail = await emailReady();
  const stripeOn = !!s.stripe_key_enc;
  const custEmail = sale.customer_id ? (await one<{ email: string }>("SELECT email FROM customers WHERE id=$1", [sale.customer_id]))?.email ?? "" : "";
  const publicPath = `/i/${await saleToken(sale.id)}`;
  const msg = `${s.shop_name}\n${isCN ? "Credit note" : "Invoice"} ${sale.number} · ${s.currency} ${num(sale.total)}\nThank you for shopping with us!`;
  return (
    <div className="max-w-4xl">
      {sp.new && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-4 fade-in">
          <div className="font-medium text-emerald-800">{isCN ? "Return saved." : "Sale complete."} {sale.outstanding > 0.004 && `Balance due: ${num(sale.outstanding)}`}</div>
          <div className="flex gap-2">
            <a href={`/print/invoice/${sale.id}?format=thermal&auto=1`} target="_blank" className="btn-dark btn-sm"><Printer size={14} /> Receipt</a>
            <a href={`/print/invoice/${sale.id}?auto=1`} target="_blank" className="btn-ghost btn-sm"><Printer size={14} /> A4</a>
            {!isCN && <Link href="/pos" className="btn-primary btn-sm"><Plus size={14} /> Next sale</Link>}
          </div>
        </div>
      )}
      <PageHeader title={`${isCN ? "Credit note" : "Invoice"} ${sale.number}`} subtitle={`${fmtDate(sale.date, true)} · by ${sale.cashier ?? "—"}${sale.ref_number ? ` · for invoice ${sale.ref_number}` : ""}`}>
        <a href={`/print/invoice/${sale.id}`} target="_blank" className="btn-ghost"><Printer size={16} /> Print</a>
        {sale.customer_phone && <a href={waLink(sale.customer_phone, msg)} target="_blank" className="btn-ghost"><MessageCircle size={16} /> WhatsApp</a>}
      </PageHeader>
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {!isCN && (
        <div className="card mb-6 flex flex-wrap items-center gap-2 p-4 text-sm">
          <a href={publicPath} target="_blank" className="btn-ghost btn-sm">Customer view link</a>
          {canEmail ? (
            <form action={emailInvoice} className="flex gap-1"><input type="hidden" name="id" value={sale.id} /><input name="to" defaultValue={custEmail} placeholder="customer@email.com" className="input h-8 w-52 text-xs" /><Submit className="btn-ghost btn-sm">Email invoice</Submit></form>
          ) : <span className="text-xs text-slate-400">Email: set up in Settings → Integrations</span>}
          {sale.outstanding > 0.004 && (sale.pay_link
            ? <><a href={sale.pay_link} target="_blank" className="btn-ghost btn-sm">Online payment link</a>{sale.customer_phone && <a href={waLink(sale.customer_phone, `${s.shop_name}: invoice ${sale.number}, ${s.currency} ${num(sale.outstanding)} due. Pay here: ${sale.pay_link}`)} target="_blank" className="btn-ghost btn-sm">Send link by WhatsApp</a>}</>
            : stripeOn && can(user, "sales.payments") ? <form action={makePayLink}><input type="hidden" name="id" value={sale.id} /><Submit className="btn-ghost btn-sm">Create payment link</Submit></form> : null)}
          {sale.outstanding > 0.004 && can(user, "sales.payments") && (
            <form action={setDueDate} className="ml-auto flex items-center gap-1"><input type="hidden" name="id" value={sale.id} /><span className="text-xs text-slate-500">Due date</span><input type="date" name="due_date" defaultValue={sale.due_date ? String(sale.due_date instanceof Date ? sale.due_date.toISOString() : sale.due_date).slice(0, 10) : ""} className="input h-8 w-36 text-xs" /><Submit className="btn-ghost btn-sm">Set</Submit></form>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs text-slate-500">Customer</div>
          <div className="mt-1 font-medium">{sale.customer_id ? <Link href={`/customers/${sale.customer_id}`} className="hover:text-accent">{sale.customer_name || "—"}</Link> : sale.customer_name || "Walk-in"}</div>
          <div className="text-sm text-slate-500">{sale.customer_phone}{sale.customer_trn && ` · TRN ${sale.customer_trn}`}</div>
        </div>
        <div className="card p-5"><div className="text-xs text-slate-500">Total</div><div className="mt-1 text-2xl font-semibold tabular-nums">{num(sale.total)}</div><div className="text-xs text-slate-400">VAT {num(sale.vat)}</div></div>
        <div className="card p-5">
          <div className="text-xs text-slate-500">{isCN ? "Refunded" : "Status"}</div>
          <div className="mt-1">{isCN ? <span className="text-2xl font-semibold tabular-nums">{num(sale.paid)}</span> : sale.outstanding > 0.004 ? <Badge tone="amber">Due {num(sale.outstanding)}</Badge> : <Badge tone="green">Paid in full</Badge>}</div>
          {can(user, "products.cost") && !isCN && <div className="mt-1 text-xs text-slate-400">Profit {num(sale.subtotal - sale.cost)}</div>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Disc.</th><th className="text-right">VAT</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.product_id ? <Link href={`/products/${i.product_id}`} className="font-medium hover:text-accent">{i.description}</Link> : <span className="font-medium">{i.description}</span>}
                  {i.imei && <div className="font-mono text-xs text-slate-400">IMEI {i.imei}</div>}
                  {i.margin_scheme && <Badge tone="violet">Margin scheme</Badge>}
                </td>
                <td className="text-right">{i.qty}</td>
                <td className="text-right tabular-nums">{num(i.unit_price)}</td>
                <td className="text-right tabular-nums">{i.discount ? num(i.discount) : ""}</td>
                <td className="text-right tabular-nums">{num(i.vat)}</td>
                <td className="text-right tabular-nums">{num(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">{isCN ? "Refunds" : "Payments"}</h3>
          {pays.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
            <ul className="space-y-1 text-sm">{pays.map((p) => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.created_at, true)} · {methodLabel(p.method)}{p.reference && ` (${p.reference})`}</span><span className="tabular-nums">{num(p.amount)}</span></li>)}</ul>
          )}
          {returns.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
              <div className="mb-1 text-xs text-slate-500">Returns</div>
              {returns.map((r) => <div key={r.id} className="flex justify-between"><Link href={`/sales/${r.id}`} className="link">{r.number}</Link><span className="tabular-nums text-red-600">−{num(r.total)}</span></div>)}
            </div>
          )}
          {sale.notes && <p className="mt-3 text-sm text-slate-500">Note: {sale.notes}</p>}
        </div>
        {!isCN && sale.outstanding > 0.004 && can(user, "sales.payments") && (
          <form action={receivePayment} className="card space-y-3 p-5">
            <h3 className="font-semibold">Receive payment</h3>
            <input type="hidden" name="id" value={sale.id} />
            <div className="flex gap-2">
              <input name="amount" defaultValue={sale.outstanding.toFixed(2)} className="input" inputMode="decimal" />
              <select name="method" className="input w-40">{PAYMENT_METHODS.filter((m) => m.id !== "credit").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </div>
            <input name="reference" placeholder="Reference (optional)" className="input" />
            <Submit>Save payment</Submit>
          </form>
        )}
      </div>

      {anyReturnable && can(user, "sales.returns") && (
        <details className="card mt-6 p-5">
          <summary className="cursor-pointer font-semibold">Return / refund items</summary>
          <form action={returnItems} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={sale.id} />
            {items.filter((i) => i.returnable > 0).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{i.description}{i.imei && <span className="ml-1 font-mono text-xs text-slate-400">{i.imei}</span>}</span>
                <span className="flex items-center gap-2 text-slate-500">return
                  <input name={`ret_${i.id}`} type="number" min={0} max={i.returnable} defaultValue={0} className="input h-8 w-16 text-center" /> of {i.returnable}
                </span>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <select name="method" className="input">
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.id === "credit" ? "Reduce balance due" : `Refund by ${m.label}`}</option>)}
              </select>
              <input name="reason" placeholder="Reason for return" className="input" required />
            </div>
            <Submit className="btn-danger" confirm="Create a credit note and put these items back in stock?">Create credit note</Submit>
          </form>
        </details>
      )}
    </div>
  );
}
