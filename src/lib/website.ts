import "server-only";
import { getSettings } from "./settings";
import { decryptField } from "./totp";

// Connection to a website whose products live in a JSON catalogue on GitHub (the Zaitoon Mobiles format).
// The ERP is the source for products it is linked to; products that exist only on the website are left alone.

export interface WebProduct { id: string; c: number; b?: string; n: string; d?: string; i?: string; st?: "out" | "soon"; pr?: number; h?: number; [k: string]: unknown }
export interface Catalog { departments: { id: string; en: string; ar: string; cats: number[] }[]; categories: { id: string; en: string; ar: string }[]; products: WebProduct[]; v?: number }

export async function websiteConfig() {
  const s = await getSettings();
  let token = "";
  if (s.website_token_enc) {
    try { token = await decryptField(s.website_token_enc); } catch { token = ""; }
  }
  return { repo: s.website_repo.trim(), branch: s.website_branch.trim() || "main", path: s.website_path.trim() || "catalog.json", url: s.website_url.trim().replace(/\/$/, ""), token, showPrices: s.website_show_prices };
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ShopDesk-ERP", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "GitHub refused the key. Check the token has Contents: read and write on this repository." : r.status === 404 ? "Repository or catalogue file not found. Check the repository name, branch and file path." : (body as any)?.message || `GitHub error ${r.status}`);
  return body as any;
}

export async function fetchCatalog(): Promise<{ catalog: Catalog; sha: string }> {
  const c = await websiteConfig();
  if (!c.repo || !c.token) throw new Error("Connect the website first (repository and key).");
  const f = await gh(c.token, `/repos/${c.repo}/contents/${encodeURI(c.path)}?ref=${encodeURIComponent(c.branch)}`);
  let text = f.content && f.encoding === "base64" ? Buffer.from(f.content, "base64").toString("utf8") : "";
  if (!text) text = Buffer.from((await gh(c.token, `/repos/${c.repo}/git/blobs/${f.sha}`)).content, "base64").toString("utf8");
  const catalog = JSON.parse(text) as Catalog;
  if (!Array.isArray(catalog.products) || !Array.isArray(catalog.categories)) throw new Error("The website file is not a product catalogue.");
  return { catalog, sha: f.sha };
}

export async function commitCatalog(catalog: Catalog, sha: string, message: string) {
  const c = await websiteConfig();
  const content = Buffer.from(JSON.stringify({ ...catalog, v: Date.now() })).toString("base64");
  const r = await gh(c.token, `/repos/${c.repo}/contents/${encodeURI(c.path)}`, { method: "PUT", body: JSON.stringify({ message, content, sha, branch: c.branch }) });
  return String(r?.commit?.sha ?? "");
}

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "item";

export interface ErpProduct { id: number; web_id: string; name: string; brand: string; category: string; description: string; specs: string; price: number; discount_price: number | null; status: string; active: boolean; website_visible: boolean; is_service: boolean; stock: number | null }

/** Builds the new catalogue from the current one plus the ERP products. Returns it with a change list. */
export function buildCatalog(current: Catalog, products: ErpProduct[], showPrices: boolean) {
  const cat: Catalog = JSON.parse(JSON.stringify(current));
  const byId = new Map(cat.products.map((p, i) => [p.id, i]));
  const changes: string[] = [];
  const newLinks: { id: number; web_id: string }[] = [];
  let added = 0, updated = 0;
  const catIndex = (name: string) => {
    const want = (name || "Other").trim();
    let i = cat.categories.findIndex((c) => c.en.toLowerCase() === want.toLowerCase());
    if (i >= 0) return i;
    cat.categories.push({ id: slug(want), en: want, ar: "" });
    i = cat.categories.length - 1;
    let dep = cat.departments.find((d) => d.id === "other");
    if (!dep) { dep = { id: "other", en: "Other", ar: "أخرى", cats: [] }; cat.departments.push(dep); }
    dep.cats.push(i);
    changes.push(`New website category: ${want}`);
    return i;
  };
  const details = (p: ErpProduct) => (p.description.split("\n")[0] || p.specs.split("\n").filter(Boolean).join(" · ")).trim().slice(0, 240);
  for (const p of products) {
    const show = p.active && p.website_visible && p.status === "active";
    const linked = p.web_id && byId.has(p.web_id);
    if (!linked && !show) continue;
    const next: Partial<WebProduct> = { b: p.brand || undefined, n: p.name, d: details(p) || undefined, c: catIndex(p.category) };
    const out = !p.is_service && (p.stock ?? 0) <= 0;
    const price = Number(p.discount_price || p.price) || 0;
    if (linked) {
      const i = byId.get(p.web_id)!;
      const old = cat.products[i];
      const merged: WebProduct = { ...old, n: next.n!, c: next.c! };
      if (next.b) merged.b = next.b; else delete merged.b;
      if (next.d) merged.d = next.d; else if (old.d && !p.description && !p.specs) merged.d = old.d; else delete merged.d;
      if (out) merged.st = old.st === "soon" ? "soon" : "out"; else delete merged.st;
      if (showPrices && price > 0) merged.pr = price; else if (showPrices) delete merged.pr;
      if (show) delete merged.h; else merged.h = 1;
      if (JSON.stringify(old) !== JSON.stringify(merged)) {
        const what: string[] = [];
        if (old.n !== merged.n) what.push("name");
        if ((old.b ?? "") !== (merged.b ?? "")) what.push("brand");
        if ((old.d ?? "") !== (merged.d ?? "")) what.push("details");
        if (old.c !== merged.c) what.push("category");
        if ((old.st ?? "") !== (merged.st ?? "")) what.push(merged.st ? "out of stock" : "back in stock");
        if ((old.pr ?? 0) !== (merged.pr ?? 0)) what.push("price");
        if (!!old.h !== !!merged.h) what.push(merged.h ? "hidden" : "shown");
        changes.push(`Updated ${p.brand ? p.brand + " " : ""}${p.name}: ${what.join(", ")}`);
        cat.products[i] = merged;
        updated++;
      }
    } else {
      let id = slug(`${p.brand}-${p.name}`);
      for (let k = 2; byId.has(id); k++) id = `${slug(`${p.brand}-${p.name}`)}-${k}`;
      const wp: WebProduct = { id, c: next.c!, n: next.n! };
      if (next.b) wp.b = next.b;
      if (next.d) wp.d = next.d;
      if (out) wp.st = "out";
      if (showPrices && price > 0) wp.pr = price;
      cat.products.push(wp);
      byId.set(id, cat.products.length - 1);
      newLinks.push({ id: p.id, web_id: id });
      changes.push(`Added ${p.brand ? p.brand + " " : ""}${p.name}`);
      added++;
    }
  }
  return { catalog: cat, changes, newLinks, added, updated };
}
