// Builds the Windows desktop app for one brand.
//   node scripts/build-desktop.mjs --brand default          -> prepares desktop-dist/ (server + app)
//   node scripts/build-desktop.mjs --brand default --pack   -> also makes the installer in release/<brand>/
// A brand is a folder in brands/ with brand.json and icon.png (512x512).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const brandName = args[args.indexOf("--brand") + 1] && args.includes("--brand") ? args[args.indexOf("--brand") + 1] : "default";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const brandDir = path.join(root, "brands", brandName);
if (!fs.existsSync(path.join(brandDir, "brand.json"))) {
  console.error(`No brands/${brandName}/brand.json`);
  process.exit(1);
}
const brand = JSON.parse(fs.readFileSync(path.join(brandDir, "brand.json"), "utf8"));
// --url https://client-site.ae  -> this installer opens that client's live site (online mode) instead of
// running its own database on the PC. Lets DOLLAR44 make a client-specific build without editing brand.json.
if (args.includes("--url") && args[args.indexOf("--url") + 1]) {
  brand.mode = "online";
  brand.url = args[args.indexOf("--url") + 1];
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const electronVersion = JSON.parse(fs.readFileSync(path.join(root, "node_modules/electron/package.json"), "utf8")).version;
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
const copy = (from, to) => fs.cpSync(from, to, { recursive: true, dereference: true });

const online = brand.mode === "online";
console.log(`\n▶ Building ${brand.productName} (${brandName}) — ${online ? `online, opens ${brand.url}` : "offline, own database on the PC"}`);
const out = path.join(root, "desktop-dist");
fs.rmSync(out, { recursive: true, force: true });
const server = path.join(out, "server");
if (!online) {
run("npx next build", { SHOPDESK_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" });
copy(path.join(root, ".next/standalone"), server);
copy(path.join(root, ".next/static"), path.join(server, ".next/static"));
if (fs.existsSync(path.join(root, "public"))) copy(path.join(root, "public"), path.join(server, "public"));
// PGlite loads its WebAssembly files at runtime; make sure the whole package is there.
copy(path.join(root, "node_modules/@electric-sql/pglite"), path.join(server, "node_modules/@electric-sql/pglite"));
fs.rmSync(path.join(server, ".data"), { recursive: true, force: true });
// Image optimisation isn't used; drop the large native image library.
for (const d of ["node_modules/sharp", "node_modules/@img"]) fs.rmSync(path.join(server, d), { recursive: true, force: true });
fs.rmSync(path.join(server, ".env"), { force: true });
}

const appDir = path.join(out, "app");
fs.mkdirSync(appDir, { recursive: true });
for (const f of ["main.cjs", "backup.cjs", "license.cjs", "preload.cjs", "activate.html", "printers.html"]) fs.copyFileSync(path.join(root, "desktop", f), path.join(appDir, f));
fs.writeFileSync(path.join(appDir, "brand.json"), JSON.stringify(brand, null, 2));
fs.copyFileSync(path.join(brandDir, "icon.png"), path.join(appDir, "icon.png"));
fs.writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({ name: brand.executableName.toLowerCase().replace(/[^a-z0-9-]/g, "-"), productName: brand.productName, version: brand.version || pkg.version, main: "main.cjs", description: brand.productName, author: brand.supportName || "" }, null, 2),
);

const config = {
  appId: brand.appId,
  productName: brand.productName,
  executableName: brand.executableName,
  electronVersion,
  directories: { app: appDir, output: path.join(root, "release", brandName) },
  // electron-builder always drops a node_modules folder at the root of "from", so copy the parent
  // folder and pick server/** — the server's node_modules (Next, PGlite, pg...) then gets included.
  extraResources: online ? [] : [{ from: out, to: ".", filter: ["server/**/*"] }],
  asar: true,
  // The desktop shell uses only Electron and Node built-ins. Without this, electron-builder falls back to the
  // project's node_modules (Next, React…) and the installer triples in size.
  files: ["**/*", "!**/node_modules/**"],
  // No auto-update feed: installers are handed to each shop directly.
  publish: null,
  win: { target: [{ target: "nsis", arch: ["x64"] }], icon: path.join(brandDir, "icon.png") },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: brand.productName,
    artifactName: `${brand.executableName}-Setup-\${version}.\${ext}`,
  },
};
fs.writeFileSync(path.join(out, "builder.json"), JSON.stringify(config, null, 2));
console.log(`✔ Prepared desktop-dist for ${brand.productName}`);

if (args.includes("--pack")) {
  run(`npx electron-builder --win --config "${path.join(out, "builder.json")}" --publish never`);
  console.log(`✔ Installer in release/${brandName}/`);
}
