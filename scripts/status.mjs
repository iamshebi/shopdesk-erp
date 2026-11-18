// Makes DOLLAR44's signed status file (status.json): cancelled keys and the latest Windows app.
//   node scripts/status.mjs status-config.json > status.json
// status-config.json (keep it with the private key, not in this repo):
//   {
//     "revoked":    ["EB4AFC93"],               subscription licence IDs to cancel (shown as "Licence ID" in the app)
//     "revokedPcs": ["REQ-1A2B-3C4D-5E6F"],     PC request codes to cancel
//     "app": { "version": "2.3.0", "url": "https://…/DOLLAR44-ERP-Setup-2.3.0.exe", "notes": "What changed" }
//   }
// With "app.file" pointing to the installer on this computer, its SHA-512 is filled in for you.
// Private key: D44_LICENSE_PRIVATE_KEY (PEM text) or ./dollar44-license-private.pem
// Publish the output at the statusUrl in brands/*/brand.json (https://d44-licence.vercel.app/status.json).
import crypto from "node:crypto";
import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync(process.argv[2] || "status-config.json", "utf8"));
const pem = process.env.D44_LICENSE_PRIVATE_KEY || fs.readFileSync("dollar44-license-private.pem", "utf8");
const app = cfg.app ? { ...cfg.app } : undefined;
if (app?.file) {
  app.sha512 = crypto.createHash("sha512").update(fs.readFileSync(app.file)).digest("hex");
  delete app.file;
}
const data = { v: 1, t: new Date().toISOString(), revoked: cfg.revoked || [], revokedPcs: cfg.revokedPcs || [], ...(app ? { app } : {}) };
const body = Buffer.from(JSON.stringify(data)).toString("base64url");
const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(pem)).toString("base64url");
process.stdout.write(JSON.stringify({ data: body, sig }, null, 1) + "\n");
console.error(`status.json: ${data.revoked.length} cancelled keys, ${data.revokedPcs.length} cancelled PCs${app ? `, app ${app.version}` : ""}`);
