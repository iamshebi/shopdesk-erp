"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { encryptField } from "@/lib/totp";
import { log } from "@/lib/activity";
import { STOCK_SQL } from "@/lib/stock";
import { moveQty } from "@/lib/inventory";
import { fetchCatalog, commitCatalog, buildCatalog, websiteConfig, type ErpProduct } from "@/lib/website";
import { str } from "@/lib/util";

function back(msg: string, kind: "ok" | "err" = "ok", extra = ""): never {
  redirect(`/website?${kind}=${encodeURIComponent(msg)}${extra}`);
}

export async function saveConnection(fd: FormData) {
  const user = await requireUser("website");
  const repo = str(fd, "website_repo").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) back("Repository should look like owner/name, e.g. iamshebi/zaitoon-mobiles", "err");
  const token = str(fd, "token");
  await saveSettings({
    website_repo: repo, website_branch: str(fd, "website_branch") || "main", website_path: str(fd, "website_path") || "catalog.json",
    website_url: str(fd, "website_url"), website_show_prices: fd.get("website_show_prices") === "on",
    ...(token ? { website_token_enc: await encryptField(token) } : {}),
    ...(fd.get("forget") === "on" ? { website_token_enc: "" } : {}),
  });
  await log(user.id, "Website connection saved", repo, "/website");
  back("Connection saved. Use Check connection to test it.");
}

export async function testConnection() {
  await requireUser("website");
  try {
    const { catalog } = await fetchCatalog();
    back(`Connected. The website has ${catalog.products.length} products in ${catalog.categories.length} categories.`);
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    back(e?.message || "Could not reach the website", "err");
  }
}

async function erpProducts(): Promise<ErpProduct[]> {
  return q<ErpProduct>(
    `SELECT p.id, p.web_id, p.name, p.brand, p.category, p.description, p.specs, p.price, p.discount_price, p.status, p.active, p.website_visible, p.is_service, ${STOCK_SQL} AS stock
     FROM products p ORDER BY p.id`,
  );
}

/** Brings the website's products into the ERP (only ones not linked yet). Nothing on the website changes. */
export async function importFromWebsite() {
  const user = await requireUser(["website"]);
  let added = 0, linked = 0;
  try {
    const { catalog } = await fetchCatalog();
    const c = await websiteConfig();
    await tx(async (t) => {
      for (const w of catalog.products) {
        if ((await t("SELECT 1 FROM products WHERE web_id=$1", [w.id])).length) continue;
        const cat = catalog.categories[w.c]?.en ?? "";
        const name = String(w.n);
        const brand = String(w.b ?? "");
        const existing = await t<{ id: number }>("SELECT id FROM products WHERE web_id='' AND lower(name)=lower($1) AND lower(brand)=lower($2) LIMIT 1", [name, brand]);
        if (existing[0]) { await t("UPDATE products SET web_id=$2 WHERE id=$1", [existing[0].id, w.id]); linked++; continue; }
        const img = w.i ? (c.url ? `${c.url}/${String(w.i).replace(/^\//, "")}` : String(w.i)) : "";
        const [p] = await t<{ id: number }>(
          `INSERT INTO products (name, brand, category, description, price, web_id, image_url, website_visible, status, tags, sku)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','from website','') RETURNING id`,
          [name, brand, cat, String(w.d ?? ""), Number(w.pr) || 0, w.id, img, !w.h],
        );
        await t("UPDATE products SET sku=$2 WHERE id=$1", [p.id, `P${String(p.id).padStart(5, "0")}`]);
        await t("INSERT INTO product_history (product_id, user_id, field, new_value, source) VALUES ($1,$2,'Created',$3,'website')", [p.id, user.id, `Imported from website (${w.id})`]);
        void moveQty;
        added++;
      }
    });
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    back(e?.message || "Import failed. Nothing was changed.", "err");
  }
  await log(user.id, "Products imported from website", `${added} added, ${linked} linked`, "/products");
  revalidatePath("/products");
  back(`Imported ${added} product(s) from the website and linked ${linked} existing one(s). Prices and stock: set them in the ERP.`);
}

export async function publishToWebsite(fd: FormData) {
  const user = await requireUser("website");
  const expected = str(fd, "sha");
  let summary = "", added = 0, updated = 0, commit = "";
  try {
    const { catalog, sha } = await fetchCatalog();
    if (expected && sha !== expected) back("The website changed since you opened the preview. Check the new preview and publish again.", "err", "&preview=1");
    const c = await websiteConfig();
    const built = buildCatalog(catalog, await erpProducts(), c.showPrices);
    if (!built.changes.length) back("Nothing to publish. The website already matches the ERP.");
    added = built.added; updated = built.updated;
    summary = `${added} added, ${updated} updated`;
    const lines = built.changes.slice(0, 40).map((l) => `- ${l}`).join("\n");
    commit = await commitCatalog(built.catalog, sha, `Update from ShopDesk ERP by ${user.name}: ${summary}\n\n${lines}${built.changes.length > 40 ? `\n- …and ${built.changes.length - 40} more` : ""}`);
    await tx(async (t) => {
      for (const l of built.newLinks) await t("UPDATE products SET web_id=$2 WHERE id=$1", [l.id, l.web_id]);
      await t("INSERT INTO website_publishes (summary, added, updated, commit_sha, user_id) VALUES ($1,$2,$3,$4,$5)", [built.changes.join("\n").slice(0, 20000), added, updated, commit, user.id]);
    });
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    back(e?.message || "Publish failed. The website was not changed.", "err");
  }
  await log(user.id, "Website published", summary, "/website");
  back(`Published: ${summary}. The website updates in about a minute.`);
}
