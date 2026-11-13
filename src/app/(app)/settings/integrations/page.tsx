import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { baseUrl } from "@/lib/public-link";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import SettingsTabs from "@/components/settings-tabs";
import { saveEmailSettings, testEmail, savePaymentSettings, saveShippingCurrency, deleteCurrency, createApiKey, revokeApiKey, addWebhook, deleteWebhook, testWebhook } from "./actions";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("integrations");
  const sp = await searchParams;
  const s = await getSettings();
  const base = await baseUrl();
  const keys = await q<any>("SELECT k.*, u.name by_name FROM api_keys k LEFT JOIN users u ON u.id=k.created_by ORDER BY k.revoked, k.id DESC");
  const hooks = await q<any>("SELECT * FROM webhooks ORDER BY id");
  const deliveries = await q<any>("SELECT d.*, w.url FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.id DESC LIMIT 10");
  const currencies = await q<any>("SELECT * FROM currencies ORDER BY code");
  const emails = await q<any>("SELECT * FROM email_log ORDER BY id DESC LIMIT 8");
  const Card = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
    <section className="card p-6"><h2 className="font-semibold">{title}</h2>{hint && <p className="mb-4 mt-1 text-sm text-slate-500">{hint}</p>}{children}</section>
  );
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Connect email, online payments, couriers, other apps and your website" />
      <SettingsTabs active="/settings/integrations" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      {sp.newkey && <div className="card mb-4 border-amber-300 bg-amber-50 p-4 text-sm"><div className="font-semibold">Your new API key</div><code className="mt-1 block break-all rounded bg-white p-2 font-mono">{sp.newkey}</code></div>}
      <div className="space-y-6">
        <Card title="Email (invoices, reminders, daily report)" hint="Uses Resend (resend.com): free for 3,000 emails a month. Create an API key there and verify your domain, then paste it here.">
          <form action={saveEmailSettings} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Send from address</label><input name="email_from" defaultValue={s.email_from} className="input" placeholder="invoices@yourshop.ae" /></div>
            <div><label className="label">Resend API key {s.resend_key_enc && <Badge tone="green">saved</Badge>}</label><input name="resend_key" type="password" className="input" placeholder={s.resend_key_enc ? "•••••• (leave blank to keep)" : "re_…"} /></div>
            <div><label className="label">Daily summary email to (owner)</label><input name="daily_report_email" defaultValue={s.daily_report_email} className="input" placeholder="you@email.com" /></div>
            <div><label className="label">Remind every (days)</label><input name="reminder_every_days" defaultValue={s.reminder_every_days} className="input" inputMode="numeric" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_reminders" defaultChecked={s.auto_reminders} /> Email overdue invoice reminders automatically</label>
            {s.resend_key_enc && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="forget" /> Remove saved key</label>}
            <div className="sm:col-span-2"><Submit>Save email settings</Submit></div>
          </form>
          {s.resend_key_enc && <form action={testEmail} className="mt-3 flex gap-2"><input name="to" className="input w-64" placeholder="send a test to…" /><Submit className="btn-ghost">Send test</Submit></form>}
          {emails.length > 0 && <div className="mt-4 text-xs text-slate-500">{emails.map((e) => <div key={e.id}>{fmtDate(e.created_at, true)} · {e.to_addr} · {e.subject} · <span className={e.status === "sent" ? "text-emerald-600" : "text-red-600"}>{e.status}{e.error && `: ${e.error}`}</span></div>)}</div>}
        </Card>
        <Card title="Online payments (card / Apple Pay payment links)" hint="Uses Stripe, which supports UAE businesses. Paste your secret key to create “Pay now” links on invoices. Payments are recorded on the invoice automatically.">
          <form action={savePaymentSettings} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Stripe secret key {s.stripe_key_enc && <Badge tone="green">saved</Badge>}</label><input name="stripe_key" type="password" className="input" placeholder={s.stripe_key_enc ? "•••••• (leave blank to keep)" : "sk_live_…"} /></div>
            <div><label className="label">Webhook signing secret {s.stripe_webhook_secret_enc && <Badge tone="green">saved</Badge>}</label><input name="stripe_webhook_secret" type="password" className="input" placeholder="whsec_…" /></div>
            <p className="text-xs text-slate-500 sm:col-span-2">In Stripe → Developers → Webhooks, add endpoint <code className="rounded bg-slate-100 px-1">{base}/api/stripe/webhook</code> with event <code>checkout.session.completed</code>, then paste its signing secret above.</p>
            {s.stripe_key_enc && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="forget" /> Remove saved keys</label>}
            <div className="sm:col-span-2"><Submit>Save payment settings</Submit></div>
          </form>
        </Card>
        <Card title="Couriers & currencies" hint="One courier per line: Name|tracking link with {n} where the tracking number goes. Exchange rates are used to show quotations in other currencies.">
          <form action={saveShippingCurrency} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-4"><textarea name="couriers" defaultValue={s.couriers} rows={4} className="input font-mono text-xs" /></div>
            <div><label className="label">Currency code</label><input name="code" className="input uppercase" placeholder="USD" maxLength={3} /></div>
            <div><label className="label">Name</label><input name="name" className="input" placeholder="US dollar" /></div>
            <div><label className="label">1 {s.currency} =</label><input name="rate" className="input" inputMode="decimal" placeholder="0.2723" /></div>
            <div className="flex items-end"><Submit>Save</Submit></div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">{currencies.map((c) => <form key={c.code} action={deleteCurrency} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm"><input type="hidden" name="code" value={c.code} />{c.code} {Number(c.rate)}<button className="text-slate-400 hover:text-red-600" aria-label="Remove">×</button></form>)}</div>
        </Card>
        <Card title="API keys (connect other apps)" hint={`REST API at ${base}/api/v1. Read keys can list products, stock, customers, orders and invoices; write keys can also create orders and customers.`}>
          <form action={createApiKey} className="mb-4 flex flex-wrap gap-2"><input name="name" className="input w-56" placeholder="e.g. Website, Zapier" /><select name="scopes" className="input w-32"><option value="read">Read only</option><option value="write">Read & write</option></select><Submit>Create key</Submit></form>
          <table className="tbl"><tbody>{keys.map((k) => <tr key={k.id} className={k.revoked ? "opacity-50" : ""}><td>{k.name}<div className="font-mono text-xs text-slate-400">{k.prefix}…</div></td><td>{k.scopes}</td><td className="text-xs text-slate-500">{k.last_used_at ? `used ${fmtDate(k.last_used_at, true)}` : "never used"}</td><td className="text-right">{k.revoked ? <Badge tone="slate">revoked</Badge> : <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><Submit className="btn-ghost btn-sm" confirm="Revoke this key? Apps using it will stop working.">Revoke</Submit></form>}</td></tr>)}
            {keys.length === 0 && <tr><td className="text-slate-400">No keys</td></tr>}</tbody></table>
          <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer text-accent">API endpoints</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3">{`GET  /api/v1/products?q=&updated_since=   products with price & stock
GET  /api/v1/products/{id}
GET  /api/v1/customers?q=
POST /api/v1/customers   {name, phone, email}
GET  /api/v1/orders?status=
POST /api/v1/orders      {customer:{name,phone,email,address}, lines:[{product_id|sku, qty, price?}], notes, delivery_charge}
GET  /api/v1/invoices?from=YYYY-MM-DD&to=
POST /api/v1/coupons/check {code, amount}
Header: Authorization: Bearer <key>`}</pre></details>
        </Card>
        <Card title="Webhooks (send events to other apps)" hint="We POST JSON to your URL. Each request has X-ShopDesk-Signature: sha256=HMAC of the body with the webhook secret.">
          <form action={addWebhook} className="mb-4 space-y-2">
            <input name="url" className="input" placeholder="https://hooks.zapier.com/…" />
            <div className="flex flex-wrap gap-3 text-sm">{WEBHOOK_EVENTS.map((e) => <label key={e} className="flex items-center gap-1"><input type="checkbox" name="events" value={e} /> {e}</label>)}<span className="text-xs text-slate-400">(none ticked = all events)</span></div>
            <Submit>Add webhook</Submit>
          </form>
          {hooks.map((h) => <div key={h.id} className="mb-2 flex items-center justify-between gap-2 text-sm"><div className="min-w-0"><div className="truncate">{h.url}</div><div className="text-xs text-slate-400">{h.events} · secret <code>{h.secret}</code></div></div><form action={deleteWebhook}><input type="hidden" name="id" value={h.id} /><Submit className="btn-ghost btn-sm">Remove</Submit></form></div>)}
          {hooks.length > 0 && <form action={testWebhook}><Submit className="btn-ghost btn-sm">Send test event</Submit></form>}
          {deliveries.length > 0 && <div className="mt-3 text-xs text-slate-500">{deliveries.map((d) => <div key={d.id}>{fmtDate(d.created_at, true)} · {d.event} → <span className={d.status >= 200 && d.status < 300 ? "text-emerald-600" : "text-red-600"}>{d.status || "failed"}</span> {d.response.slice(0, 60)}</div>)}</div>}
        </Card>
      </div>
    </div>
  );
}
