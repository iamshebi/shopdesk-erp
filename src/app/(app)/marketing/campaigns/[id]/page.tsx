import Link from "next/link";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SEGMENTS } from "@/lib/segments";
import { channelsReady } from "@/lib/messaging";
import { waLink } from "@/lib/util";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { sendCampaign } from "../actions";
import { campaignRecipients } from "@/lib/campaigns";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser("marketing");
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const c = await one<any>("SELECT * FROM campaigns WHERE id=$1", [Number(id)]);
  if (!c) notFound();
  const list = await campaignRecipients(c);
  const ready = await channelsReady();
  const auto = c.channel === "email" ? ready.email : c.channel === "sms" ? ready.sms : ready.whatsapp;
  const fill = (r: any) => c.message.replaceAll("{name}", r.name?.split(" ")[0] ?? "").replaceAll("{coupon}", c.coupon_code).replaceAll("{shop}", s.shop_name);
  return (
    <div className="max-w-4xl">
      <PageHeader title={c.name} subtitle={`${c.channel} · ${SEGMENTS[c.segment]?.label}${c.group_name ? ` · ${c.group_name}` : ""} · ${list.length} customers`}>
        <Badge tone={c.status === "sent" ? "green" : "amber"}>{c.status}</Badge><Link href="/marketing/campaigns" className="btn-ghost">All campaigns</Link>
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="card mb-6 p-5 text-sm"><div className="mb-1 text-xs text-slate-500">Message preview</div><div className="whitespace-pre-wrap">{list[0] ? fill(list[0]) : c.message}</div></div>
      {c.status !== "sent" && (
        <div className="card mb-6 flex flex-wrap items-center gap-3 p-4 text-sm">
          {auto ? <form action={sendCampaign}><input type="hidden" name="id" value={c.id} /><Submit confirm={`Send to ${list.length} customers now?`}>Send to {list.length} customers</Submit></form>
            : c.channel === "whatsapp" ? <><span className="text-slate-600">Tap each name below to open WhatsApp with the message ready, then:</span><form action={sendCampaign}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="manual" value="1" /><Submit className="btn-dark">Mark as sent</Submit></form></>
            : <span className="text-amber-700">{c.channel === "email" ? "Email" : "SMS"} is not set up yet. Add the keys in Settings → Integrations.</span>}
        </div>
      )}
      <div className="card overflow-x-auto"><table className="tbl"><tbody>
        {list.slice(0, 300).map((r) => <tr key={r.id}><td><Link href={`/customers/${r.id}`} className="hover:text-accent">{r.name}</Link></td><td className="text-slate-500">{c.channel === "email" ? r.email : r.phone}</td>
          <td className="text-right">{c.channel === "whatsapp" && r.phone && <a href={waLink(r.phone, fill(r))} target="_blank" className="btn-ghost btn-sm">Open WhatsApp</a>}</td></tr>)}
        {list.length === 0 && <tr><td className="text-slate-400">No customers match (they need a {c.channel === "email" ? "saved email" : "phone number"} and must not have opted out).</td></tr>}
      </tbody></table></div>
    </div>
  );
}
