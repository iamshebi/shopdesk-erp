import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, methodLabel } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { paySupplier, returnToSupplier } from "../actions";
import Attachments from "@/components/attachments";

export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("purchases");
  const { id } = await params;
  const sp = await searchParams;
  const p = await one<any>("SELECT p.*, s.name supplier, s.trn supplier_trn FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=$1", [Number(id)]);
  if (!p) notFound();
  const items = await q<any>(
    `SELECT pi.*, pr.name, pr.track_serial, pi.qty - COALESCE((SELECT sum(ri.qty) FROM purchase_return_items ri WHERE ri.purchase_item_id=pi.id),0)::int AS returnable,
       (SELECT string_agg(u.imei, ', ') FROM units u WHERE u.purchase_id = pi.purchase_id AND u.product_id = pi.product_id) imeis
     FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id WHERE pi.purchase_id=$1 ORDER BY pi.id`,
    [p.id],
  );
  const pays = await q<any>("SELECT * FROM supplier_payments WHERE purchase_id=$1 ORDER BY created_at", [p.id]);
  const due = p.total - p.paid - p.returned;
  const rets = await q<any>("SELECT * FROM purchase_returns WHERE purchase_id=$1 ORDER BY id", [p.id]);
  const po = p.po_id ? await one<any>("SELECT id, number FROM purchase_orders WHERE id=$1", [p.po_id]) : null;
  return (
    <div className="max-w-4xl">
      <PageHeader title={p.number} subtitle={`${p.supplier ?? "No supplier"} · ${fmtDate(p.date)}${p.bill_ref ? ` · bill ${p.bill_ref}` : ""}`}>
        {po && <Link href={`/purchases/orders/${po.id}`} className="btn-ghost">{po.number}</Link>}
        {due > 0.004 ? <Badge tone="amber">Balance {num(due)}</Badge> : due < -0.004 ? <Badge tone="violet">Supplier owes us {num(-due)}</Badge> : <Badge tone="green">Paid</Badge>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">VAT</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/products/${i.product_id}`} className="font-medium hover:text-accent">{i.name}</Link>
                  {i.imeis && <div className="mt-1 font-mono text-[11px] text-slate-400">{i.imeis}</div>}
                  {i.batch_no && <div className="text-xs text-slate-400">Batch {i.batch_no}{i.expiry_date && ` · exp ${fmtDate(i.expiry_date)}`}</div>}</td>
                <td className="text-right">{i.qty}</td>
                <td className="text-right tabular-nums">{num(i.unit_cost)}</td>
                <td className="text-right tabular-nums">{num(i.vat)}</td>
                <td className="text-right tabular-nums">{num(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="text-right text-slate-500">Subtotal</td><td className="text-right tabular-nums">{num(p.subtotal)}</td></tr>
            <tr><td colSpan={4} className="text-right text-slate-500">VAT</td><td className="text-right tabular-nums">{num(p.vat)}</td></tr>
            <tr><td colSpan={4} className="text-right font-semibold">Total</td><td className="text-right font-semibold tabular-nums">{num(p.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Payments</h3>
          {pays.length === 0 ? <p className="text-sm text-slate-400">Nothing paid yet.</p> : (
            <ul className="space-y-1 text-sm">{pays.map((x) => <li key={x.id} className="flex justify-between"><span>{fmtDate(x.created_at)} · {methodLabel(x.method)}</span><span className="tabular-nums">{num(x.amount)}</span></li>)}</ul>
          )}
        </div>
        {due > 0.004 && (
          <form action={paySupplier} className="card space-y-3 p-5">
            <h3 className="font-semibold">Pay supplier</h3>
            <input type="hidden" name="id" value={p.id} />
            <input name="amount" defaultValue={due.toFixed(2)} className="input" inputMode="decimal" />
            <select name="method" className="input"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option></select>
            <Submit>Record payment</Submit>
          </form>
        )}
      </div>
      {rets.length > 0 && <div className="card mt-6 p-5 text-sm"><h3 className="mb-2 font-semibold">Debit notes (returned to supplier)</h3>{rets.map((r) => <div key={r.id} className="flex justify-between"><span>{r.number} · {fmtDate(r.date)} {r.reason && `· ${r.reason}`}</span><span className="tabular-nums">−{num(r.total)}</span></div>)}</div>}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Return items to supplier</summary>
          <form action={returnToSupplier} className="mt-3 space-y-2 text-sm">
            <input type="hidden" name="id" value={p.id} />
            {items.map((i) => i.track_serial ? (
              <div key={i.id}><label className="label">{i.name}: IMEIs to return</label><textarea name={`imeis_${i.id}`} rows={2} className="input font-mono text-xs" /></div>
            ) : i.returnable > 0 ? (
              <div key={i.id} className="flex items-center justify-between gap-2"><span>{i.name}</span><span className="flex items-center gap-1 text-slate-500"><input name={`ret_${i.id}`} type="number" min={0} max={i.returnable} defaultValue={0} className="input h-8 w-16 text-center" /> of {i.returnable}</span></div>
            ) : null)}
            <input name="reason" className="input" placeholder="Reason (damaged, wrong item…)" required />
            <Submit className="btn-danger" confirm="Create a debit note and take these items out of stock?">Create debit note</Submit>
          </form>
        </details>
        <Attachments kind="purchase" ownerId={p.id} back={`/purchases/${p.id}`} />
      </div>
      {p.notes && <p className="mt-4 text-sm text-slate-500">Notes: {p.notes}</p>}
    </div>
  );
}
