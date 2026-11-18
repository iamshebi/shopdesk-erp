// Seller tool: turns a shop's Request Code into its Activation Key.
//   node scripts/license-keygen.mjs REQ-1A2B-3C4D-5E6F
// The private key is read from SHOPDESK_LICENSE_KEY (base64) or from the file in SHOPDESK_LICENSE_KEY_FILE.
// Never commit the private key. On a phone, use license-keygen.html instead.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generateActivationKey, verifyActivationKey, normaliseRequest } = require("../desktop/license.cjs");

const code = process.argv[2];
if (!code) {
  console.error("Usage: node scripts/license-keygen.mjs REQ-XXXX-XXXX-XXXX");
  process.exit(1);
}
const priv = process.env.SHOPDESK_LICENSE_KEY || (process.env.SHOPDESK_LICENSE_KEY_FILE && fs.readFileSync(process.env.SHOPDESK_LICENSE_KEY_FILE, "utf8"));
if (!priv) {
  console.error("Set SHOPDESK_LICENSE_KEY (base64) or SHOPDESK_LICENSE_KEY_FILE (path to the private key file).");
  process.exit(1);
}
const req = normaliseRequest(code);
const key = generateActivationKey(req, priv);
if (!verifyActivationKey(req, key)) {
  console.error("This private key does not match the public key built into the app.");
  process.exit(1);
}
console.log(`Request code:   ${req}\nActivation key: ${key}`);
