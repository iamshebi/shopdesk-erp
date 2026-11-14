import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SEGMENTS } from "@/lib/segments";
import { channelsReady } from "@/lib/messaging";
import { fmtDate, num, waLink } from "@/lib/util";
import { PageHeader, Badge, Stat } from "@/components/ui";
import Submit from "@/components/submit";
import { saveCampaign, cartReminded } from "./actions";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("marketing");
  const sp = await searchParams;
  const s = await getSettings();
  const ready = await channelsReady();
  const rows = await q<any>(`SELECT c.*, (SELECT COALESCE(sum(total),0) FROM sales WHERE c.coupon_code <> '' AND upper(coupon_code)=upper(c.coupon_code)) revenue, (SELECT count(*)::int FROM sales WHERE c.coupon_code <> '' AND upper(coupon_code)=upper(c.coupon_code)) orders FROM campaigns c ORDER BY c.id DESC LIMIT 100`);
  const groups = await q<{ g: string }>("SELECT DISTINCT group_name g FROM customers WHERE group_name <> '' ORDER BY 1");
  const coupons = await q<any>("SELECT code FROM coupons WHERE active AND customer_id IS NULL ORDER BY id DESC LIMIT 50");
  const carts = await q<any>("SELECT * FROM web_carts WHERE status='open' AND updated_at < now() - interval '1 hour' AND (phone <> '' OR email <> '') ORDER BY updated_at DESC LIMIT 30");
  const aff = await q<any>(`SELECT c.affiliate, c.code, c.affiliate_rate, count(s.id)::int orders, COALESCE(sum(s.total - s.vat),0) net FROM coupons c LEFT JOIN sales s ON upper(s.coupon_code)=upper(c.code) AND s.type='invoice' WHERE c.affiliate <> '' GROUP BY c.id ORDER BY net DESC`);
  const st = await one<any>(`SELECT (SELECT count(*)::int FROM campaigns WHERE status='sent') sent, (SELECT COALESCE(sum(sent),0)::int FROM campaigns) msgs,
    (SELECT COALESCE(sum(total),0) FROM sales WHERE coupon_code <> '' AND type='invoice' AND date > now() - interval '90 days') coupon_rev,
    (SELECT count(*)::int FROM customers WHERE referred_by IS NOT NULL) referrals`);
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Messages to groups of customers by WhatsApp, email or SMS, with results"><Link href="/marketing" className="btn-ghost">Coupons &amp; loyalty</Link></PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Campaigns sent" value={String(st.sent)} hint={`${st.msgs} messages`} /><Stat label="Sales with a coupon (90 days)" value={`${s.currency} ${num(st.coupon_rev)}`} />
        <Stat label="Customers from referrals" value={String(st.referrals)} /><Stat label="Unfinished website carts" value={String(carts.length)} />
      </div>
      <details className="card mb-6 p-5" open={!!sp.new || rows.length === 0}>
        <summary className="cursor-pointer font-semibold">+ New campaign</summary>
        <form action={saveCampaign} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" required placeholder="Eid offer" /></div>
          <div><label className="label">Send by</label><select name="channel" className="input"><option value="whatsapp">WhatsApp {ready.whatsapp ? "(API)" : "(tap to send)"}</option><option value="email">Email{ready.email ? "" : " (not set up)"}</option><option value="sms">SMS{ready.sms ? "" : " (not set up)"}</option></select></div>
          <div><label className="label">To</label><select name="segment" className="input">{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label className="label">Only group</label><select name="group_name" className="input"><option value="">Any</option>{groups.map((g) => <option key={g.g}>{g.g}</option>)}</select></div>
          <div><label className="label">Coupon to include</label><select name="coupon_code" className="input"><option value="">None</option>{coupons.map((c) => <option key={c.code}>{c.code}</option>)}</select></div>
          <div><label className="label">Email subject</label><input name="subject" className="input" /></div>
          <div><label className="label">Campaign cost (ads, design)</label><input name="cost" className="input" inputMode="decimal" /></div>
          <div className="sm:col-span-4"><label className="label">Message. Use {"{name}"}, {"{coupon}"}, {"{shop}"}</label><textarea name="message" rows={3} className="input" required placeholder="Hi {name}! Eid Mubarak from {shop}. Use code {coupon} for 10% off this week." /></div>
          <div className="sm:col-span-4"><Submit>Save &amp; preview recipients</Submit></div>
        </form>
      </details>
      <div className="card mb-6 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Campaign</th><th>Channel</th><th>To</th><th>Sent</th><th className="text-right">Orders with coupon</th><th className="text-right">Revenue</th><th className="text-right">Return</th></tr></thead>
          <tbody>
            {rows.map((c) => <tr key={c.id}><td><Link href={`/marketing/campaigns/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link><div className="text-xs text-slate-400">{c.sent_at ? fmtDate(c.sent_at, true) : "draft"}</div></td><td className="capitalize">{c.channel}</td><td>{SEGMENTS[c.segment]?.label}{c.group_name && ` · ${c.group_name}`}</td>
              <td>{c.status === "sent" ? `${c.sent} / ${c.recipients}` : <Badge tone="amber">draft</Badge>}</td><td className="text-right">{c.coupon_code ? c.orders : "—"}</td><td className="text-right tabular-nums">{c.coupon_code ? num(c.revenue) : "—"}</td>
              <td className="text-right">{Number(c.cost) > 0 && c.coupon_code ? `${Math.round((Number(c.revenue) / Number(c.cost)) * 10) / 10}×` : "—"}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400">No campaigns yet</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5 text-sm">
          <h3 className="mb-2 font-semibold">Unfinished website carts</h3>
          {carts.map((k) => { const text = `Hi ${k.name || ""}, you left ${(k.items as any[]).length} item(s) in your cart at ${s.shop_name}. Need any help to complete your order?`; return (
            <div key={k.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5"><span>{k.name || k.phone || k.email}<span className="block text-xs text-slate-400">{(k.items as any[]).map((i) => `${i.qty}× ${i.name}`).join(", ").slice(0, 70)} · {num(k.total)}</span></span>
              <form action={cartReminded} className="flex shrink-0 gap-1"><input type="hidden" name="id" value={k.id} />{k.phone && <a href={waLink(k.phone, text)} target="_blank" className="btn-ghost btn-sm">WhatsApp</a>}<Submit className="btn-ghost btn-sm">{k.reminded_at ? "Reminded ✓" : "Mark reminded"}</Submit></form></div>); })}
          {carts.length === 0 && <p className="text-slate-400">None. Carts appear here when a visitor adds items on the website, gives a phone or email, and leaves.</p>}
        </div>
        <div className="card p-5 text-sm">
          <h3 className="mb-2 font-semibold">Affiliates &amp; influencers</h3>
          {aff.map((a) => <div key={a.code} className="flex justify-between border-b border-slate-100 py-1.5"><span>{a.affiliate} <span className="font-mono text-xs text-slate-400">{a.code}</span></span><span>{a.orders} orders · {num(a.net)} · owes {s.currency} {num((Number(a.net) * Number(a.affiliate_rate)) / 100)}</span></div>)}
          {aff.length === 0 && <p className="text-slate-400">Give a partner their own coupon code (Coupons → Affiliate name and %). Sales with that code are counted here with the commission you owe.</p>}
        </div>
      </div>
    </div>
  );
}
