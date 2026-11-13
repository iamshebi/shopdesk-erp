import "server-only";
import { cache } from "react";
import { q } from "./db";

export interface ShopSettings {
  shop_name: string;
  shop_name_ar: string;
  legal_name: string;
  trn: string;
  address: string;
  emirate: string;
  phone: string;
  email: string;
  website: string;
  logo: string; // data URL
  accent: string;
  vat_registered: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  invoice_prefix: string;
  invoice_terms: string;
  repair_terms: string;
  currency: string;
  idle_timeout_minutes: number; // 0 = never sign out automatically
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: "My Shop",
  shop_name_ar: "",
  legal_name: "",
  trn: "",
  address: "",
  emirate: "Dubai",
  phone: "",
  email: "",
  website: "",
  logo: "",
  accent: "#0f766e",
  vat_registered: true,
  vat_rate: 5,
  prices_include_vat: true,
  invoice_prefix: "INV-",
  invoice_terms: "Goods once sold are covered by manufacturer warranty only. Returns accepted within 7 days with original packing and invoice.",
  repair_terms: "Devices not collected within 30 days of the ready notice may be disposed of. We are not responsible for data loss. Please back up your device.",
  currency: "AED",
  idle_timeout_minutes: 30,
};

export const getSettings = cache(async (): Promise<ShopSettings> => {
  const rows = await q<{ key: string; value: string }>("SELECT key, value FROM settings");
  const s: any = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const def = (DEFAULT_SETTINGS as any)[key];
    s[key] = typeof def === "boolean" ? value === "true" : typeof def === "number" ? Number(value) : value;
  }
  return s;
});

export async function saveSettings(values: Partial<ShopSettings>) {
  for (const [k, v] of Object.entries(values)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    await q(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [k, String(v)],
    );
  }
}

export async function getSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const row = await q<{ value: string }>("SELECT value FROM settings WHERE key = 'session_secret'");
  if (row[0]?.value) return row[0].value;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Buffer.from(bytes).toString("hex");
  await q(
    `INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [secret],
  );
  const again = await q<{ value: string }>("SELECT value FROM settings WHERE key = 'session_secret'");
  return again[0].value;
}
