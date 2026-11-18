// Reads the database of the offline (PC) version and writes it as a normal ShopDesk backup file.
// Run as a separate Node process (the desktop app starts it with ELECTRON_RUN_AS_NODE=1):
//   node migrate-dump.cjs <offline data folder> <output .json>
// Works on a copy of the folder, so the original offline data is never changed.
const fs = require("fs");
const os = require("os");
const path = require("path");

async function dump(dataDir, outFile) {
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) throw new Error("No offline database in " + dataDir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shopdesk-move-"));
  const copy = path.join(tmp, "db");
  fs.cpSync(dataDir, copy, { recursive: true });
  // A copy of a database that was open when the PC was switched off may hold a stale lock file.
  for (const f of ["postmaster.pid"]) fs.rmSync(path.join(copy, f), { force: true });
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite(copy);
  try {
    const names = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).rows.map((r) => r.table_name);
    const skip = new Set(["sessions", "reset_snapshots"]);
    const tables = {};
    for (const t of names) {
      if (skip.has(t)) continue;
      const sql =
        t === "settings" ? "SELECT * FROM settings WHERE key NOT IN ('session_secret','factory_reset_done')"
        : t === "files" ? "SELECT id, kind, owner_id, name, mime, size, encode(data,'base64') AS data_b64, sort, uploaded_by, created_at FROM files ORDER BY 1"
        : `SELECT * FROM "${t}" ORDER BY 1`;
      const rows = (await db.query(sql)).rows;
      // bytea columns other than files.data come back as Uint8Array; keep them as base64-free plain text only when possible.
      tables[t] = rows.map((r) => {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? Buffer.from(v).toString("utf8") : v;
        return o;
      });
    }
    const backup = { app: "shopdesk", version: 1, created_at: new Date().toISOString(), source: "offline-pc", tables };
    fs.writeFileSync(outFile + ".tmp", JSON.stringify(backup));
    fs.renameSync(outFile + ".tmp", outFile);
    const count = (t) => (tables[t] ? tables[t].length : 0);
    const shop = (tables.settings || []).find((s) => s.key === "shop_name");
    return {
      shopName: shop ? shop.value : "",
      sales: (tables.sales || []).filter((s) => s.type !== "credit_note").length,
      products: count("products"), customers: count("customers"), repairs: count("repairs"), users: count("users"),
    };
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { dump };

if (require.main === module) {
  const [dataDir, outFile] = process.argv.slice(2);
  dump(dataDir, outFile).then(
    (summary) => { process.stdout.write(JSON.stringify({ ok: true, summary }) + "\n"); process.exit(0); },
    (e) => { process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }) + "\n"); process.exit(1); },
  );
}
