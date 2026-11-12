import "server-only";
import { q, tx } from "./db";
import { BACKUP_TABLES } from "./datasets";

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
}
