export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  return { title: s?.shop_name ? `${s.shop_name} · ShopDesk` : "ShopDesk" };
}

export const viewport: Viewport = { themeColor: "#f6f7f9" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  return (
    <html lang="en">
      <body style={{ ["--accent" as any]: s?.accent || "#0f766e" }} className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
