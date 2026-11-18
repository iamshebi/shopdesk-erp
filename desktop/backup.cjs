// Automatic backups for the desktop app. Plain Node so it can be tested without Electron.
//
// One file per day (backup-YYYY-MM-DD.json). Every automatic backup (on start, every few hours and
// every time the app is closed) replaces today's file with the newest data, so the last file always
// holds everything up to the moment the app was closed. The newest `keep` days are kept.
// A second copy can go into a cloud-synced folder (Google Drive, OneDrive, Dropbox), so a crashed,
// formatted or stolen PC doesn't lose the shop's invoices and IMEI history.
const fs = require("fs");
const path = require("path");
const os = require("os");
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

function writeAtomic(file, data) {
  fs.writeFileSync(file + ".tmp", data);
  fs.renameSync(file + ".tmp", file);
}

function prune(dir, keep) {
  const files = fs.readdirSync(dir).filter((f) => /^backup-.*\.json$/.test(f)).sort().reverse();
  for (const old of files.slice(keep)) {
    try { fs.unlinkSync(path.join(dir, old)); } catch {}
  }
}

function samePlace(a, b) {
  if (!a || !b) return false;
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Saves a backup. `force` (the "Back up now" menu) makes an extra file with the time in its name;
 * otherwise today's file is replaced with the newest data.
 * Returns { file, mirrorFile, mirrorError }. The local copy must succeed; the cloud copy is best effort.
 */
async function runBackup({ port, key, dir, mirrorDir = "", keep = 30, force = false, fetcher }) {
  fs.mkdirSync(dir, { recursive: true });
  const name = force ? `backup-${today()}-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.json` : `backup-${today()}.json`;
  const data = fetcher ? await fetcher() : await fetchBackup(port, key);
  JSON.parse(data.toString("utf8")); // make sure it's complete before writing
  const file = path.join(dir, name);
  writeAtomic(file, data);
  prune(dir, keep);

  let mirrorFile = "", mirrorError = "";
  if (mirrorDir && !samePlace(mirrorDir, dir)) {
    try {
      fs.mkdirSync(mirrorDir, { recursive: true });
      mirrorFile = path.join(mirrorDir, name);
      writeAtomic(mirrorFile, data);
      prune(mirrorDir, keep);
    } catch (e) {
      mirrorFile = "";
      mirrorError = String(e && e.message ? e.message : e);
    }
  }
  return { file, mirrorFile, mirrorError };
}

/** Cloud-synced folders found on this PC, best first: [{ name, dir }]. */
function findCloudFolders(home = os.homedir(), env = process.env) {
  const found = [];
  const add = (name, dir) => {
    try {
      if (dir && fs.statSync(dir).isDirectory() && !found.some((f) => samePlace(f.dir, dir))) found.push({ name, dir });
    } catch {}
  };
  // Google Drive for desktop shows up as a drive letter (usually G:) with "My Drive" inside.
  if (process.platform === "win32") {
    for (const letter of "GHIJKLMNOPQRSTUVWXYZ") add("Google Drive", `${letter}:\\My Drive`);
  }
  add("Google Drive", path.join(home, "My Drive"));
  add("Google Drive", path.join(home, "Google Drive", "My Drive"));
  add("Google Drive", path.join(home, "Google Drive"));
  add("OneDrive", env.OneDriveConsumer);
  add("OneDrive", env.OneDriveCommercial);
  add("OneDrive", env.OneDrive);
  add("OneDrive", path.join(home, "OneDrive"));
  add("Dropbox", path.join(home, "Dropbox"));
  return found;
}

/** True when `dir` sits inside one of the cloud folders (e.g. Documents already synced by OneDrive). */
function insideCloud(dir, clouds) {
  const d = path.resolve(dir).toLowerCase() + path.sep;
  return clouds.some((c) => d.startsWith(path.resolve(c.dir).toLowerCase() + path.sep));
}

module.exports = { runBackup, findCloudFolders, insideCloud, today };
