import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { siteContent } from "@/lib/site-content";
import { baseUrl } from "@/lib/public-link";
import { fmtDate, num } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import Attachments from "@/components/attachments";
import { saveSiteContent, savePage, publishSiteContent } from "./actions";

export default async function WebsiteContentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("website");
  const sp = await searchParams;
  const s = await getSettings();
  const c = await siteContent();
  const base = await baseUrl();
  const webOrders = await q<any>("SELECT id, number, customer_name, total, status, created_at FROM orders WHERE source='website' ORDER BY id DESC LIMIT 8");
  const carts = await q<any>("SELECT * FROM web_carts WHERE status='open' AND updated_at < now() - interval '1 hour' AND (phone <> '' OR email <> '') ORDER BY updated_at DESC LIMIT 8");
  const F = ({ label, name, value, ph }: { label: string; name: string; value: string; ph?: string }) => <div><label className="label">{label}</label><input name={name} defaultValue={value} placeholder={ph} className="input" /></div>;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Website content" subtitle="Banners, promotions, menu, pages, SEO and tracking codes for the shop website">
        <Link href="/website" className="btn-ghost">Products &amp; connection</Link>
        <a href="/api/public/site" target="_blank" className="btn-ghost">Preview data</a>
        <form action={publishSiteContent}><Submit className="btn-primary">Publish to website</Submit></form>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <form action={saveSiteContent} className="space-y-6">
        <section className="card grid gap-3 p-6">
          <h2 className="font-semibold">Homepage</h2>
          <F label="Announcement bar (top of the site)" name="announcement" value={c.announcement} ph="Free delivery over AED 200 this week" />
          <div><label className="label">Banners, one per line: Title | Subtitle | Image (file name from below, or a link) | Link | off</label>
            <textarea name="banners" rows={4} className="input font-mono text-xs" defaultValue={c.banners.map((b) => [b.title, b.subtitle, b.image, b.link, b.active ? "" : "off"].join(" | ")).join("\n")} placeholder="Eid offers | Up to 30% off | eid.jpg | /offers" /></div>
          <div><label className="label">Promotion blocks: Title | Text | Link | off</label>
            <textarea name="promos" rows={3} className="input font-mono text-xs" defaultValue={c.promos.map((b) => [b.title, b.text, b.link, b.active ? "" : "off"].join(" | ")).join("\n")} /></div>
          <div><label className="label">Menu: Label | Link</label>
            <textarea name="menu" rows={3} className="input font-mono text-xs" defaultValue={c.menu.map((b) => [b.label, b.link].join(" | ")).join("\n")} placeholder={"Home | /\nOffers | /offers\nContact | /contact"} /></div>
        </section>
        <section className="card grid gap-3 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Search engines &amp; tracking codes</h2>
          <F label="Site title (SEO)" name="seo_title" value={c.seo.title} /><F label="Keywords" name="seo_keywords" value={c.seo.keywords} />
          <div className="sm:col-span-2"><label className="label">Site description (SEO)</label><textarea name="seo_description" rows={2} defaultValue={c.seo.description} className="input" /></div>
          <F label="Google Analytics ID" name="ga_id" value={c.seo.ga_id} ph="G-XXXXXXXXXX" /><F label="Google Tag Manager ID" name="gtm_id" value={c.seo.gtm_id} ph="GTM-XXXXXXX" />
          <F label="Meta (Facebook) Pixel ID" name="meta_pixel_id" value={c.seo.meta_pixel_id} /><F label="Google Search Console verification code" name="search_console" value={c.seo.search_console} />
        </section>
        <section className="card grid gap-3 p-6 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Contact details shown on the site</h2>
          <F label="WhatsApp" name="c_whatsapp" value={c.contact.whatsapp} /><F label="Phone" name="c_phone" value={c.contact.phone} /><F label="Email" name="c_email" value={c.contact.email} />
          <F label="Address" name="c_address" value={c.contact.address} /><F label="Opening hours" name="c_hours" value={c.contact.hours} /><F label="Instagram" name="c_instagram" value={c.contact.instagram} />
          <F label="Facebook" name="c_facebook" value={c.contact.facebook} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="website_orders_enabled" defaultChecked={s.website_orders_enabled} /> Accept orders from the website</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portal_enabled" defaultChecked={s.portal_enabled} /> Customer portal links work</label>
        </section>
        <Submit>Save website content</Submit>
      </form>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Attachments kind="site" ownerId={0} back="/website/content" title="Website images (banners)" />
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Pages (About, Delivery, Returns…)</h3>
          {c.pages.map((p) => (
            <details key={p.slug} className="mb-2 rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-medium">{p.title} <span className="text-xs font-normal text-slate-400">/{p.slug}</span></summary>
              <form action={savePage} className="mt-2 space-y-2"><input type="hidden" name="old_slug" value={p.slug} /><input name="title" defaultValue={p.title} className="input" /><input name="slug" defaultValue={p.slug} className="input" /><textarea name="body" defaultValue={p.body} rows={5} className="input" />
                <div className="flex gap-2"><Submit className="btn-dark btn-sm">Save page</Submit><button name="delete" value="1" className="btn-ghost btn-sm">Delete</button></div></form></details>
          ))}
          <details className="rounded-lg border border-dashed border-slate-300 p-3 text-sm"><summary className="cursor-pointer text-accent">+ New page</summary>
            <form action={savePage} className="mt-2 space-y-2"><input name="title" placeholder="Title" className="input" required /><textarea name="body" rows={5} className="input" placeholder="Page text" /><Submit className="btn-dark btn-sm">Add page</Submit></form></details>
        </div>
        <div className="card p-5 text-sm">
          <h3 className="mb-2 font-semibold">Orders from the website</h3>
          {webOrders.map((o) => <div key={o.id} className="flex justify-between py-0.5"><Link href={`/orders/${o.id}`} className="text-accent">{o.number}</Link><span>{o.customer_name}</span><span className="text-slate-500">{fmtDate(o.created_at)} · {num(o.total)} · {o.status}</span></div>)}
          {webOrders.length === 0 && <p className="text-slate-400">None yet. They arrive under Orders as drafts and you get a notification.</p>}
          <h3 className="mb-2 mt-4 font-semibold">Unfinished carts</h3>
          {carts.map((k) => <div key={k.id} className="flex justify-between py-0.5"><span>{k.name || k.phone || k.email}</span><span className="text-slate-500">{(k.items as any[]).length} items · {num(k.total)} · {fmtDate(k.updated_at, true)}</span></div>)}
          {carts.length === 0 && <p className="text-slate-400">No abandoned carts.</p>}
        </div>
        <div className="card p-5 text-xs text-slate-600">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">For the website developer</h3>
          <pre className="overflow-x-auto rounded bg-slate-50 p-3">{`Content   GET  ${base}/api/public/site
Products  GET  ${base}/api/public/catalog
Order     POST ${base}/api/public/orders
  {customer:{name,phone,email,address}, lines:[{id|product_id, qty}],
   zone, pickup, coupon, notes, cart_token}
Save cart POST ${base}/api/public/cart   {token, items:[{id,name,qty,price}], phone}
Track     GET  ${base}/api/public/track?order=SO-000001&phone=05…
Tracking page for customers: ${base}/track`}</pre>
          <p className="mt-2">Orders are only accepted from <b>{s.website_url || "the website address set under Website → Connection"}</b>. Prices are always taken from the ERP.</p>
        </div>
      </div>
    </div>
  );
}
