// Windows desktop shell: runs the ShopDesk server on this computer and shows it in a window.
// Data lives in %APPDATA%\<Product>\data. Other devices on the shop Wi-Fi can open http://<this-PC-IP>:<port>.
const { app, BrowserWindow, Menu, dialog, shell, nativeTheme, ipcMain, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { runBackup, findCloudFolders, insideCloud } = require("./backup.cjs");
const license = require("./license.cjs");

const brand = JSON.parse(fs.readFileSync(path.join(__dirname, "brand.json"), "utf8"));
const PORT = Number(brand.port || 4300);
// Online mode: the app opens the shop's live website (cloud database), so the owner sees the same data,
// reports and logs from any browser. Offline mode: runs its own server and database on this PC.
const ONLINE = brand.mode === "online" && /^https?:\/\//.test(String(brand.url || ""));
const BASE = ONLINE ? new URL(brand.url).origin : `http://127.0.0.1:${PORT}`;
const PRELOAD = path.join(__dirname, "preload.cjs");
const LICENSE_ON = brand.license !== false;

// Never show raw "JavaScript error in the main process" boxes to shop staff: log it and carry on.
process.on("uncaughtException", (e) => { try { fs.appendFileSync(path.join(app.getPath("userData"), "server.log"), `${new Date().toISOString()} ERROR ${e && e.stack ? e.stack : e}\n`); } catch {} });
process.on("unhandledRejection", (e) => { try { fs.appendFileSync(path.join(app.getPath("userData"), "server.log"), `${new Date().toISOString()} ERROR (promise) ${e && e.stack ? e.stack : e}\n`); } catch {} });

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setName(brand.productName);
if (process.platform === "win32") app.setAppUserModelId(brand.appId);
nativeTheme.themeSource = "light";

const userData = app.getPath("userData");
const dataDir = path.join(userData, "data");
const backupDir = path.join(app.getPath("documents"), `${brand.productName} Backups`);
const logFile = path.join(userData, "server.log");
const licenseFile = path.join(userData, "license.json");
const prefsFile = path.join(userData, "desktop-prefs.json");
let server = null;
let win = null;
let quitting = false;

// ---------- small saved preferences (cloud backup folder, printers, last backup) ----------
function readPrefs() {
  try {
    return { printers: {}, ...JSON.parse(fs.readFileSync(prefsFile, "utf8")) };
  } catch {
    return { printers: {} };
  }
}
function savePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(prefsFile, JSON.stringify(next, null, 2));
  return next;
}
function log(line) {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`); } catch {}
}

function backupKey() {
  const f = path.join(userData, "backup.key");
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    const k = crypto.randomBytes(24).toString("hex");
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(f, k);
    return k;
  }
}
const KEY = backupKey();

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "desktop-dist", "server");
}

function startServer() {
  fs.mkdirSync(dataDir, { recursive: true });
  const out = fs.createWriteStream(logFile, { flags: "a" });
  out.write(`\n--- start ${new Date().toISOString()} ---\n`);
  server = spawn(process.execPath, [path.join(serverDir(), "server.js")], {
    cwd: serverDir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
      PGLITE_DIR: dataDir,
      SHOPDESK_DESKTOP: "1",
      BACKUP_KEY: KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.pipe(out);
  server.stderr.pipe(out);
  server.on("exit", (code) => {
    out.write(`--- server exited ${code} ---\n`);
    if (!quitting) {
      dialog.showErrorBox(brand.productName, `The ${brand.productName} engine stopped unexpectedly. Please restart the app.\n\nLog: ${logFile}`);
      app.quit();
    }
  });
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/login`, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
}

// ---------- licence ----------
function supportText() {
  return [brand.supportName, brand.supportPhone].filter(Boolean).join(" · ");
}

/** Shows the activation window until a valid key is entered. Resolves true when activated, false if the user exits. */
function requireActivation() {
  const state = license.checkLicense(licenseFile, brand.appId);
  if (state.valid) return Promise.resolve(true);
  log(`licence: not active (${state.requestCode})`);
  return new Promise((resolve) => {
    let done = false;
    const w = new BrowserWindow({
      width: 600,
      height: 600,
      resizable: false,
      title: `Activate ${brand.productName}`,
      backgroundColor: "#f6f7f9",
      icon: path.join(__dirname, "icon.png"),
      autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
    });
    w.setMenu(null);
    const fromThis = (e) => e.sender === w.webContents;
    ipcMain.handle("sd:license-info", (e) => fromThis(e) && { requestCode: state.requestCode, productName: brand.productName, support: supportText() });
    ipcMain.handle("sd:license-activate", (e, key) => {
      if (!fromThis(e)) return false;
      if (!license.verifyActivationKey(state.requestCode, key)) return false;
      license.saveLicense(licenseFile, String(key));
      log("licence: activated");
      done = true;
      cleanup();
      w.close();
      resolve(true);
      return true;
    });
    ipcMain.handle("sd:license-whatsapp", (e) => {
      if (!fromThis(e)) return;
      const text = `Hello, please send the activation key for ${brand.productName}.\nRequest code: ${state.requestCode}`;
      const phone = String(brand.supportPhone || "").replace(/[^0-9]/g, "");
      shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
    });
    ipcMain.handle("sd:quit", (e) => fromThis(e) && w.close());
    function cleanup() {
      for (const ch of ["sd:license-info", "sd:license-activate", "sd:license-whatsapp", "sd:quit"]) ipcMain.removeHandler(ch);
    }
    w.on("closed", () => {
      if (!done) {
        cleanup();
        resolve(false);
      }
    });
    w.loadFile(path.join(__dirname, "activate.html"));
  });
}

// ---------- backups ----------
// Online: downloads the backup with the signed-in user's session (needs the "data" permission, e.g. the owner).
async function fetchOnlineBackup() {
  const { session } = require("electron");
  // Signed out or no permission: the site redirects to the login page (HTML) instead of sending the file.
  const res = await session.defaultSession.fetch(`${BASE}/api/backup`, { cache: "no-store" });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (res.status !== 200 || !isJson) {
    const err = new Error(res.status === 200 ? "Sign in as the owner to take backups" : `Backup failed: HTTP ${res.status}`);
    err.notSignedIn = res.status === 200 || res.status === 401 || res.status === 403;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function backupNow(force) {
  const prefs = readPrefs();
  try {
    const r = await runBackup({ port: PORT, key: KEY, dir: backupDir, mirrorDir: prefs.cloudBackupDir || "", force, fetcher: ONLINE ? fetchOnlineBackup : undefined });
    savePrefs({ lastBackupAt: new Date().toISOString(), lastBackupFile: r.file, lastMirrorError: r.mirrorError || "" });
    if (r.mirrorError) log(`backup: cloud copy failed: ${r.mirrorError}`);
    if (force) {
      const detail = [r.file, r.mirrorFile && `Cloud copy: ${r.mirrorFile}`, r.mirrorError && `Cloud copy failed: ${r.mirrorError}`].filter(Boolean).join("\n\n");
      const res = await dialog.showMessageBox(win, { message: "Backup saved", detail, buttons: ["OK", "Open folder"] });
      if (res.response === 1) shell.openPath(backupDir);
    }
  } catch (e) {
    log(`backup: failed: ${e && e.message ? e.message : e}`);
    if (force) dialog.showErrorBox("Backup failed", String(e && e.message ? e.message : e));
    else if (e && e.notSignedIn) return; // staff without backup permission: nothing to do
  }
}

function cloudFolderFor(dir) {
  return path.join(dir, `${brand.productName} Backups`);
}

async function chooseCloudFolder() {
  const prefs = readPrefs();
  const clouds = findCloudFolders();
  const buttons = [...clouds.slice(0, 3).map((c) => `Use ${c.name}`), "Choose a folder…"];
  if (prefs.cloudBackupDir) buttons.push("Turn off cloud copy");
  buttons.push("Cancel");
  const r = await dialog.showMessageBox(win, {
    message: "Cloud backup folder",
    detail:
      (prefs.cloudBackupDir ? `Now copying backups to:\n${prefs.cloudBackupDir}\n\n` : "Cloud copy is off.\n\n") +
      "Pick the Google Drive, OneDrive or Dropbox folder on this PC. Each backup is copied there too, so the data is safe even if this PC crashes or is formatted." +
      (clouds.length ? "" : "\n\nNo Google Drive or OneDrive folder was found. Install Google Drive for desktop or sign in to OneDrive, or choose any folder (a USB drive works too)."),
    buttons,
    cancelId: buttons.length - 1,
  });
  const label = buttons[r.response];
  if (label === "Cancel") return;
  if (label === "Turn off cloud copy") {
    savePrefs({ cloudBackupDir: "" });
    return;
  }
  let dir = "";
  if (label === "Choose a folder…") {
    const pick = await dialog.showOpenDialog(win, { title: "Choose backup folder", properties: ["openDirectory", "createDirectory"] });
    if (pick.canceled || !pick.filePaths[0]) return;
    dir = cloudFolderFor(pick.filePaths[0]);
  } else {
    dir = cloudFolderFor(clouds[r.response].dir);
  }
  savePrefs({ cloudBackupDir: dir, askedCloud: true });
  await backupNow(true);
}

/** First run: if Google Drive / OneDrive is on this PC and backups aren't already synced, offer it once. */
async function offerCloudOnce() {
  const prefs = readPrefs();
  if (prefs.askedCloud || prefs.cloudBackupDir) return;
  const clouds = findCloudFolders();
  savePrefs({ askedCloud: true });
  if (!clouds.length || insideCloud(backupDir, clouds)) return;
  const c = clouds[0];
  const r = await dialog.showMessageBox(win, {
    message: `Also keep backups in ${c.name}?`,
    detail: `${brand.productName} saves a backup to ${backupDir} every time you close it.\n\nA copy in ${c.name} keeps your invoices, stock and IMEI history safe if this computer crashes, gets a virus or is formatted.`,
    buttons: [`Yes, use ${c.name}`, "Not now"],
    cancelId: 1,
  });
  if (r.response === 0) {
    savePrefs({ cloudBackupDir: cloudFolderFor(c.dir) });
    backupNow(false);
  }
}

function backupStatus() {
  const p = readPrefs();
  const when = p.lastBackupAt ? new Date(p.lastBackupAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "never";
  const lines = [`Last backup: ${when}`, `Saved to: ${backupDir}`, `Cloud copy: ${p.cloudBackupDir || "off"}`];
  if (p.lastMirrorError) lines.push(`Last cloud copy failed: ${p.lastMirrorError}`);
  lines.push("", "A backup is made when the app starts, every 3 hours, and every time it closes. The last 30 days are kept.");
  lines.push("To restore: Settings → Import, export & backup → Restore, and pick a backup file.");
  dialog.showMessageBox(win, { message: "Backups", detail: lines.join("\n"), buttons: ["OK", "Open folder"] }).then((r) => r.response === 1 && shell.openPath(backupDir));
}

// ---------- printing ----------
// Per job type: which printer, and print with no margins/headers. With no printer chosen, Windows asks.
// size: label "50x25" (mm), or receipt paper width "80" / "58". receiptMm: measured receipt length.
function printOptions(kind, size, receiptMm) {
  const device = (readPrefs().printers || {})[kind] || "";
  const opts = { silent: !!device, printBackground: true, header: "", footer: "", margins: { marginType: kind === "a4" ? "default" : "none" } };
  if (device) opts.deviceName = device;
  const m = /^(\d{2,3})x(\d{2,3})$/.exec(String(size || ""));
  if (kind === "label" && m) opts.pageSize = { width: Number(m[1]) * 1000, height: Number(m[2]) * 1000 };
  // Receipts (File → Printer setup → Receipt length):
  //  "auto"   page as long as the receipt plus room for the cutter, so the roll isn't wasted;
  //  "long"   a 297 mm page, for drivers that stop early with a custom length (the driver cuts after the content);
  //  "driver" no page size at all: the printer driver's own paper setting decides.
  // A measurement that looks wrong (less than 6 cm) falls back to the long page, so a receipt is never cut short.
  if (kind === "receipt") {
    const width = String(size) === "58" ? 58 : 80;
    const mode = readPrefs().receiptLength || "auto";
    if (mode === "long" || (mode === "auto" && !(receiptMm >= 60))) opts.pageSize = { width: width * 1000, height: 297000 };
    else if (mode === "auto") opts.pageSize = { width: width * 1000, height: Math.round(Math.min(3000, receiptMm + 12) * 1000) };
  }
  return opts;
}
async function measureReceiptMm(wc) {
  try {
    const px = await wc.executeJavaScript(
      `(() => {
        const el = document.querySelector('[data-receipt]');
        if (!el) return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const r = el.getBoundingClientRect();
        return Math.max(r.height, el.scrollHeight, r.bottom + window.scrollY);
      })()`,
    );
    return (Number(px) || 0) * 25.4 / 96 / (wc.getZoomFactor() || 1);
  } catch {
    return 0;
  }
}
async function printContents(wc, kind, size) {
  const receiptMm = kind === "receipt" ? await measureReceiptMm(wc) : 0;
  if (kind === "receipt") log(`print receipt: measured ${receiptMm.toFixed(1)} mm, length setting ${readPrefs().receiptLength || "auto"}`);
  return new Promise((resolve) => {
    wc.print(printOptions(kind, size, receiptMm), (ok, reason) => {
      if (!ok && reason && reason !== "cancelled") log(`print ${kind} failed: ${reason}`);
      resolve({ ok, reason: reason || "" });
    });
  });
}

ipcMain.handle("sd:print", (e, { kind, size } = {}) => {
  if (!e.sender.getURL().startsWith(BASE)) return { ok: false, reason: "not allowed" };
  const k = ["receipt", "label", "a4"].includes(kind) ? kind : "a4";
  if (k === "label" && /^\d{2,3}x\d{2,3}$/.test(String(size || ""))) savePrefs({ labelSize: size });
  if (k === "receipt" && ["80", "58"].includes(String(size))) savePrefs({ receiptWidth: String(size) });
  return printContents(e.sender, k, size);
});
// Prints a page of the app in the background (e.g. the receipt right after a sale), without opening a window.
ipcMain.handle("sd:print-url", async (e, { path: p, kind, size } = {}) => {
  if (!e.sender.getURL().startsWith(BASE)) return { ok: false, reason: "not allowed" };
  if (typeof p !== "string" || !/^\/print\/[\w\-/]+(\?[\w=&%.-]*)?$/.test(p)) return { ok: false, reason: "bad page" };
  const k = ["receipt", "label", "a4"].includes(kind) ? kind : "a4";
  const t = new BrowserWindow({ show: false, width: 420, height: 1200, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await t.loadURL(BASE + p);
    await t.webContents.executeJavaScript("document.fonts ? document.fonts.ready.then(() => 1) : 1");
    await new Promise((r) => setTimeout(r, 300));
    return await printContents(t.webContents, k, size);
  } catch (err) {
    log(`print-url failed: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: "failed" };
  } finally {
    t.destroy();
  }
});
ipcMain.handle("sd:copy", (_e, text) => clipboard.writeText(String(text || "")));

let printersWin = null;
function openPrinterSetup() {
  if (printersWin) return printersWin.focus();
  printersWin = new BrowserWindow({
    width: 560, height: 760, parent: win || undefined, title: "Printer setup", autoHideMenuBar: true, backgroundColor: "#f6f7f9",
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  printersWin.setMenu(null);
  printersWin.on("closed", () => (printersWin = null));
  printersWin.loadFile(path.join(__dirname, "printers.html"));
}
const fromPrinters = (e) => printersWin && e.sender === printersWin.webContents;
ipcMain.handle("sd:printers-list", async (e) => {
  if (!fromPrinters(e)) return null;
  const printers = await e.sender.getPrintersAsync();
  return { printers: printers.map((p) => ({ name: p.name })), prefs: readPrefs().printers || {}, receiptLength: readPrefs().receiptLength || "auto" };
});
ipcMain.handle("sd:printers-save", (e, p) => {
  if (!fromPrinters(e)) return;
  const clean = {};
  for (const k of ["receipt", "label", "a4"]) clean[k] = typeof p?.[k] === "string" ? p[k] : "";
  savePrefs({ printers: clean, receiptLength: ["auto", "long", "driver"].includes(p?.receiptLength) ? p.receiptLength : "auto" });
});
ipcMain.handle("sd:printers-test", async (e, kind) => {
  if (!fromPrinters(e)) return { ok: false };
  const prefs = readPrefs();
  const narrow = kind === "receipt";
  const w58 = prefs.receiptWidth === "58";
  const body = kind === "label"
    ? `<div style="font:bold 14px Arial;padding:2mm">${brand.productName}<br><span style="font-size:11px">Label printer test</span></div>`
    : `<div data-receipt style="font:12px monospace;${narrow ? `width:${w58 ? 48 : 72}mm;margin:0 auto;` : ""}padding:3mm 0"><b>${brand.productName}</b><br>Printer test<br>${new Date().toLocaleString("en-GB")}<br>${"-".repeat(narrow ? (w58 ? 24 : 36) : 60)}<br>` +
      (narrow ? Array.from({ length: 20 }, (_, i) => `Line ${i + 1} of 20`).join("<br>") + `<br>${"-".repeat(w58 ? 24 : 36)}<br>` : "") +
      `If all 20 lines print and nothing is cut, the printer is ready.<br>END</div>`;
  const t = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await t.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0">${body}</body></html>`));
  const r = await printContents(t.webContents, kind, kind === "label" ? prefs.labelSize || "50x25" : kind === "receipt" ? prefs.receiptWidth || "80" : "");
  t.destroy();
  return r;
});

// ---------- window and menu ----------
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Back up now", click: () => backupNow(true) },
        { label: "Cloud backup folder…", click: chooseCloudFolder },
        { label: "Backup status", click: backupStatus },
        { label: "Open backups folder", click: () => { fs.mkdirSync(backupDir, { recursive: true }); shell.openPath(backupDir); } },
        { type: "separator" },
        { label: "Printer setup…", click: openPrinterSetup },
        ...(ONLINE ? [{ type: "separator" }, { label: "Offline till", click: () => enterOffline("opened from menu") }, { label: "Offline sales…", click: showOfflineSales }, { label: "Move offline data online…", click: () => moveOfflineDataOnline(true) }] : []),
        { type: "separator" },
        {
          label: "Use on other devices…",
          click: () => {
            const urls = ONLINE ? [BASE] : lanAddresses();
            dialog.showMessageBox(win, {
              message: "Open on other computers, tablets or phones",
              detail: urls.length
                ? ONLINE
                  ? `Open this address on any computer, tablet or phone (Chrome → ⋮ → Add to Home screen):\n\n${BASE}\n\nEverything is live: same sales, stock, reports and logs everywhere.`
                  : `Connect the device to the same shop Wi-Fi, then open this address in its browser:\n\n${urls.join("\n")}\n\nThis computer must stay on with ${brand.productName} open.`
                : "This computer isn't connected to a network.",
            });
          },
        },
        { type: "separator" },
        { role: "quit", label: `Exit ${brand.productName}` },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "View",
      submenu: [{ role: "reload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: `About ${brand.productName}`,
          click: () =>
            dialog.showMessageBox(win, {
              message: `${brand.productName} ${app.getVersion()}`,
              detail: [
                brand.supportName && `Support: ${brand.supportName}`,
                brand.supportPhone,
                brand.supportWebsite,
                LICENSE_ON && `\nLicence: activated on this computer (${license.getRequestCode(brand.appId)})`,
                ONLINE ? `\nOnline: ${BASE}` : `\nData folder: ${dataDir}`,
              ].filter(Boolean).join("\n"),
            }),
        },
        { label: "Check for updates…", click: checkForUpdatesNow },
        { type: "separator" },
        { label: "Show data folder", click: () => shell.openPath(dataDir) },
        { label: "Show engine log", click: () => shell.openPath(logFile) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const webPreferences = { preload: PRELOAD, contextIsolation: true, sandbox: true };
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: brand.productName,
    backgroundColor: "#f6f7f9",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    webPreferences,
  });
  if (ONLINE) watchConnection();
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  // Print pages and receipts open in their own window (with the print bridge); anything outside the app opens in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 900, height: 1000, autoHideMenuBar: true, title: brand.productName, webPreferences } };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(BASE)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences } };
      shell.openExternal(url);
      return { action: "deny" };
    });
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(BASE)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  // Downloads (Excel exports, backups) go to the Downloads folder and open the folder.
  win.webContents.session.on("will-download", (_e, item) => {
    item.once("done", (_ev, state) => {
      if (state === "completed") shell.showItemInFolder(item.getSavePath());
    });
  });
  showScreen("connecting", ONLINE ? "Connecting to your shop…" : "Starting…");
}

// ---------- moving offline data online ----------
// Earlier versions kept the shop's data on this PC (%APPDATA%\<Product>\data). The online version offers once
// to upload it, so invoices, stock, IMEIs, customers and staff logins carry over. The PC copy is never deleted.
const zlib = require("zlib");

function hasOfflineData() {
  return fs.existsSync(path.join(dataDir, "PG_VERSION"));
}

function dumpOfflineData(outFile) {
  return new Promise((resolve, reject) => {
    // Inside the installed app this file sits in the app.asar archive, which can't be a working folder and
    // can't be run from directly: use the unpacked copy (see asarUnpack) and the user-data folder.
    const script = path.join(__dirname, "migrate-dump.cjs").replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    const child = spawn(process.execPath, [script, dataDir, outFile], {
      cwd: userData,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "", err = "";
    child.on("error", (e) => reject(new Error(`Could not start the reader: ${e.message}`)));
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", () => {
      try {
        const r = JSON.parse(out.trim().split("\n").pop());
        if (r.ok) return resolve(r.summary);
        reject(new Error(r.error));
      } catch {
        reject(new Error(err.trim().split("\n").pop() || "Could not read the offline data"));
      }
    });
  });
}

async function uploadOfflineData(file, replace) {
  const { session } = require("electron");
  const body = zlib.gzipSync(fs.readFileSync(file));
  const res = await session.defaultSession.fetch(`${BASE}/api/desktop/migrate`, {
    method: "POST",
    headers: { "content-type": "application/gzip", ...(replace ? { "x-replace": "yes" } : {}) },
    body,
  });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, ...json };
}

async function moveOfflineDataOnline(manual) {
  if (!hasOfflineData()) {
    if (manual) dialog.showMessageBox(win, { message: "No offline data on this computer", detail: `Nothing found in ${dataDir}.` });
    return;
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `offline-data-${stamp}.json`);
  let summary;
  try {
    summary = await dumpOfflineData(file);
  } catch (e) {
    log(`move online: read failed: ${e.message}`);
    dialog.showErrorBox("Couldn't read the offline data", `${e.message}\n\nThe data on this PC was not changed. Please contact support.`);
    return;
  }
  log(`move online: saved ${file} ${JSON.stringify(summary)}`);
  const what = `${summary.sales} invoices, ${summary.products} products, ${summary.customers} customers, ${summary.repairs} repair jobs and ${summary.users} staff logins`;
  const ask = await dialog.showMessageBox(win, {
    type: "question",
    message: `Move ${summary.shopName || "this shop"}'s data online?`,
    detail:
      `This computer has data from the offline version: ${what}.\n\n` +
      `It will be uploaded to ${BASE}. Everyone signs in with the same usernames and passwords as before, and the owner can see everything from any phone or computer.\n\n` +
      `A copy was saved first: ${file}`,
    buttons: ["Move it online now", "Not now"],
    defaultId: 0,
    cancelId: 1,
  });
  if (ask.response !== 0) {
    if (!manual) savePrefs({ moveAskedAt: new Date().toISOString() });
    return;
  }
  let r;
  try {
    r = await uploadOfflineData(file, false);
    if (r.status === 409 && r.error === "needs_owner") {
      await dialog.showMessageBox(win, {
        message: "The online system is already set up",
        detail: "Sign in as the owner first, then choose File → Move offline data online… again. Moving will replace what is online with this computer's data.",
      });
      return;
    }
    if (r.status === 409 && r.error === "has_data") {
      const c = await dialog.showMessageBox(win, {
        type: "warning",
        message: "Replace the online data?",
        detail: `The online system already has data. Moving will REPLACE it with this computer's data (${what}).\n\nOnly do this if the online data is a test or not needed.`,
        buttons: ["Replace online data", "Cancel"],
        defaultId: 1,
        cancelId: 1,
      });
      if (c.response !== 0) return;
      r = await uploadOfflineData(file, true);
    }
  } catch (e) {
    r = { status: 0, error: e.message };
  }
  if (!r.ok) {
    log(`move online: upload failed ${r.status} ${r.error} ${r.detail || ""}`);
    const big = r.status === 413 ? "\n\nThe data is too large to send in one go. Please contact support." : "";
    dialog.showErrorBox("Couldn't move the data", `${r.error || "Upload failed"} (${r.status || "no connection"})${big}\n\nNothing on this computer was changed. Your copy: ${file}`);
    return;
  }
  savePrefs({ movedOnlineAt: new Date().toISOString(), movedFile: file });
  log("move online: done");
  await dialog.showMessageBox(win, {
    message: "Done: your data is online",
    detail: `Moved ${what}.\n\nSign in with your usual username and password. The owner can now open ${BASE} on any phone or computer to see sales, stock and reports.`,
  });
  win.loadURL(BASE + "/login");
}

// ---------- updates ----------
// The app checks the website for a newer version, downloads it in the background and asks to restart.
let updater = null;
let updateReady = false;
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    updater = require("electron-updater").autoUpdater;
  } catch (e) {
    log(`updates: not available: ${e.message}`);
    return;
  }
  const feed = brand.updateUrl || (ONLINE ? `${BASE}/api/desktop/update` : "");
  if (!feed) return;
  updater.setFeedURL({ provider: "generic", url: feed });
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: (m) => log(`updates: ${m}`), warn: (m) => log(`updates: ${m}`), error: (m) => log(`updates: ${m}`), debug: () => {} };
  updater.on("update-downloaded", async (info) => {
    updateReady = true;
    const r = await dialog.showMessageBox(win, {
      message: `${brand.productName} ${info.version} is ready`,
      detail: "Restart now to finish updating? It takes a few seconds. Your data is online and stays as it is.\n\nIf you choose Later, it updates the next time the app is closed.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) {
      quitting = true;
      setImmediate(() => updater.quitAndInstall(false, true));
    }
  });
  const check = () => updater.checkForUpdates().catch((e) => log(`updates: check failed: ${e.message}`));
  setTimeout(check, 30 * 1000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

async function checkForUpdatesNow() {
  if (!updater) {
    dialog.showMessageBox(win, { message: "Updates", detail: app.isPackaged ? "Updates are not available in this copy." : "Updates only work in the installed app." });
    return;
  }
  try {
    const r = await updater.checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (!latest || latest === app.getVersion()) {
      dialog.showMessageBox(win, { message: "You're up to date", detail: `${brand.productName} ${app.getVersion()} is the newest version.` });
    } else {
      dialog.showMessageBox(win, { message: `Downloading ${brand.productName} ${latest}…`, detail: "You'll be asked to restart when it's ready." });
    }
  } catch (e) {
    dialog.showErrorBox("Couldn't check for updates", e.message);
  }
}

// ---------- online mode, with an offline till ----------
// The app shows the live website. While online it keeps a copy of the products, IMEIs and receipt details
// on this PC. If the internet drops, it switches to a small offline till: sales are saved on this PC with
// a temporary number (OFF-…), the receipt prints, and a red bar shows how many sales are waiting.
// When the internet is back the sales upload by themselves and get their normal invoice numbers.
const catalogFile = path.join(userData, "offline-catalog.json");
const queueFile = path.join(userData, "offline-queue.json");
const OFFLINE_PAGE = path.join(__dirname, "offline.html");
let offlineMode = false;
let retryTimer = null;
let lastCatalogAt = 0;
let syncing = false;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(data));
  fs.renameSync(file + ".tmp", file);
}
const readQueue = () => readJson(queueFile, { sales: [], seq: 0 });

/** The branded full-window screen (desktop/screen.html): "connecting" or "offline". */
function showScreen(state, msg = "", detail = "") {
  if (!win) return;
  win.loadFile(path.join(__dirname, "screen.html"), { query: { state, msg, detail, product: brand.productName, support: supportText() } }).catch(() => {});
}

async function netFetch(url, opts = {}, ms = 8000) {
  const { session } = require("electron");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await session.defaultSession.fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}
async function isOnline() {
  // A small public file that never redirects (the login page redirects signed-in users).
  try { const r = await netFetch(`${BASE}/manifest.webmanifest?ping=${Date.now()}`, { cache: "no-store" }, 6000); return r.status === 200; } catch { return false; }
}

/** Saves the products / IMEIs / receipt details for the offline till (needs a signed-in user with the till permission). */
async function refreshCatalog(force) {
  if (!force && Date.now() - lastCatalogAt < 5 * 60 * 1000) return;
  lastCatalogAt = Date.now();
  try {
    const r = await netFetch(`${BASE}/api/desktop/catalog`, {}, 30000);
    if (r.status !== 200) return;
    const data = await r.json();
    if (Array.isArray(data.products)) writeJson(catalogFile, data);
  } catch (e) {
    log(`offline catalog: ${e.message}`);
  }
}

/** Uploads waiting offline sales. Returns { uploaded, failed, signedOut }. */
async function syncQueue() {
  if (syncing) return { uploaded: 0, failed: 0 };
  const q = readQueue();
  const waiting = q.sales.filter((s) => !s.error);
  if (!waiting.length) return { uploaded: 0, failed: 0 };
  syncing = true;
  try {
    const payload = waiting.map(({ offline_id, offline_no, created_at, customer, lines, payments }) => ({ offline_id, offline_no, created_at, customer, lines, payments }));
    const r = await netFetch(`${BASE}/api/desktop/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sales: payload }) }, 120000);
    if (r.status === 401) return { uploaded: 0, failed: 0, signedOut: true };
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const { results } = await r.json();
    const byId = new Map(results.map((x) => [x.offline_id, x]));
    const now = readQueue(); // re-read: a sale may have been added meanwhile
    let uploaded = 0, failed = 0;
    const done = [];
    now.sales = now.sales.filter((s) => {
      const res = byId.get(s.offline_id);
      if (!res) return true;
      if (res.number) { uploaded++; done.push(`${s.offline_no} → ${res.number}`); return false; }
      s.error = res.error || "Could not upload"; failed++;
      return true;
    });
    now.uploaded = [...done, ...(now.uploaded || [])].slice(0, 200);
    writeJson(queueFile, now);
    log(`offline sync: ${uploaded} uploaded, ${failed} failed ${done.join(", ")}`);
    if (uploaded) refreshCatalog(true);
    return { uploaded, failed };
  } catch (e) {
    log(`offline sync failed: ${e.message}`);
    return { uploaded: 0, failed: 0, error: e.message };
  } finally {
    syncing = false;
  }
}

/** Small bar on top of the online pages: lost connection, or offline sales still waiting. */
function showStatusBar(kind, text) {
  if (!win || offlineMode) return;
  const js = `(() => {
    let b = document.getElementById("sd-status-bar");
    const kind = ${JSON.stringify(kind)};
    if (!kind) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("div"); b.id = "sd-status-bar"; document.body.appendChild(b); }
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px 14px;font:600 13px Segoe UI,sans-serif;color:#fff;display:flex;gap:12px;align-items:center;justify-content:center;background:" + (kind === "offline" ? "#b91c1c" : "#b45309");
    b.innerHTML = ${JSON.stringify(text)} + (kind === "offline" ? ' <button style="font:600 12px Segoe UI;border:0;border-radius:8px;padding:5px 10px;cursor:pointer" onclick="window.shopdeskDesktop.offline.open()">Open offline till</button>' : "");
  })()`;
  win.webContents.executeJavaScript(js).catch(() => {});
}
function updatePendingBar() {
  const q = readQueue();
  const waiting = q.sales.filter((s) => !s.error).length, failed = q.sales.length - waiting;
  if (!q.sales.length) return showStatusBar("", "");
  showStatusBar("pending", `${waiting} offline sale${waiting === 1 ? "" : "s"} waiting to upload${failed ? ` · ${failed} could not be uploaded (File → Offline sales)` : ""}`);
}

function enterOffline(reason) {
  if (offlineMode) return;
  log(`offline: ${reason}`);
  if (fs.existsSync(catalogFile)) {
    offlineMode = true;
    win.loadFile(OFFLINE_PAGE);
    win.setTitle(`${brand.productName} · OFFLINE`);
  } else {
    showScreen("offline", "There's no internet connection right now. The offline till is ready after the first sign-in while online.", reason);
  }
  scheduleReconnect(10000);
}

function scheduleReconnect(ms) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(tryReconnect, ms);
}

async function tryReconnect() {
  if (!(await isOnline())) return scheduleReconnect(10000);
  if (offlineMode) {
    const empty = await win.webContents.executeJavaScript("window.__cartEmpty ? window.__cartEmpty() : true").catch(() => true);
    if (!empty) {
      win.webContents.executeJavaScript("window.__backOnline && window.__backOnline()").catch(() => {});
      return scheduleReconnect(5000);
    }
  }
  const r = await syncQueue();
  offlineMode = false;
  win.setTitle(brand.productName);
  if (r.signedOut) {
    win.loadURL(BASE + "/login");
    dialog.showMessageBox(win, { message: "Back online", detail: "Please sign in. The sales made offline upload as soon as you are signed in." });
    return;
  }
  win.loadURL(BASE + "/");
  if (r.uploaded || r.failed) {
    dialog.showMessageBox(win, {
      message: "Back online",
      detail: `${r.uploaded} offline sale${r.uploaded === 1 ? "" : "s"} uploaded and given invoice numbers.` + (r.failed ? `\n\n${r.failed} could not be uploaded (for example an IMEI that was sold elsewhere meanwhile). See File → Offline sales.` : ""),
    });
  }
}

function openOnline() {
  clearTimeout(retryTimer);
  offlineMode = false;
  win.loadURL(BASE + "/").catch(() => {});
}

function watchConnection() {
  let failures = 0;
  win.webContents.on("did-fail-load", async (_e, code, desc, url, isMain) => {
    // -3 is "aborted" (a normal redirect); only react when the app itself can't load.
    if (!isMain || code === -3 || !String(url).startsWith(BASE)) return;
    log(`online: load failed ${code} ${desc} ${url}`);
    // A single hiccup (Wi-Fi switching, slow DNS): if the site answers, just load it again.
    if (failures < 2 && (await isOnline())) {
      failures++;
      setTimeout(() => win.loadURL(url).catch(() => {}), 1500);
      return;
    }
    failures = 0;
    enterOffline(`${desc || "load failed"} (${code})`);
  });
  // A router, proxy or captive portal may answer with its own error page instead of failing.
  win.webContents.on("did-navigate", async (_e, url, code) => {
    if (!String(url).startsWith(BASE) || !(code >= 500)) return;
    if (!(await isOnline())) enterOffline(`server answered ${code}`);
  });
  // The website changes pages without full reloads (e.g. right after signing in), so watch both.
  const onPage = (full) => {
    const url = win.webContents.getURL();
    if (!url.startsWith(BASE)) return;
    if (!url.includes("/login") && !url.includes("/setup")) {
      refreshCatalog(false);
      if (readQueue().sales.some((s) => !s.error)) syncQueue().then(updatePendingBar);
    }
    if (full) updatePendingBar();
  };
  win.webContents.on("did-finish-load", () => onPage(true));
  win.webContents.on("did-navigate-in-page", () => onPage(false));
  // Every 15 s: if the connection is lost while a page is open, say so at once (the page itself still shows).
  let misses = 0;
  setInterval(async () => {
    if (offlineMode || !win) return;
    if (await isOnline()) {
      if (misses >= 2) updatePendingBar();
      misses = 0;
      const url = win.webContents.getURL();
      if (url.startsWith(BASE) && !url.includes("/login")) refreshCatalog(false);
      if (readQueue().sales.some((s) => !s.error)) syncQueue().then(updatePendingBar);
      return;
    }
    misses++;
    if (misses === 2) showStatusBar("offline", "No internet. Pages and the till can't save right now.");
  }, 15000);
}

// Offline till <-> app
const fromOffline = (e) => offlineMode && e.sender === (win && win.webContents) && e.sender.getURL().startsWith("file:");
ipcMain.handle("sd:off-data", (e) => {
  if (!fromOffline(e)) return null;
  const q = readQueue();
  const usedUnits = q.sales.filter((s) => !s.error).flatMap((s) => s.lines.map((l) => l.unit_id).filter(Boolean));
  return { catalog: readJson(catalogFile, null), queue: q.sales, usedUnits };
});
ipcMain.handle("sd:off-save", (e, sale) => {
  if (!fromOffline(e)) return { ok: false, error: "not allowed" };
  if (!sale || !Array.isArray(sale.lines) || !sale.lines.length) return { ok: false, error: "Empty sale" };
  const q = readQueue();
  q.seq = (q.seq || 0) + 1;
  const counter = String(readJson(catalogFile, {}).shop?.receipt_counter || "1").replace(/[^\w]/g, "") || "1";
  const offline_no = `OFF-${counter}-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(q.seq).padStart(3, "0")}`;
  q.sales.push({ ...sale, offline_id: crypto.randomUUID(), offline_no });
  writeJson(queueFile, q);
  log(`offline sale saved ${offline_no} total ${sale.total}`);
  return { ok: true, offline_no };
});
ipcMain.handle("sd:off-print", async (e, { html, width } = {}) => {
  if (!fromOffline(e) || typeof html !== "string") return { ok: false };
  const t = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await t.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    return await printContents(t.webContents, "receipt", width === "58" ? "58" : "80");
  } catch (err) {
    return { ok: false, reason: err.message };
  } finally {
    t.destroy();
  }
});
ipcMain.handle("sd:off-retry", (e) => { if (e.sender === (win && win.webContents) && e.sender.getURL().startsWith("file:")) scheduleReconnect(0); });
ipcMain.handle("sd:off-remove", (e, id) => {
  if (!fromOffline(e)) return;
  const q = readQueue();
  const s = q.sales.find((x) => x.offline_id === id && x.error);
  if (!s) return;
  q.sales = q.sales.filter((x) => x !== s);
  q.removed = [{ ...s, removedAt: new Date().toISOString() }, ...(q.removed || [])].slice(0, 100);
  writeJson(queueFile, q);
  log(`offline sale removed by user ${s.offline_no}`);
});
ipcMain.handle("sd:off-open", (e) => { if (e.sender.getURL().startsWith(BASE)) enterOffline("opened by user"); });

function showOfflineSales() {
  const q = readQueue();
  const lines = q.sales.map((s) => `${s.offline_no}  ${new Date(s.created_at).toLocaleString("en-GB")}  ${Number(s.total).toFixed(2)}  ${s.error ? "NOT UPLOADED: " + s.error : "waiting"}`);
  const up = (q.uploaded || []).slice(0, 15);
  dialog.showMessageBox(win, {
    message: "Offline sales",
    detail: (lines.length ? `Waiting / problems:\n${lines.join("\n")}` : "Nothing waiting to upload.") + (up.length ? `\n\nRecently uploaded:\n${up.join("\n")}` : ""),
    buttons: lines.length ? ["Upload now", "Close"] : ["Close"],
  }).then(async (r) => {
    if (lines.length && r.response === 0) {
      const res = await syncQueue();
      updatePendingBar();
      dialog.showMessageBox(win, { message: res.signedOut ? "Sign in first" : res.error ? "No connection" : `${res.uploaded} uploaded${res.failed ? `, ${res.failed} not uploaded` : ""}` });
    }
  });
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (LICENSE_ON && !(await requireActivation())) {
    app.exit(0);
    return;
  }
  buildMenu();
  createWindow();
  if (ONLINE) {
    openOnline();
    setupUpdates();
    // Offline data from an earlier version on this PC: offer once to move it online.
    const p = readPrefs();
    if (hasOfflineData() && !p.movedOnlineAt && !p.moveAskedAt) {
      win.webContents.once("did-finish-load", () => setTimeout(() => moveOfflineDataOnline(false), 1500));
    }
    setTimeout(() => backupNow(false), 2 * 60 * 1000);
    setInterval(() => backupNow(false), 3 * 60 * 60 * 1000);
    setTimeout(() => offerCloudOnce(), 30 * 1000);
    return;
  }
  startServer();
  if (!(await waitForServer())) {
    dialog.showErrorBox(brand.productName, `Could not start. Is port ${PORT} used by another program?\n\nLog: ${logFile}`);
    app.quit();
    return;
  }
  win.loadURL(BASE + "/");
  setTimeout(() => backupNow(false), 60 * 1000);
  setInterval(() => backupNow(false), 3 * 60 * 60 * 1000);
  setTimeout(() => offerCloudOnce(), 20 * 1000);
});

app.on("window-all-closed", () => {
  // The activation window closing before the app has started is handled in requireActivation.
  if (win) app.quit();
});

app.on("before-quit", async (e) => {
  if (quitting) return;
  if (ONLINE) {
    e.preventDefault();
    quitting = true;
    // Try once more to upload offline sales; if it can't, they stay on this PC and upload next time.
    await Promise.race([syncQueue(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
    try {
      await Promise.race([backupNow(false), new Promise((r) => setTimeout(r, 15000))]);
    } finally {
      // An update downloaded earlier ("Later") installs now, silently, and the app opens again next time.
      if (updater && updateReady) updater.quitAndInstall(true, false);
      else app.exit(0);
    }
    return;
  }
  if (!server) return;
  e.preventDefault();
  quitting = true;
  try {
    // Every close saves the newest data into today's backup (and the cloud folder, if set).
    await Promise.race([backupNow(false), new Promise((r) => setTimeout(r, 20000))]);
    await new Promise((resolve) => {
      const req = http.request(`${BASE}/api/desktop/shutdown`, { method: "POST", headers: { "x-backup-key": KEY }, timeout: 8000 }, (res) => {
        res.resume();
        res.on("end", resolve);
      });
      req.on("error", resolve);
      req.on("timeout", () => { req.destroy(); resolve(); });
      req.end();
    });
    await new Promise((r) => setTimeout(r, 800));
  } finally {
    if (server && server.exitCode === null) server.kill();
    app.exit(0);
  }
});
