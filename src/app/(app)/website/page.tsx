import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { STOCK_SQL } from "@/lib/stock";
import { fetchCatalog, buildCatalog, websiteConfig, type ErpProduct } from "@/lib/website";
import { fmtDate } from "@/lib/util";
import { PageHeader, Badge, Field, Stat, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import { saveConnection, testConnection, importFromWebsite, publishToWebsite } from "./actions";
import { Globe, UploadCloud, DownloadCloud, Eye } from "lucide-react";

export default async function WebsitePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("website");
  const sp = await searchParams;
  const s = await getSettings();
  const c = await websiteConfig();
  const connected = !!(c.repo && c.token);
  const counts = await one<any>("SELECT count(*) FILTER (WHERE web_id <> '')::int linked, count(*) FILTER (WHERE active AND website_visible AND status='active')::int visible FROM products");
  const history = await q<any>("SELECT w.*, u.name FROM website_publishes w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 20");
  let preview: { changes: string[]; added: number; updated: number; total: number; sha: string } | null = null;
  let previewError = "";
  if (connected && sp.preview) {
    try {
      const { catalog, sha } = await fetchCatalog();
      const products = await q<ErpProduct>(`SELECT p.id, p.web_id, p.name, p.brand, p.category, p.description, p.specs, p.price, p.discount_price, p.status, p.active, p.website_visible, p.is_service, ${STOCK_SQL} AS stock FROM products p ORDER BY p.id`);
      const b = buildCatalog(catalog, products, c.showPrices);
      preview = { changes: b.changes, added: b.added, updated: b.updated, total: b.catalog.products.length, sha };
    } catch (e: any) {
      previewError = e?.message || "Could not read the website";
    }
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title="Website" subtitle="Keep the shop website's products in step with the ERP">
        <Link href="/website/content" className="btn-primary">Banners, pages, SEO &amp; orders</Link>
        {c.url && <a href={c.url} target="_blank" className="btn-ghost"><Globe size={16} /> Open website</a>}
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Connection" value={connected ? "Connected" : "Not set up"} hint={c.repo || "add the repository below"} />
        <Stat label="Products linked to the website" value={String(counts.linked)} hint="the ERP updates these" />
        <Stat label="Products marked “show on website”" value={String(counts.visible)} hint="active, not archived" />
      </div>

      {connected && (
        <section className="card mb-6 p-6">
          <h2 className="font-semibold">Publish</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            Sends names, brands, details, categories, stock status{c.showPrices ? ", prices" : ""} and visibility of linked products, and adds new visible ones.
            Products that are only on the website are never touched. Every publish is one change on GitHub that can be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/website?preview=1" className="btn-primary"><Eye size={16} /> Preview changes</a>
            <form action={importFromWebsite}><Submit className="btn-ghost" confirm="Copy the website's products into the ERP? Nothing on the website changes."><DownloadCloud size={16} /> Import products from website</Submit></form>
            <form action={testConnection}><Submit className="btn-ghost">Check connection</Submit></form>
          </div>
          {previewError && <p className="mt-4 text-sm text-red-600">{previewError}</p>}
          {preview && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="mb-2 font-medium">{preview.changes.length ? `${preview.added} to add, ${preview.updated} to update` : "No changes. The website already matches."}</div>
              {preview.changes.length > 0 && (
                <>
                  <ul className="max-h-80 space-y-1 overflow-y-auto text-sm text-slate-600">{preview.changes.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                  <form action={publishToWebsite} className="mt-4">
                    <input type="hidden" name="sha" value={preview.sha} />
                    <Submit confirm="Publish these changes to the live website?"><UploadCloud size={16} /> Publish to website</Submit>
                  </form>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card mb-6 p-6">
        <h2 className="font-semibold">Connection</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">For websites that keep products in a catalogue file on GitHub (like the Zaitoon Mobiles site). The key needs “Contents: read and write” on that repository only.</p>
        <form action={saveConnection} className="grid gap-4 sm:grid-cols-2">
          <Field label="Website address"><input name="website_url" defaultValue={s.website_url} className="input" placeholder="https://zaitoonmobiles.com" /></Field>
          <Field label="GitHub repository"><input name="website_repo" defaultValue={s.website_repo} className="input" placeholder="iamshebi/zaitoon-mobiles" /></Field>
          <Field label="Branch"><input name="website_branch" defaultValue={s.website_branch} className="input" /></Field>
          <Field label="Catalogue file"><input name="website_path" defaultValue={s.website_path} className="input" /></Field>
          <Field label={s.website_token_enc ? "GitHub key (saved, leave empty to keep)" : "GitHub key (fine-grained token)"}><input name="token" type="password" className="input" autoComplete="off" placeholder={s.website_token_enc ? "••••••••" : "github_pat_…"} /></Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="website_show_prices" defaultChecked={s.website_show_prices} /> Show prices on the website</label>
            {s.website_token_enc && <label className="flex items-center gap-2 text-slate-500"><input type="checkbox" name="forget" /> Remove the saved key</label>}
          </div>
          <div className="sm:col-span-2"><Submit>Save connection</Submit></div>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <div className="p-6 pb-3 font-semibold">Publish history</div>
        {history.length === 0 ? <Empty>Nothing published yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>By</th><th>Changes</th><th>Commit</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDate(h.created_at, true)}</td>
                <td>{h.name ?? "—"}</td>
                <td><Badge tone="green">{h.added} added</Badge> <Badge tone="blue">{h.updated} updated</Badge><details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Details</summary><pre className="whitespace-pre-wrap">{h.summary}</pre></details></td>
                <td>{h.commit_sha ? <a className="link font-mono text-xs" target="_blank" href={`https://github.com/${c.repo}/commit/${h.commit_sha}`}>{h.commit_sha.slice(0, 7)}</a> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
