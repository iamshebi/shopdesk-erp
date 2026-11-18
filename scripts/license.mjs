// Issues DOLLAR44 ERP activation keys. Only DOLLAR44 runs this: it needs the private key, which never
// goes into this repo or onto a client's computer.
//
//   node scripts/license.mjs --client "Kenz Mobile Phones" --months 1
//   node scripts/license.mjs --client "Kenz Mobile Phones" --months 12 --plan Yearly --start 2026-12-01
//   node scripts/license.mjs --client "Demo" --days 7 --plan Demo
//
// Private key: env D44_LICENSE_PRIVATE_KEY (the PEM text), or --key <file.pem>, or ./dollar44-license-private.pem
// The key covers start .. start + months/days - 1 (inclusive). Renewals: start the day after the old key ends.
import crypto from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def);

const pem = process.env.D44_LICENSE_PRIVATE_KEY || fs.readFileSync(opt("key", "dollar44-license-private.pem"), "utf8");
const client = opt("client");
if (!client) {
  console.error('Usage: node scripts/license.mjs --client "Shop name" --months 1 [--plan Monthly] [--start YYYY-MM-DD]');
  process.exit(1);
}
const today = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10); // UAE date
const start = opt("start", today);
if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("--start must be YYYY-MM-DD");
const end = new Date(`${start}T00:00:00Z`);
const months = Number(opt("months", 0));
const days = Number(opt("days", 0));
if (!months && !days) throw new Error("Give --months or --days");
if (months) end.setUTCMonth(end.getUTCMonth() + months);
if (days) end.setUTCDate(end.getUTCDate() + days);
end.setUTCDate(end.getUTCDate() - 1);
const plan = opt("plan", months === 12 ? "Yearly" : months ? (months === 1 ? "Monthly" : `${months} months`) : `${days} days`);

const payload = { v: 1, id: crypto.randomBytes(4).toString("hex").toUpperCase(), c: client, p: plan, s: start, e: end.toISOString().slice(0, 10) };
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(pem)).toString("base64url");
const key = `D44-${body}.${sig}`;

console.log(`\nDOLLAR44 ERP activation key`);
console.log(`Client:  ${payload.c}\nPlan:    ${payload.p}\nValid:   ${payload.s} to ${payload.e}\nID:      ${payload.id}\n`);
console.log(key + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Activation key for ${payload.c}\n\n| Plan | Valid | ID |\n|---|---|---|\n| ${payload.p} | ${payload.s} to ${payload.e} | ${payload.id} |\n\n\`\`\`\n${key}\n\`\`\`\n`);
}
