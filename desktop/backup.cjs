// Daily automatic backups for the desktop app. Plain Node so it can be tested without Electron.
const fs = require("fs");
const path = require("path");
const http = require("http");

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function fetchBackup(port, key) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/backup", headers: { "x-backup-key": key }, timeout: 120000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Backup failed: HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Backup timed out")));
  });
}

/** Writes backup-YYYY-MM-DD.json (once a day unless force) and keeps the newest `keep` files. Returns the file path. */
async function runBackup({ port, key, dir, keep = 30, force = false }) {
  fs.mkdirSync(dir, { recursive: true });
  const name = force ? `backup-${today()}-${Date.now().toString().slice(-6)}.json` : `backup-${today()}.json`;
  const file = path.join(dir, name);
  if (!force && fs.existsSync(file)) return file;
  const data = await fetchBackup(port, key);
  JSON.parse(data.toString("utf8")); // make sure it's complete before writing
  fs.writeFileSync(file + ".tmp", data);
  fs.renameSync(file + ".tmp", file);
  const files = fs.readdirSync(dir).filter((f) => /^backup-.*\.json$/.test(f)).sort().reverse();
  for (const old of files.slice(keep)) fs.unlinkSync(path.join(dir, old));
  return file;
}

module.exports = { runBackup };
