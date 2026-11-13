import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { statusInfo, RESERVED_SQL } from "@/lib/orders";
import { STOCK_SQL } from "@/lib/stock";
import { fmtDate, num, waLink, methodLabel } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { setOrderStatus, convertQuote, duplicateOrder, invoiceOrder } from "../actions";
import { Printer, Pencil, Copy, MessageCircle, Truck, FileText } from "lucide-react";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("orders");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const o = await one<any>("SELECT o.*, u.name rep, c.name created_name, s.number invoice_no, r.number ref_no FROM orders o LEFT JOIN users u ON u.id=o.sales_rep_id LEFT JOIN users c ON c.id=o.created_by LEFT JOIN sales s ON s.id=o.sale_id LEFT JOIN orders r ON r.id=o.ref_order_id WHERE o.id=$1", [Number(id)]);
  if (!o) notFound();
  const items = await q<any>(`SELECT oi.*, p.track_serial, p.is_service, ${STOCK_SQL} stock, ${RESERVED_SQL("p")} reserved FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY oi.id`, [o.id]);
  const events = await q<any>("SELECT e.*, u.name FROM order_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.order_id=$1 ORDER BY e.id DESC", [o.id]);
  const units: Record<number, any[]> = {};
  for (const it of items.filter((i) => i.track_serial)) units[it.id] = await q<any>("SELECT id, imei FROM units WHERE product_id=$1 AND status='in_stock' ORDER BY created_at", [it.product_id]);
  const isQuote = o.kind === "quote";
  const st = statusInfo(o.kind, o.status);
  const editable = !o.sale_id && !["delivered", "cancelled", "converted"].includes(o.status);
  const due = Number(o.total) - Number(o.advance);
  const docName = isQuote ? "Quotation" : "Order";
  const wa = o.customer_phone ? waLink(o.customer_phone, `${s.shop_name}: ${docName} ${o.number}, total ${s.currency} ${num(o.total)}.${o.tracking_no ? ` Tracking: ${o.tracking_no}.` : ""} Thank you!`) : "";
  const step = (status: string, label: string, cls = "btn-ghost", extra?: React.ReactNode, confirm?: string) => (
    <form action={setOrderStatus} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={status} />
      {extra}
      <Submit className={cls} confirm={confirm}>{label}</Submit>
    </form>
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title={`${docName} ${o.number}`} subtitle={`${o.customer_name || o.customer_phone} · ${fmtDate(o.created_at, true)} · by ${o.created_name ?? "—"}${o.ref_no ? ` · from ${o.ref_no}` : ""}`}>
        <Badge tone={st.tone}>{st.label}</Badge>
        {editable && <Link href={`/orders/${o.id}/edit`} className="btn-ghost"><Pencil size={15} /> Edit</Link>}
        <Link href={`/print/order/${o.id}?doc=${isQuote ? "quote" : "proforma"}`} target="_blank" className="btn-ghost"><Printer size={15} /> {isQuote ? "Quotation" : "Proforma"}</Link>
        {!isQuote && <Link href={`/print/order/${o.id}?doc=delivery`} target="_blank" className="btn-ghost"><Truck size={15} /> Delivery note</Link>}
        {!isQuote && <Link href={`/shipping?order=${o.id}`} className="btn-ghost">Ship with courier</Link>}
        {wa && <a href={wa} target="_blank" className="btn-ghost"><MessageCircle size={15} /> WhatsApp</a>}
        <form action={duplicateOrder}><input type="hidden" name="id" value={o.id} /><Submit className="btn-ghost"><Copy size={15} /> Copy</Submit></form>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Discount</th><th className="text-right">Total</th>{!isQuote && editable && <th className="text-right">Free stock</th>}</tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.product_id ? <Link href={`/products/${i.product_id}`} className="hover:text-accent">{i.description}</Link> : i.description}</td>
                    <td className="text-right">{i.qty}</td>
                    <td className="text-right tabular-nums">{num(i.unit_price)}</td>
                    <td className="text-right tabular-nums text-slate-500">{Number(i.discount) ? num(i.discount) : "—"}</td>
                    <td className="text-right tabular-nums font-medium">{num(i.total)}</td>
                    {!isQuote && editable && <td className="text-right">{i.product_id && !i.is_service ? <Badge tone={i.stock - i.reserved + (["confirmed", "packed", "shipped"].includes(o.status) ? i.qty : 0) >= i.qty ? "green" : "red"}>{i.stock - i.reserved}</Badge> : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t border-slate-100 p-4 text-right text-sm">
              {Number(o.delivery_charge) > 0 && <div>Delivery {num(o.delivery_charge)}</div>}
              <div className="text-slate-500">Net {num(o.subtotal)} · VAT {num(o.vat)}</div>
              <div className="text-lg font-semibold">Total {s.currency} {num(o.total)}</div>
              {!isQuote && Number(o.advance) > 0 && <div className="text-slate-500">Advance {num(o.advance)} ({methodLabel(o.advance_method)}) · balance {num(due)}</div>}
            </div>
          </div>

          {/* Next steps */}
          <div className="card space-y-4 p-6">
            <h2 className="font-semibold">Next step</h2>
            {isQuote ? (
              o.status === "converted" ? <p className="text-sm text-slate-500">This quotation became an order.</p> : (
                <div className="flex flex-wrap gap-2">
                  {o.status === "draft" && step("sent", "Mark as sent")}
                  {["draft", "sent"].includes(o.status) && step("accepted", "Customer accepted", "btn-ghost")}
                  {["draft", "sent", "accepted"].includes(o.status) && <form action={convertQuote}><input type="hidden" name="id" value={o.id} /><Submit><FileText size={15} /> Turn into sales order</Submit></form>}
                  {["draft", "sent", "accepted"].includes(o.status) && step("declined", "Declined", "btn-danger")}
                  {o.status === "declined" && step("sent", "Reopen")}
                </div>
              )
            ) : o.sale_id ? (
              <p className="text-sm">Delivered and invoiced: <Link href={`/sales/${o.sale_id}`} className="link">{o.invoice_no}</Link></p>
            ) : o.status === "cancelled" ? (
              <p className="text-sm text-slate-500">Cancelled. Reserved stock was released.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {o.status === "draft" && step("confirmed", "Confirm order (reserve stock)", "btn-primary")}
                  {sp.err?.startsWith("Not enough") && o.status === "draft" && step("confirmed", "Confirm anyway", "btn-ghost", <input type="hidden" name="force" value="1" />)}
                  {o.status === "confirmed" && step("packed", "Mark as packed")}
                  {["confirmed", "packed"].includes(o.status) && o.delivery_method === "delivery" && step("shipped", "Send out for delivery", "btn-ghost", <><input name="courier" placeholder="Courier / driver" className="input h-10 w-40" defaultValue={o.courier} /><input name="tracking_no" placeholder="Tracking no." className="input h-10 w-36" defaultValue={o.tracking_no} /></>)}
                  {o.status === "confirmed" && step("draft", "Back to draft")}
                  {["draft", "confirmed", "packed", "shipped"].includes(o.status) && step("cancelled", "Cancel order", "btn-danger", undefined, "Cancel this order? Reserved stock is released.")}
                </div>
                {["confirmed", "packed", "shipped"].includes(o.status) && can(user, "pos") && (
                  <form action={invoiceOrder} className="space-y-3 rounded-xl border border-slate-200 p-4">
                    <input type="hidden" name="id" value={o.id} />
                    <div className="font-medium">Delivered? Make the tax invoice</div>
                    {items.filter((i) => i.track_serial).map((i) => (
                      <div key={i.id}>
                        <label className="label">IMEI for {i.description} ({i.qty})</label>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: i.qty }).map((_, k) => (
                            <select key={k} name={`unit_${i.id}`} className="input w-56" required defaultValue="">
                              <option value="" disabled>Choose IMEI</option>
                              {units[i.id]?.map((u) => <option key={u.id} value={u.id}>{u.imei}</option>)}
                            </select>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-end gap-2">
                      <div><label className="label">Payment received now</label><input name="amount" defaultValue={due > 0 ? due.toFixed(2) : "0"} className="input w-36" inputMode="decimal" /></div>
                      <div><label className="label">Method</label><select name="method" className="input w-40"><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="tabby">Tabby</option><option value="tamara">Tamara</option><option value="credit">On credit (pay later)</option></select></div>
                      <Submit confirm="Create the tax invoice? Stock will go out.">Deliver &amp; invoice</Submit>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-2 p-5 text-sm">
            <h3 className="font-semibold">Customer</h3>
            <div>{o.customer_name}</div>
            {o.customer_phone && <div className="text-slate-500">{o.customer_phone}</div>}
            {o.customer_email && <div className="text-slate-500">{o.customer_email}</div>}
            {o.customer_address && <div className="text-slate-500">{o.customer_address}</div>}
            {o.customer_id && <Link href={`/customers/${o.customer_id}`} className="link text-xs">Customer history</Link>}
          </div>
          <div className="card space-y-1.5 p-5 text-sm">
            <h3 className="mb-1 font-semibold">Details</h3>
            <div className="flex justify-between"><span className="text-slate-500">Source</span><span className="capitalize">{o.source}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Sales person</span><span>{o.rep ?? "—"}</span></div>
            {isQuote ? <div className="flex justify-between"><span className="text-slate-500">Valid until</span><span>{o.valid_until ? fmtDate(o.valid_until) : "—"}</span></div> : <>
              <div className="flex justify-between"><span className="text-slate-500">Delivery</span><span>{o.delivery_method === "delivery" ? "Deliver" : "Pickup"}</span></div>
              {o.delivery_address && <div className="text-slate-500">{o.delivery_address}</div>}
              {o.expected_date && <div className="flex justify-between"><span className="text-slate-500">Expected</span><span>{fmtDate(o.expected_date)}</span></div>}
              {o.courier && <div className="flex justify-between"><span className="text-slate-500">Courier</span><span>{o.courier}</span></div>}
              {o.tracking_no && <div className="flex justify-between"><span className="text-slate-500">Tracking</span><span className="font-mono text-xs">{o.tracking_no}</span></div>}
            </>}
            {o.notes && <div className="pt-2 text-slate-600">{o.notes}</div>}
          </div>
          <div className="card p-5 text-sm">
            <h3 className="mb-3 font-semibold">History</h3>
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id}><Badge tone={statusInfo(o.kind, e.status).tone}>{statusInfo(o.kind, e.status).label}</Badge>
                  <div className="mt-1 text-xs text-slate-500">{fmtDate(e.created_at, true)} · {e.name ?? "—"}{e.note && ` · ${e.note}`}</div></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
