import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import LoginForm from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (!n?.n) redirect("/setup");
  if (await getUser()) redirect("/");
  const s = await getSettings();
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm fade-in">
        <div className="mb-8 text-center">
          {s.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo} alt="" className="mx-auto mb-4 h-16 w-auto object-contain" />
          ) : (
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-xl font-semibold text-white">
              {s.shop_name.slice(0, 1)}
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{s.shop_name}</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>
        {sp.idle && <div className="card mb-4 bg-amber-50 p-3 text-center text-sm text-amber-800">You were signed out after a period of no activity.</div>}
        <LoginForm />
        <a href="https://instagram.com/dollar44.uae" target="_blank" rel="noreferrer" className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icon-192.png" alt="" className="h-5 w-5 rounded" /> Powered by DOLLAR44
        </a>
      </div>
    </main>
  );
}
