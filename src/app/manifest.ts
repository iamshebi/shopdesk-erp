import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Makes DOLLAR44 ERP installable as an app: "Add to Home screen" on Android / Samsung DeX,
// "Install app" in Chrome or Edge on Windows. Opens in its own window without browser bars.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings().catch(() => null);
  const name = s?.shop_name ? `${s.shop_name} · DOLLAR44 ERP` : "DOLLAR44 ERP";
  return {
    name,
    short_name: s?.shop_name || "DOLLAR44 ERP",
    description: "Billing, stock, repairs and VAT invoices",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#f6f7f9",
    theme_color: s?.accent || "#0f766e",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
