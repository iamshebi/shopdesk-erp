import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SHIP_STATUSES, shipStatus, couriers, trackingUrl } from "@/lib/shipping";
import { fmtDate, num, waLink } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import Submit from "@/components/submit";
import { createShipment, updateShipment } from "./actions";

export default async function ShippingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("shipping");
  const sp = await searchParams;
  const s = await getSettings();
  const cs = couriers(s.couriers);
  const order = sp.order ? await one<any>("SELECT * FROM orders WHERE id=$1", [Number(sp.order)]) : null;
  const view = sp.view ?? "active";
  const rows = await q<any>(`SELECT sh.*, o.number order_no FROM shipments sh LEFT JOIN orders o ON o.id=sh.order_id
    WHERE ${view === "active" ? "sh.status NOT IN ('delivered','returned')" : view === "cod" ? "sh.cod_amount > 0 AND NOT sh.cod_collected AND sh.status='delivered'" : "TRUE"}
    ORDER BY sh.id DESC LIMIT 300`);
  const st = await one<any>(`SELECT count(*) FILTER (WHERE status NOT IN ('delivered','returned'))::int open, count(*) FILTER (WHERE status='delivered' AND delivered_at > now() - interval '30 days')::int delivered,
    COALESCE(sum(cod_amount) FILTER (WHERE status='delivered' AND NOT cod_collected),0) cod_due, COALESCE(sum(cost) FILTER (WHERE created_at > now() - interval '30 days'),0) cost30 FROM shipments`);
  return (
    <div>
      <PageHeader title="Shipping" subtitle="Courier deliveries, tracking and cash on delivery" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="On the way" value={String(st.open)} /><Stat label="Delivered (30 days)" value={String(st.delivered)} />
        <Stat label="COD to collect from couriers" value={`${s.currency} ${num(st.cod_due)}`} href="/shipping?view=cod" /><Stat label="Shipping cost (30 days)" value={`${s.currency} ${num(st.cost30)}`} />
      </div>
      <details className="card mb-6 p-5" open={!!sp.new || !!order}>
        <summary className="cursor-pointer font-semibold">+ New shipment</summary>
        <form action={createShipment} className="mt-4 grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="order_id" value={order?.id ?? ""} />
          <div><label className="label">Receiver</label><input name="customer_name" defaultValue={order?.customer_name} className="input" /></div>
          <div><label className="label">Phone</label><input name="customer_phone" defaultValue={order?.customer_phone} className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input name="address" defaultValue={order?.delivery_address || order?.customer_address} className="input" /></div>
          <div><label className="label">Courier</label><select name="courier" className="input">{cs.map((c) => <option key={c.name}>{c.name}</option>)}</select></div>
          <div><label className="label">Tracking no.</label><input name="tracking_no" className="input" /></div>
          <div><label className="label">Our cost</label><input name="cost" className="input" inputMode="decimal" /></div>
          <div><label className="label">Cash on delivery</label><input name="cod_amount" defaultValue={order ? Math.max(0, Number(order.total) - Number(order.advance)).toFixed(2) : ""} className="input" inputMode="decimal" /></div>
          <div className="sm:col-span-3"><label className="label">Notes</label><input name="notes" defaultValue={order ? `Order ${order.number}` : ""} className="input" /></div>
          <div className="flex items-end"><Submit>Create shipment</Submit></div>
        </form>
      </details>
      <div className="mb-3 flex gap-2 text-sm">{[["active", "On the way"], ["cod", "COD to collect"], ["all", "All"]].map(([k, v]) => <Link key={k} href={`/shipping?view=${k}`} className={`rounded-full border px-3 py-1 ${view === k ? "border-accent bg-accent/10 text-accent" : "border-slate-200"}`}>{v}</Link>)}</div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Shipment</th><th>Receiver</th><th>Courier / tracking</th><th className="text-right">COD</th><th>Status</th><th>Update</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const url = trackingUrl(s.couriers, r.courier, r.tracking_no);
              const ss = shipStatus(r.status);
              return (
                <tr key={r.id}>
                  <td className="font-medium">{r.number}{r.order_no && <Link href={`/orders/${r.order_id}`} className="block text-xs text-accent">{r.order_no}</Link>}<div className="text-xs text-slate-400">{fmtDate(r.created_at)}</div></td>
                  <td>{r.customer_name}<div className="text-xs text-slate-400">{r.customer_phone} {r.address}</div></td>
                  <td>{r.courier}<div className="text-xs">{url ? <a href={url} target="_blank" className="text-accent">{r.tracking_no}</a> : r.tracking_no || "—"}</div>
                    {r.customer_phone && url && <a href={waLink(r.customer_phone, `${s.shop_name}: your order is on the way with ${r.courier}. Track it here: ${url}`)} target="_blank" className="text-xs text-emerald-600">Send tracking</a>}</td>
                  <td className="text-right tabular-nums">{Number(r.cod_amount) > 0 ? <>{num(r.cod_amount)}<div className="text-xs">{r.cod_collected ? <Badge tone="green">collected</Badge> : r.status === "delivered" ? <form action={updateShipment}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cod" value="1" /><Submit className="text-xs text-accent">Mark collected</Submit></form> : null}</div></> : "—"}</td>
                  <td><Badge tone={ss.tone}>{ss.label}</Badge>{r.delivered_at && <div className="text-xs text-slate-400">{fmtDate(r.delivered_at)}</div>}</td>
                  <td><form action={updateShipment} className="flex gap-1"><input type="hidden" name="id" value={r.id} />
                    {!r.tracking_no && <input name="tracking_no" placeholder="Tracking" className="input h-8 w-28 text-xs" />}
                    <select name="status" defaultValue={r.status} className="input h-8 w-36 text-xs">{SHIP_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select><Submit className="btn-ghost btn-sm">Save</Submit></form></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">No shipments</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Orders marked “Shipped” create a shipment automatically. Couriers and tracking links: Settings → Integrations.</p>
    </div>
  );
}
