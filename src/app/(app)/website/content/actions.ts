"use server";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { siteContent, type SiteContent } from "@/lib/site-content";
import { websiteConfig } from "@/lib/website";
import { str } from "@/lib/util";

const P = "/website/content";
function go(msg: string, kind: "ok" | "err" = "ok"): never { redirect(`${P}?${kind}=${encodeURIComponent(msg)}`); }
const lines = (v: string) => v.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]);

export async function saveSiteContent(fd: FormData) {
  const user = await requireUser("website");
  const cur = await siteContent();
  const imgs = await q<{ id: number; name: string }>("SELECT id, name FROM files WHERE kind='site' ORDER BY id");
  const img = (v: string) => { const f = imgs.find((x) => x.name.toLowerCase() === v.toLowerCase() || String(x.id) === v); return f ? `/api/files/${f.id}` : v; };
  const next: SiteContent = {
    announcement: str(fd, "announcement"),
    banners: lines(str(fd, "banners")).map(([title, subtitle = "", image = "", link = "", off = ""]) => ({ title, subtitle, image: img(image), link, active: off.toLowerCase() !== "off" })),
    promos: lines(str(fd, "promos")).map(([title, text = "", link = "", off = ""]) => ({ title, text, link, active: off.toLowerCase() !== "off" })),
    menu: lines(str(fd, "menu")).map(([label, link = "/"]) => ({ label, link })),
    pages: cur.pages,
    seo: { title: str(fd, "seo_title"), description: str(fd, "seo_description"), keywords: str(fd, "seo_keywords"), ga_id: str(fd, "ga_id"), gtm_id: str(fd, "gtm_id"), meta_pixel_id: str(fd, "meta_pixel_id"), search_console: str(fd, "search_console") },
    contact: { whatsapp: str(fd, "c_whatsapp"), phone: str(fd, "c_phone"), email: str(fd, "c_email"), address: str(fd, "c_address"), hours: str(fd, "c_hours"), instagram: str(fd, "c_instagram"), facebook: str(fd, "c_facebook") },
  };
  await saveSettings({ site_content: JSON.stringify(next), website_orders_enabled: fd.get("website_orders_enabled") === "on", portal_enabled: fd.get("portal_enabled") === "on" });
  await log(user.id, "Website content changed", "", P);
  go("Saved. The website picks it up within a minute (or press Publish to push the file to the website repository).");
}

export async function savePage(fd: FormData) {
  const user = await requireUser("website");
  const cur = await siteContent();
  const title = str(fd, "title");
  const slug = (str(fd, "slug") || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!title || !slug) go("The page needs a title", "err");
  const pages = cur.pages.filter((p) => p.slug !== slug && p.slug !== str(fd, "old_slug"));
  if (fd.get("delete") !== "1") pages.push({ slug, title, body: str(fd, "body") });
  await saveSettings({ site_content: JSON.stringify({ ...cur, pages }) });
  await log(user.id, fd.get("delete") === "1" ? "Website page deleted" : "Website page saved", title, P);
  go(fd.get("delete") === "1" ? "Page deleted" : "Page saved");
}

/** Pushes site.json next to the catalogue file in the website's GitHub repository. */
export async function publishSiteContent() {
  const user = await requireUser("website");
  const c = await websiteConfig();
  if (!c.repo || !c.token) go("Connect the website first (Website → Connection).", "err");
  const content = await siteContent();
  const zones = await q("SELECT name, areas, charge, free_over, days FROM shipping_zones ORDER BY id");
  const path = c.path.includes("/") ? c.path.replace(/[^/]+$/, "site.json") : "site.json";
  const api = `https://api.github.com/repos/${c.repo}/contents/${encodeURI(path)}`;
  const h = { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "User-Agent": "ShopDesk-ERP" };
  try {
    const cur = await fetch(`${api}?ref=${encodeURIComponent(c.branch)}`, { headers: h, cache: "no-store" });
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const body = { ...content, banners: content.banners.filter((b) => b.active), promos: content.promos.filter((p) => p.active), delivery_zones: zones, v: Date.now() };
    const r = await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ message: "Website content from DOLLAR44 ERP", content: Buffer.from(JSON.stringify(body, null, 1)).toString("base64"), sha, branch: c.branch }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || `GitHub error ${r.status}`);
  } catch (e: any) { go(e?.message ?? "Publishing failed", "err"); }
  await q("INSERT INTO website_publishes (user_id, summary, added, updated, commit_sha) VALUES ($1,$2,0,0,'')", [user.id, `Content published to ${path}`]);
  await log(user.id, "Website content published", path, P);
  go(`Published to ${path} in ${c.repo}`);
}
