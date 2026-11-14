import { getSettings } from "@/lib/settings";
import { trackOrder } from "@/lib/track";
import { fmtDate, num } from "@/lib/util";

export const metadata = { title: "Track your order", robots: { index: false } };

export default async function TrackPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const r = sp.order && sp.phone ? await trackOrder(sp.order, sp.phone) : null;
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{s.shop_name}</h1>
        <p className="mb-5 text-sm text-slate-500">Track your order</p>
        <form className="mb-6 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input name="order" defaultValue={sp.order} placeholder="Order number (SO-…)" className="input" required />
          <input name="phone" defaultValue={sp.phone} placeholder="Your phone number" className="input" inputMode="tel" required />
          <button className="btn-primary">Track</button>
        </form>
        {sp.order && sp.phone && !r && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">We could not find an order with that number and phone. Check them and try again.</p>}
        {sp.order && !sp.phone && <p className="text-sm text-slate-500">Enter the phone number used for the order to see its status.</p>}
        {r && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-teal-50 p-4"><div className="text-xs text-teal-700">Order {r.number}</div><div className="text-lg font-semibold text-teal-900">{r.status}</div>{r.expected && <div className="text-xs text-teal-700">Expected {fmtDate(r.expected)}</div>}</div>
            {r.shipment && <div className="rounded-xl border border-slate-200 p-4"><div className="font-medium">{r.shipment.courier || "Delivery"}: {r.shipment.status}</div>{r.shipment.tracking_no && <div className="text-slate-500">Tracking no. {r.shipment.tracking_no}</div>}{r.shipment.tracking_url && <a href={r.shipment.tracking_url} target="_blank" className="mt-1 inline-block text-teal-700 underline">Track with the courier</a>}</div>}
            <ul>{r.items.map((i, k) => <li key={k} className="flex justify-between border-b border-slate-100 py-1"><span>{i.name}</span><span>× {i.qty}</span></li>)}</ul>
            <div className="text-right font-semibold">Total {r.currency} {num(r.total)}</div>
            {r.history.length > 0 && <ol className="border-l border-slate-200 pl-4 text-xs text-slate-500">{r.history.map((h, k) => <li key={k} className="py-0.5">{fmtDate(h.at, true)} · {h.status}</li>)}</ol>}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">{s.phone}</p>
      </div>
    </div>
  );
}
