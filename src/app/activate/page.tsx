import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getLicenseStatus } from "@/lib/license";
import { PRODUCT, VENDOR } from "@/lib/brand";
import Submit from "@/components/submit";
import { activateKey } from "./actions";

export const dynamic = "force-dynamic";

const STATE_TEXT = {
  active: { tone: "bg-emerald-50 text-emerald-800", title: "Subscription active" },
  trial: { tone: "bg-sky-50 text-sky-800", title: "Free trial" },
  grace: { tone: "bg-amber-50 text-amber-800", title: "Subscription ended: renew now" },
  expired: { tone: "bg-red-50 text-red-800", title: "Subscription ended" },
} as const;

export default async function ActivatePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const s = await getSettings();
  const st = await getLicenseStatus();
  const t = STATE_TEXT[st.state];
  const canEnter = st.locked || can(user, "settings");
  const subject = encodeURIComponent(`${PRODUCT} renewal: ${s.shop_name}`);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-lg fade-in space-y-4">
        <div className="text-center">
          {s.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo} alt="" className="mx-auto mb-3 h-14 w-auto object-contain" />
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight">{s.shop_name}</h1>
          <p className="text-sm text-slate-500">{PRODUCT} subscription</p>
        </div>

        {sp.ok && <div className="card bg-emerald-50 p-3 text-center text-sm text-emerald-700">Activated. Thank you for renewing.</div>}
        {sp.err && <div className="card bg-red-50 p-3 text-center text-sm text-red-700">{sp.err}</div>}

        <section className={`card p-5 ${t.tone}`}>
          <div className="font-semibold">{t.title}</div>
          <div className="mt-1 text-sm">
            {st.state === "trial" && <>Trial runs until {st.endsOn}. {st.daysLeft} day{st.daysLeft === 1 ? "" : "s"} left.</>}
            {st.state === "active" && <>Valid until {st.endsOn} ({st.daysToEnd} day{st.daysToEnd === 1 ? "" : "s"} left).</>}
            {st.state === "grace" && <>The subscription ended on {st.endsOn}. The software locks in {st.daysLeft} day{st.daysLeft === 1 ? "" : "s"}.</>}
            {st.state === "expired" && <>The subscription ended on {st.endsOn}. Your data is safe: enter a renewal key to continue.</>}
          </div>
          {st.license && (
            <div className="mt-3 grid grid-cols-2 gap-1 text-xs opacity-80">
              <span>Licensed to</span><span className="text-end">{st.license.c}</span>
              <span>Plan</span><span className="text-end">{st.license.p}</span>
              <span>Licence ID</span><span className="text-end font-mono">{st.license.id}</span>
            </div>
          )}
        </section>

        {canEnter ? (
          <form action={activateKey} className="card space-y-3 p-5">
            <label className="block text-sm font-medium">Activation key</label>
            <textarea name="key" required rows={4} placeholder="D44-…" className="input font-mono text-xs" spellCheck={false} />
            <Submit>Activate</Submit>
          </form>
        ) : (
          <div className="card p-4 text-sm text-slate-600">Ask the shop owner to enter the renewal key.</div>
        )}

        <section className="card flex items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dollar44-logo.png" alt="DOLLAR44" className="h-16 w-auto shrink-0 rounded-lg" />
          <div className="text-sm">
            <div className="font-semibold">Get or renew your key</div>
            <div className="text-slate-500">{VENDOR.name} · {VENDOR.city}</div>
            <a className="block text-accent underline" href={`mailto:${VENDOR.email}?subject=${subject}`}>{VENDOR.email}</a>
            <a className="block text-accent underline" href={VENDOR.instagramUrl} target="_blank" rel="noreferrer">Instagram @{VENDOR.instagram}</a>
          </div>
        </section>

        <div className="flex justify-center gap-4 text-sm">
          {!st.locked && <Link href="/" className="text-slate-500 underline">Back to {PRODUCT}</Link>}
          {st.locked && can(user, "data") && <a href="/api/backup" className="text-slate-500 underline">Download a backup of my data</a>}
        </div>
      </div>
    </main>
  );
}
