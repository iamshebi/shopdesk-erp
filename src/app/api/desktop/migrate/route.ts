import { gunzipSync } from "node:zlib";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { log } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Moves the data of an offline (PC) installation into this online system. Sent by the Windows app.
 * Body: gzip-compressed ShopDesk backup JSON.
 *  - Online system not set up yet (no users): accepted, like the setup screen.
 *  - Already set up: only the signed-in owner, and only with "x-replace: yes" (the app asks first).
 * Staff keep their usernames and passwords, because the users table moves with the data.
 */
export async function POST(req: Request) {
  const [{ n }] = await q<{ n: number }>("SELECT count(*)::int n FROM users");
  let byUser: number | null = null;
  if (n > 0) {
    const me = await getUser();
    if (!me || !me.perms.includes("*")) return Response.json({ error: "needs_owner" }, { status: 409 });
    if (req.headers.get("x-replace") !== "yes") return Response.json({ error: "has_data" }, { status: 409 });
    byUser = me.id;
  }
  let data: any;
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    data = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8"));
  } catch {
    return Response.json({ error: "bad_file" }, { status: 400 });
  }
  if (data?.app !== "shopdesk" || !data.tables?.users?.length) return Response.json({ error: "bad_file" }, { status: 400 });
  try {
    await restoreBackup(data);
  } catch (e) {
    console.error("migrate failed", e);
    return Response.json({ error: "restore_failed", detail: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
  const [owner] = await q<{ id: number }>("SELECT id FROM users ORDER BY id LIMIT 1");
  await log(byUser ?? owner?.id ?? null, "Offline data moved online", `${data.tables.sales?.length ?? 0} sales, ${data.tables.products?.length ?? 0} products`, "/settings/data").catch(() => {});
  return Response.json({ ok: true, counts: { sales: data.tables.sales?.length ?? 0, products: data.tables.products?.length ?? 0, customers: data.tables.customers?.length ?? 0, users: data.tables.users.length } });
}
