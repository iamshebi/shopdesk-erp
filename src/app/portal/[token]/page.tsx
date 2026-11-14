import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { statusInfo } from "@/lib/orders";
import { readCustomerToken, saleToken } from "@/lib/public-link";
import { storeCreditBalance } from "@/lib/store-credit";
import { fmtDate, num } from "@/lib/util";
import { portalTicket } from "./actions";

export const metadata = { title: "My account", robots: { index: false } };

export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const cid = await readCustomerToken(token);
  if (!cid || !s.portal_enabled) notFound();
  const c = await one<any>("SELECT * FROM customers WHERE id=$1", [cid]);
  if (!c) notFound();
  const invoices = await q<any>(`SELECT s.id, s.number, s.type, s.date, s.total, s.pay_link, ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.customer_id=$1 ORDER BY s.id DESC LIMIT 30`, [cid]);
  const withLinks = await Promise.all(invoices.map(async (i) => ({ ...i, href: `/i/${await saleToken(i.id)}` })));
  const orders = await q<any>("SELECT number, kind, status, total, created_at, tracking_no, courier FROM orders WHERE customer_id=$1 ORDER BY id DESC LIMIT 20", [cid]);
  const tickets = await q<any>("SELECT number, subject, status, created_at FROM tickets WHERE customer_id=$1 ORDER BY id DESC LIMIT 10", [cid]);
  const pts = (await one<{ p: number }>("SELECT COALESCE(sum(points),0)::int p FROM loyalty_ledger WHERE customer_id=$1", [cid]))!.p;
  const credit = await storeCreditBalance(q, cid);
  const owes = invoices.filter((i) => i.type === "invoice").reduce((a, i) => a + Math.max(0, Number(i.outstanding)), 0);
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>;
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header><div className="text-sm text-slate-500">{s.shop_name}</div><h1 className="text-2xl font-semibold">Hello {c.name}</h1></header>
        {sp.ok && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
        {sp.err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Balance due</div><div className="text-xl font-semibold">{s.currency} {num(owes)}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Loyalty points</div><div className="text-xl font-semibold">{pts}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">Store credit</div><div className="text-xl font-semibold">{s.currency} {num(credit)}</div></div>
        </div>
        <Card title="Orders">
          {orders.length === 0 ? <p className="text-sm text-slate-400">No orders yet</p> : <ul className="text-sm">{orders.map((o) => <li key={o.number} className="flex justify-between border-b border-slate-100 py-1.5"><span>{o.number} <span className="text-xs text-slate-400">{o.kind === "quote" ? "quotation" : ""} {fmtDate(o.created_at)}</span>{o.tracking_no && <span className="block text-xs text-slate-500">{o.courier} {o.tracking_no}</span>}</span><span>{statusInfo(o.kind, o.status).label} · {num(o.total)}</span></li>)}</ul>}
        </Card>
        <Card title="Invoices">
          {withLinks.length === 0 ? <p className="text-sm text-slate-400">No invoices yet</p> : <ul className="text-sm">{withLinks.map((i) => <li key={i.id} className="flex items-center justify-between border-b border-slate-100 py-1.5"><a href={i.href} className="text-teal-700 underline">{i.number}</a><span className="text-slate-500">{fmtDate(i.date)}</span><span>{i.type === "credit_note" ? "−" : ""}{num(i.total)}</span>
            <span>{i.type === "invoice" && i.outstanding > 0.004 ? (i.pay_link ? <a href={i.pay_link} className="rounded-lg bg-teal-700 px-2 py-1 text-xs text-white">Pay {num(i.outstanding)}</a> : <span className="text-amber-700">Due {num(i.outstanding)}</span>) : <span className="text-emerald-700">{i.type === "credit_note" ? "Refund" : "Paid"}</span>}</span></li>)}</ul>}
        </Card>
        <Card title="Need help?">
          {tickets.length > 0 && <ul className="mb-3 text-sm">{tickets.map((t) => <li key={t.number} className="flex justify-between py-0.5"><span>{t.number} · {t.subject}</span><span className="capitalize text-slate-500">{t.status}</span></li>)}</ul>}
          <form action={portalTicket} className="grid gap-2">
            <input type="hidden" name="token" value={token} /><input name="company" className="hidden" tabIndex={-1} autoComplete="off" />
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]"><input name="subject" placeholder="What is it about?" className="input" required /><select name="category" className="input"><option value="inquiry">Question</option><option value="warranty">Warranty</option><option value="return">Return / refund</option><option value="delivery">Delivery</option><option value="complaint">Complaint</option></select></div>
            <textarea name="body" rows={3} placeholder="Tell us more" className="input" />
            <button className="btn-primary w-fit">Send request</button>
          </form>
        </Card>
        <p className="text-center text-xs text-slate-400">{s.phone} · {s.address}</p>
      </div>
    </div>
  );
}
