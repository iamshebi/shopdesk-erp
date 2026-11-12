import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import AutoPrint from "@/components/auto-print";

export default async function PrintRepair({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const r = await one<any>("SELECT * FROM repairs WHERE id=$1", [Number(id)]);
  if (!r) notFound();
  const Copy = ({ label }: { label: string }) => (
    <div className="border border-slate-300 p-6">
      <div className="flex items-start justify-between border-b border-slate-300 pb-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo && <img src={s.logo} alt="" className="h-12 object-contain" />}
          <div><div className="text-lg font-bold">{s.shop_name}</div><div className="text-xs text-slate-600">{[s.address, s.phone].filter(Boolean).join(" · ")}</div></div>
        </div>
        <div className="text-right"><div className="text-xs uppercase text-slate-500">Repair job card · {label}</div><div className="text-2xl font-bold">{r.number}</div><div className="text-xs">{fmtDate(r.created_at, true)}</div></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
        <div><b>Customer:</b> {r.customer_name}</div><div><b>Phone:</b> {r.customer_phone}</div>
        <div><b>Device:</b> {r.device}</div><div><b>IMEI/Serial:</b> <span className="font-mono">{r.imei || "—"}</span></div>
        <div className="col-span-2"><b>Problem:</b> {r.issue}</div>
        <div><b>Accessories:</b> {r.accessories || "None"}</div><div><b>Condition:</b> {r.condition_notes || "—"}</div>
        <div><b>Estimate:</b> {s.currency} {num(r.estimate)}</div><div><b>Advance paid:</b> {s.currency} {num(r.advance)}</div>
        {r.promised_at && <div><b>Expected ready:</b> {fmtDate(r.promised_at)}</div>}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">{s.repair_terms}</p>
      <div className="mt-8 grid grid-cols-2 gap-10 text-center text-xs"><div className="border-t border-slate-400 pt-1">Customer signature</div><div className="border-t border-slate-400 pt-1">Received by</div></div>
    </div>
  );
  return (
    <div className="mx-auto max-w-[210mm] space-y-6 bg-white p-8 text-slate-900">
      <AutoPrint enabled={!!sp.auto} />
      <Copy label="Customer copy" />
      <div className="border-t border-dashed border-slate-400" />
      <Copy label="Shop copy" />
      <div className="inline-block border-2 border-slate-900 p-3 text-sm">
        <div className="text-xl font-bold">{r.number}</div>
        <div>{r.customer_name} · {r.customer_phone}</div>
        <div>{r.device}</div>
      </div>
    </div>
  );
}
