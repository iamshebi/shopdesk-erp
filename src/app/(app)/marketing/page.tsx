import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num, fmtDate } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { saveCoupon, toggleCoupon, saveLoyalty } from "./actions";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("marketing");
  const sp = await searchParams;
  const s = await getSettings();
  const coupons = await q<any>(`SELECT c.*, cu.name cust, (SELECT COALESCE(sum(total),0) FROM sales WHERE upper(coupon_code)=upper(c.code)) revenue FROM coupons c LEFT JOIN customers cu ON cu.id=c.customer_id ORDER BY c.active DESC, c.id DESC LIMIT 200`);
  const top = await q<any>("SELECT c.id, c.name, c.phone, sum(l.points)::int pts FROM loyalty_ledger l JOIN customers c ON c.id=l.customer_id GROUP BY c.id HAVING sum(l.points) > 0 ORDER BY pts DESC LIMIT 15");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <PageHeader title="Marketing" subtitle="Coupons, vouchers and loyalty points"><Link href="/marketing/campaigns" className="btn-primary">Campaigns, carts &amp; affiliates</Link></PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <form action={saveCoupon} className="card grid gap-3 p-5 sm:grid-cols-4">
            <h3 className="font-semibold sm:col-span-4">New coupon</h3>
            <div><label className="label">Code</label><input name="code" className="input uppercase" placeholder="auto" /></div>
            <div><label className="label">Type</label><select name="type" className="input"><option value="percent">% off</option><option value="amount">Amount off</option></select></div>
            <div><label className="label">Value</label><input name="value" className="input" inputMode="decimal" required /></div>
            <div><label className="label">Minimum spend</label><input name="min_total" className="input" inputMode="decimal" /></div>
            <div><label className="label">Starts</label><input type="date" name="starts_on" className="input" /></div>
            <div><label className="label">Ends</label><input type="date" name="ends_on" className="input" /></div>
            <div><label className="label">Max uses (0 = unlimited)</label><input name="max_uses" className="input" inputMode="numeric" /></div>
            <div><label className="label">Note / campaign</label><input name="note" className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Affiliate / influencer name (optional)</label><input name="affiliate" className="input" /></div>
            <div><label className="label">Their commission %</label><input name="affiliate_rate" className="input" inputMode="decimal" /></div>
            <div className="sm:col-span-4"><Submit>Create coupon</Submit></div>
          </form>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th className="text-right">Sales with it</th><th></th></tr></thead>
              <tbody>
                {coupons.map((c) => {
                  const expired = c.ends_on && String(c.ends_on).slice(0, 10) < today;
                  return (
                    <tr key={c.id} className={c.active && !expired ? "" : "opacity-50"}>
                      <td className="font-mono font-medium">{c.code}{c.cust && <div className="text-xs font-sans text-slate-400">for {c.cust}</div>}{c.note && <div className="font-sans text-xs text-slate-400">{c.note}</div>}</td>
                      <td>{c.type === "percent" ? `${Number(c.value)}%` : num(c.value)}{Number(c.min_total) > 0 && <div className="text-xs text-slate-400">min {num(c.min_total)}</div>}</td>
                      <td className="text-xs text-slate-500">{c.starts_on ? fmtDate(c.starts_on) : "now"} – {c.ends_on ? fmtDate(c.ends_on) : "no end"}{expired && <Badge tone="red">expired</Badge>}</td>
                      <td>{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                      <td className="text-right tabular-nums">{num(c.revenue)}</td>
                      <td className="text-right"><form action={toggleCoupon}><input type="hidden" name="id" value={c.id} /><Submit className="btn-ghost btn-sm">{c.active ? "Disable" : "Enable"}</Submit></form></td>
                    </tr>
                  );
                })}
                {coupons.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400">No coupons yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-6">
          <form action={saveLoyalty} className="card space-y-3 p-5">
            <h3 className="font-semibold">Loyalty points</h3>
            <div><label className="label">Points earned per {s.currency} 1 spent (0 = off)</label><input name="loyalty_points_per_unit" defaultValue={s.loyalty_points_per_unit} className="input" inputMode="decimal" /></div>
            <div><label className="label">Value of 1 point ({s.currency})</label><input name="loyalty_point_value" defaultValue={s.loyalty_point_value} className="input" inputMode="decimal" /></div>
            <div><label className="label">Minimum points to redeem</label><input name="loyalty_min_redeem" defaultValue={s.loyalty_min_redeem} className="input" inputMode="numeric" /></div>
            <div><label className="label">Referral reward: points to the customer who referred a new buyer (0 = off)</label><input name="referral_points" defaultValue={s.referral_points || ""} className="input" inputMode="numeric" /></div>
            <p className="text-xs text-slate-500">Points are added to named customers on every invoice. Redeem them from the customer&apos;s page: it makes a one-time voucher code to use at the till.</p>
            <Submit className="btn-dark">Save</Submit>
          </form>
          <div className="card p-5 text-sm">
            <h3 className="mb-2 font-semibold">Top point balances</h3>
            {top.map((c) => <div key={c.id} className="flex justify-between py-0.5"><Link href={`/customers/${c.id}`} className="hover:text-accent">{c.name}</Link><span className="tabular-nums">{c.pts}</span></div>)}
            {top.length === 0 && <div className="text-slate-400">No points yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
