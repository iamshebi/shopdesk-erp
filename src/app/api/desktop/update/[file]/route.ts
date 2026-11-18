export const dynamic = "force-dynamic";

/**
 * Update feed for the Windows app (electron-updater "generic" provider points here).
 *   /api/desktop/update/latest.yml           -> version info of the newest GitHub release
 *   /api/desktop/update/ShopDesk-Setup-x.exe -> redirect to a short-lived download link
 * The installers live as release assets in the private GitHub repo; the read-only token stays on the server
 * (Vercel env GITHUB_RELEASES_TOKEN), so the app itself carries no GitHub password.
 */
const REPO = process.env.GITHUB_RELEASES_REPO || "iamshebi/shopdesk-erp";

type Asset = { name: string; url: string };
let cache: { at: number; assets: Asset[] } | null = null;

async function latestAssets(token: string): Promise<Asset[]> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.assets;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "shopdesk-updates" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const rel = await res.json();
  const assets: Asset[] = (rel.assets || []).map((a: any) => ({ name: a.name, url: a.url }));
  cache = { at: Date.now(), assets };
  return assets;
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const token = process.env.GITHUB_RELEASES_TOKEN;
  if (!token) return new Response("Updates are not set up yet", { status: 503 });
  const { file } = await params;
  const name = decodeURIComponent(file);
  let assets: Asset[];
  try {
    assets = await latestAssets(token);
  } catch (e) {
    return new Response(`Update server unavailable (${(e as Error).message})`, { status: 502 });
  }
  // electron-builder names the file with dashes; GitHub may have replaced spaces with dots.
  const asset = assets.find((a) => a.name === name) || assets.find((a) => a.name.replace(/[ .]/g, "-") === name.replace(/[ .]/g, "-"));
  if (!asset) return new Response("Not found", { status: 404 });
  const res = await fetch(asset.url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream", "User-Agent": "shopdesk-updates" },
    redirect: "manual",
    cache: "no-store",
  });
  const location = res.headers.get("location");
  if (name.endsWith(".yml")) {
    const body = location ? await (await fetch(location, { cache: "no-store" })).text() : await res.text();
    return new Response(body, { headers: { "Content-Type": "text/yaml; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (!location) return new Response("Download link unavailable", { status: 502 });
  return Response.redirect(location, 302);
}
