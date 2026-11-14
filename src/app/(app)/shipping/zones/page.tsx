import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import { saveZone } from "../actions";

export default async function ZonesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("shipping");
  const sp = await searchParams;
  const s = await getSettings();
  const zones = await q<any>("SELECT * FROM shipping_zones ORDER BY id");
  const Form = ({ z = {} as any }) => (
    <form action={saveZone} className="grid gap-2 sm:grid-cols-6">
      {z.id && <input type="hidden" name="id" value={z.id} />}
      <input name="name" defaultValue={z.name} placeholder="Zone, e.g. Ras Al Khaimah" className="input" required />
      <input name="areas" defaultValue={z.areas} placeholder="Areas covered" className="input sm:col-span-2" />
      <input name="charge" defaultValue={z.charge != null ? Number(z.charge) : ""} placeholder={`Charge (${s.currency})`} className="input" inputMode="decimal" />
      <input name="free_over" defaultValue={Number(z.free_over) || ""} placeholder="Free over" className="input" inputMode="decimal" />
      <div className="flex gap-1"><input name="days" defaultValue={z.days} placeholder="1-2 days" className="input" /><Submit className="btn-dark btn-sm">Save</Submit></div>
    </form>
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Delivery zones" subtitle="Charges by area. The website uses these for the delivery fee on online orders."><Link href="/shipping" className="btn-ghost">Shipments</Link></PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <div className="card mb-6 p-5"><h3 className="mb-3 font-semibold">Add a zone</h3><Form /></div>
      <div className="card space-y-3 p-5">
        {zones.map((z) => <div key={z.id} className="flex items-start gap-2"><div className="flex-1"><Form z={z} /></div><form action={saveZone}><input type="hidden" name="delete" value={z.id} /><Submit className="btn-ghost btn-sm" confirm={`Remove ${z.name}?`}>×</Submit></form></div>)}
        {zones.length === 0 && <p className="text-sm text-slate-400">No zones yet. Without zones, website orders have no delivery charge added.</p>}
      </div>
    </div>
  );
}
