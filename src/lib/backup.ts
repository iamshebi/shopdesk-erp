import "server-only";
import { q, tx } from "./db";
import { BACKUP_TABLES } from "./datasets";
import { decryptField } from "./totp";
import { DEFAULT_ROLES } from "./permissions";
import { defaultWarehouseId } from "./inventory";

export async function makeBackup() {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await q(t === "settings" ? "SELECT * FROM settings WHERE key <> 'session_secret'" : `SELECT * FROM ${t} ORDER BY 1`);
  }
  return { app: "shopdesk", version: 1, created_at: new Date().toISOString(), tables };
}

export async function restoreBackup(data: any) {
  if (data?.app !== "shopdesk" || !data.tables) throw new Error("This is not a ShopDesk backup file");
  await tx(async (t) => {
    const [secret] = await t<{ value: string }>("SELECT value FROM settings WHERE key='session_secret'");
    await t(`TRUNCATE ${BACKUP_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    for (const table of BACKUP_TABLES) {
      const rows: Record<string, unknown>[] = data.tables[table] ?? [];
      for (const r of rows) {
        const cols = Object.keys(r);
        if (!cols.length) continue;
        await t(`INSERT INTO ${table} (${cols.map((c) => `"${c.replace(/"/g, "")}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => r[c]));
      }
      if (!["settings", "counters"].includes(table)) {
        await t(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT max(id) FROM ${table}), 1), (SELECT max(id) FROM ${table}) IS NOT NULL)`);
      }
    }
    if (secret) await t("INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [secret.value]);
  });
  // Backups made before warehouses existed: put all stock in the main warehouse.
  await tx(async (t) => {
    const wh = await defaultWarehouseId(t);
    const [has] = await t<{ n: number }>("SELECT count(*)::int n FROM product_stock");
    if (!has.n) {
      await t("INSERT INTO product_stock (product_id, warehouse_id, qty) SELECT id, $1, stock_qty FROM products WHERE NOT track_serial AND NOT is_service AND stock_qty <> 0", [wh]);
    }
    await t("UPDATE units SET warehouse_id=$1 WHERE warehouse_id IS NULL", [wh]);
  });
  // Two-step secrets are encrypted with this installation's key. If the backup came from another
  // installation they can't be read here, so switch two-step off for those users (they set it up again).
  const users = await q<{ id: number; totp_secret: string }>("SELECT id, totp_secret FROM users WHERE totp_secret <> ''");
  for (const u of users) {
    try {
      await decryptField(u.totp_secret);
    } catch {
      await q("UPDATE users SET totp_enabled=FALSE, totp_secret='' WHERE id=$1", [u.id]);
    }
  }
}

/** Factory reset: deletes every record and setting so the setup screen appears again. Keeps the signing key. */
export async function resetAllData() {
  await tx(async (t) => {
    await t(`TRUNCATE ${[...BACKUP_TABLES.filter((x) => x !== "settings"), "sessions"].join(", ")} RESTART IDENTITY CASCADE`);
    await t("DELETE FROM settings WHERE key NOT IN ('session_secret', 'factory_reset_done')");
    // Put the standard roles back so the new owner account gets the Owner role.
    for (const r of DEFAULT_ROLES) {
      await t("INSERT INTO roles (name, permissions, locked) VALUES ($1, $2, $3)", [r.name, JSON.stringify(r.perms), !!r.locked]);
    }
  });
}

let resetChecked = false;

/**
 * One-time reset switched on from the hosting side: set SHOPDESK_FACTORY_RESET to a new value and deploy.
 * Runs once per value (remembered in settings), keeps a snapshot of the old data in reset_snapshots first.
 */
export async function maybeFactoryReset() {
  const token = process.env.SHOPDESK_FACTORY_RESET;
  if (!token || resetChecked) return;
  resetChecked = true;
  await q("CREATE TABLE IF NOT EXISTS reset_snapshots (id SERIAL PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const claimed = await q<{ key: string }>(
    `INSERT INTO settings (key, value) VALUES ('factory_reset_done', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE settings.value <> EXCLUDED.value RETURNING key`,
    [token],
  );
  if (!claimed.length) return; // already done for this value
  await q("INSERT INTO reset_snapshots (token, data) VALUES ($1, $2)", [token, JSON.stringify(await makeBackup())]);
  await resetAllData();
  console.warn(`Factory reset done (switch value ${token.slice(0, 4)}…); old data kept in reset_snapshots`);
}
