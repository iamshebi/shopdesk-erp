// Offline licence lock for the desktop app. Plain Node so it can be tested without Electron.
//
// 1. The app reads this PC's hardware ID and shows a short Request Code (REQ-XXXX-XXXX-XXXX).
// 2. The shop sends the code to you on WhatsApp after paying.
// 3. You turn it into an Activation Key with the private key (scripts/license-keygen.mjs or license-keygen.html).
// 4. The app checks the key against the PUBLIC key below and unlocks on that PC only.
//
// The app only holds the public key, so someone who opens the .exe cannot make keys for other PCs.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

// Public half of the DOLLAR44 licence key pair (same pair as the monthly keys in src/lib/license.ts).
// The private half is kept only by DOLLAR44 (never in this repo).
const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAK13MMsYEXHZOgJ36ycK/RzKkz60X3DT5FG9V5kjJlds=";

const KEY_PREFIX = "D44PC";
// Crockford base32: no I, L, O, U, so keys are easy to read out over the phone.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function b32encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  const clean = str.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad character");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Values some PC makers ship instead of a real UUID; these are the same on many machines.
function isJunkId(id) {
  if (!id) return true;
  const s = id.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (s.length < 16) return true;
  if (/^(0+|F+)$/.test(s)) return true;
  if (s === "03000200040005000006000700080009") return true;
  return false;
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Hardware ID for this PC. On Windows the motherboard UUID comes first because it survives
 * formatting and reinstalling Windows (shops do this often); the Windows MachineGuid is the fallback
 * for boards that report a junk UUID.
 */
let cachedMachineId = "";
function getMachineId() {
  if (!cachedMachineId) cachedMachineId = readMachineId();
  return cachedMachineId;
}
function readMachineId() {
  if (process.platform === "win32") {
    const uuid = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"]);
    if (!isJunkId(uuid)) return "BOARD:" + uuid.toUpperCase();
    const out = run("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (m) return "WIN:" + m[1].toUpperCase();
  } else if (process.platform === "darwin") {
    const m = run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]).match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (m) return "MAC:" + m[1].toUpperCase();
  } else {
    for (const f of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const id = fs.readFileSync(f, "utf8").trim();
        if (id) return "LINUX:" + id.toUpperCase();
      } catch {}
    }
  }
  // Last resort: the computer name. Weak, but better than refusing to run.
  return "HOST:" + os.hostname().toUpperCase();
}

/** Short code the shop sends you. Tied to this PC and to this app (appId), so one key never unlocks another brand. */
function getRequestCode(appId, machineId = getMachineId()) {
  const h = crypto.createHash("sha256").update(`${appId}|${machineId}`).digest("hex").toUpperCase();
  return `REQ-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

function normaliseRequest(code) {
  const hex = String(code || "").toUpperCase().replace(/^REQ/, "").replace(/[^0-9A-F]/g, "");
  if (hex.length !== 12) throw new Error("A request code looks like REQ-1A2B-3C4D-5E6F");
  return `REQ-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * The client's own website, written into the key by DOLLAR44. With a site the app opens that site (online mode);
 * without one it runs its own database on the PC (offline mode). Returns "" for no site.
 */
function normaliseSite(site) {
  const s = String(site || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) return "";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?$/.test(s)) throw new Error("A website looks like erp.yourshop.ae");
  return s;
}
/** "D44PC-…@erp.shop.ae" -> { code: "D44PC-…", site: "erp.shop.ae" } */
function splitKey(text) {
  const t = String(text || "").trim().replace(/\s+/g, "");
  const at = t.indexOf("@");
  return at < 0 ? { code: t.toUpperCase(), site: "" } : { code: t.slice(0, at).toUpperCase(), site: t.slice(at + 1) };
}
function message(requestCode, site) {
  const req = normaliseRequest(requestCode);
  return Buffer.from(site ? `${req}|${site}` : req);
}
/** The website a key was made for ("" = offline). */
function keySite(activationKey) {
  try { return normaliseSite(splitKey(activationKey).site); } catch { return ""; }
}

function formatKey(sig) {
  const body = b32encode(sig);
  return `${KEY_PREFIX}-` + body.match(/.{1,6}/g).join("-");
}

/** Seller side: signs a request code with the private key (PKCS8 PEM or base64 DER). */
function generateActivationKey(requestCode, privateKey, site = "") {
  const key = privateKey.includes("BEGIN") ? crypto.createPrivateKey(privateKey) : crypto.createPrivateKey({ key: Buffer.from(privateKey.trim(), "base64"), format: "der", type: "pkcs8" });
  const s = normaliseSite(site);
  const sig = crypto.sign(null, message(requestCode, s), key);
  return formatKey(sig) + (s ? `@${s}` : "");
}

/** App side: true when the key was made for this exact request code. */
function verifyActivationKey(requestCode, activationKey, publicKeyB64 = PUBLIC_KEY_B64) {
  try {
    const { code, site } = splitKey(activationKey);
    if (!code.startsWith(KEY_PREFIX)) return false;
    const sig = b32decode(code.slice(KEY_PREFIX.length));
    if (sig.length !== 64) return false;
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    return crypto.verify(null, message(requestCode, normaliseSite(site)), pub, sig);
  } catch {
    return false;
  }
}

/** Reads the saved key from disk and checks it against this PC. */
function checkLicense(file, appId) {
  const requestCode = getRequestCode(appId);
  let saved = "";
  try {
    saved = JSON.parse(fs.readFileSync(file, "utf8")).key || "";
  } catch {}
  const valid = !!saved && verifyActivationKey(requestCode, saved);
  return { requestCode, valid, site: valid ? keySite(saved) : "" };
}

function saveLicense(file, key) {
  const { code, site } = splitKey(key);
  fs.writeFileSync(file, JSON.stringify({ key: code + (site ? `@${normaliseSite(site)}` : ""), activatedAt: new Date().toISOString() }, null, 2));
}

/**
 * DOLLAR44's signed status file { data, sig }: cancelled PC request codes and subscription IDs, and the latest
 * app version with its download link and SHA-512. Returns the data, or null if the signature is not DOLLAR44's.
 */
function verifyStatus(text, publicKeyB64 = PUBLIC_KEY_B64) {
  try {
    const f = JSON.parse(text);
    if (typeof f.data !== "string" || typeof f.sig !== "string") return null;
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    if (!crypto.verify(null, Buffer.from(f.data), pub, Buffer.from(f.sig, "base64url"))) return null;
    const d = JSON.parse(Buffer.from(f.data, "base64url").toString("utf8"));
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

/** 1 if a > b, -1 if a < b, 0 if equal ("2.10.0" > "2.9.3"). */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

module.exports = {
  verifyStatus,
  compareVersions, getMachineId, getRequestCode, generateActivationKey, verifyActivationKey, checkLicense, saveLicense, normaliseRequest, normaliseSite, keySite, isJunkId };
