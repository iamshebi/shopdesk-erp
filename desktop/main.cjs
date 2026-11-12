// Windows desktop shell: runs the ShopDesk server on this computer and shows it in a window.
// Data lives in %APPDATA%\<Product>\data. Other devices on the shop Wi-Fi can open http://<this-PC-IP>:<port>.
const { app, BrowserWindow, Menu, dialog, shell, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { runBackup } = require("./backup.cjs");

const brand = JSON.parse(fs.readFileSync(path.join(__dirname, "brand.json"), "utf8"));
const PORT = Number(brand.port || 4300);
const BASE = `http://127.0.0.1:${PORT}`;

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
let server = null;
let win = null;
let quitting = false;

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

async function backupNow(force) {
  try {
    const file = await runBackup({ port: PORT, key: KEY, dir: backupDir, force });
    if (force) {
      const r = await dialog.showMessageBox(win, { message: "Backup saved", detail: file, buttons: ["OK", "Open folder"] });
      if (r.response === 1) shell.openPath(backupDir);
    }
  } catch (e) {
    if (force) dialog.showErrorBox("Backup failed", String(e && e.message ? e.message : e));
  }
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Back up now", click: () => backupNow(true) },
        { label: "Open backups folder", click: () => { fs.mkdirSync(backupDir, { recursive: true }); shell.openPath(backupDir); } },
        { type: "separator" },
        {
          label: "Use on other devices…",
          click: () => {
            const urls = lanAddresses();
            dialog.showMessageBox(win, {
              message: "Open on other computers, tablets or phones",
              detail: urls.length
                ? `Connect the device to the same shop Wi-Fi, then open this address in its browser:\n\n${urls.join("\n")}\n\nThis computer must stay on with ${brand.productName} open.`
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
              detail: [brand.supportName && `Support: ${brand.supportName}`, brand.supportPhone, brand.supportWebsite, `\nData folder: ${dataDir}`].filter(Boolean).join("\n"),
            }),
        },
        { label: "Show data folder", click: () => shell.openPath(dataDir) },
        { label: "Show engine log", click: () => shell.openPath(logFile) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: brand.productName,
    backgroundColor: "#f6f7f9",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  // Print pages and receipts open in their own window; anything outside the app opens in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 900, height: 1000, autoHideMenuBar: true, title: brand.productName } };
    }
    shell.openExternal(url);
    return { action: "deny" };
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
  win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        `<html><body style="margin:0;display:grid;place-items:center;height:100vh;font-family:Segoe UI,sans-serif;background:#f6f7f9;color:#475569">
         <div style="text-align:center"><div style="font-size:22px;font-weight:600;color:#0f172a">${brand.productName}</div><div style="margin-top:8px">Starting…</div></div></body></html>`,
      ),
  );
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  buildMenu();
  createWindow();
  startServer();
  if (!(await waitForServer())) {
    dialog.showErrorBox(brand.productName, `Could not start. Is port ${PORT} used by another program?\n\nLog: ${logFile}`);
    app.quit();
    return;
  }
  win.loadURL(BASE + "/");
  setTimeout(() => backupNow(false), 60 * 1000);
  setInterval(() => backupNow(false), 3 * 60 * 60 * 1000);
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", async (e) => {
  if (quitting || !server) return;
  e.preventDefault();
  quitting = true;
  try {
    await Promise.race([backupNow(false), new Promise((r) => setTimeout(r, 15000))]);
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
