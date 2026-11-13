export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  return {
    title: s?.shop_name ? `${s.shop_name} · ShopDesk` : "ShopDesk",
    appleWebApp: { capable: true, title: s?.shop_name || "ShopDesk", statusBarStyle: "default" },
    icons: { apple: "/app-icon-192.png" },
  };
}

// On a cloud host (Vercel) the embedded database would be wiped on every restart,
// so a real Postgres (DATABASE_URL) is required there.
const THEME_SCRIPT = `try{var t=localStorage.getItem("sd-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const missingCloudDb = !!process.env.VERCEL && !process.env.DATABASE_URL && !process.env.POSTGRES_URL;

export const viewport: Viewport = { themeColor: "#f6f7f9" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (missingCloudDb) {
    return (
      <html lang="en">
        <body className="min-h-screen font-sans grid place-items-center p-6">
          <div className="max-w-md rounded-xl border bg-white p-6 text-sm leading-6">
            <h1 className="text-lg font-semibold mb-2">ShopDesk: database not connected yet</h1>
            <p>
              Add a Postgres database to this Vercel project (Storage → Neon or Supabase → Connect), make sure the
              <code> DATABASE_URL</code> variable is set, then redeploy. The setup screen appears after that.
            </p>
          </div>
        </body>
      </html>
    );
  }
  const s = await getSettings().catch(() => null);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved light/dark theme before the page paints, so it doesn't flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body style={{ ["--accent" as any]: s?.accent || "#0f766e" }} className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
