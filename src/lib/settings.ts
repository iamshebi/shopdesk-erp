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
  website_url: string;
  website_repo: string; // e.g. iamshebi/zaitoon-mobiles
  website_branch: string;
  website_path: string;
  website_token_enc: string; // GitHub token, encrypted
  website_show_prices: boolean;
  wps_employer_id: string;
  wps_bank_routing: string;
  loyalty_points_per_unit: number;
  loyalty_point_value: number;
  loyalty_min_redeem: number;
  email_from: string;
  resend_key_enc: string;
  stripe_key_enc: string;
  stripe_webhook_secret_enc: string;
  daily_report_email: string;
  auto_reminders: boolean;
  reminder_every_days: number;
  couriers: string;
  expense_approval_limit: number;
  po_approval_limit: number;
  books_locked_until: string;
  fiscal_year_start_month: number;
  require_product_approval: boolean;
  site_content: string;
  website_orders_enabled: boolean;
  portal_enabled: boolean;
  referral_points: number;
  sms_provider_url: string;
  sms_key_enc: string;
  whatsapp_token_enc: string;
  whatsapp_phone_id: string;
  sheet_token: string;
  default_language: string;
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
  website_url: "",
  website_repo: "",
  website_branch: "main",
  website_path: "catalog.json",
  website_token_enc: "",
  website_show_prices: false,
  wps_employer_id: "",
  wps_bank_routing: "",
  loyalty_points_per_unit: 0,
  loyalty_point_value: 0.05,
  loyalty_min_redeem: 100,
  email_from: "",
  resend_key_enc: "",
  stripe_key_enc: "",
  stripe_webhook_secret_enc: "",
  daily_report_email: "",
  auto_reminders: false,
  reminder_every_days: 7,
  expense_approval_limit: 0,
  po_approval_limit: 0,
  books_locked_until: "",
  fiscal_year_start_month: 1,
  require_product_approval: false,
  site_content: "{}",
  website_orders_enabled: true,
  portal_enabled: true,
  referral_points: 0,
  sms_provider_url: "",
  sms_key_enc: "",
  whatsapp_token_enc: "",
  whatsapp_phone_id: "",
  sheet_token: "",
  default_language: "en",
  couriers: "Aramex|https://www.aramex.com/track/results?ShipmentNumber={n}\nDHL|https://www.dhl.com/ae-en/home/tracking.html?tracking-id={n}\nEmirates Post|https://www.emiratespost.ae/track?trackno={n}\nOwn driver|",
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
