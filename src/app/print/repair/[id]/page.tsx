import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import AutoPrint from "@/components/auto-print";
import { receiptPaper, receiptPageCss } from "@/lib/print";
import { code128Svg } from "@/lib/barcode";

export default async function PrintRepair({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const r = await one<any>("SELECT * FROM repairs WHERE id=$1", [Number(id)]);
  if (!r) notFound();

  // Thermal ticket: customer slip, then (after the cut line) a small tag to stick on the device.
  if (sp.format === "thermal") {
    const paper = receiptPaper(s.receipt_width);
    const bar = code128Svg(r.number, { height: 40 });
    const Bar = () => <><div className="mx-auto h-[10mm] w-[85%] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: bar }} /><div className="text-center text-[9px]">{r.number}</div></>;
    return (
      <div data-receipt className={`mx-auto bg-white p-2 font-mono leading-snug text-black ${paper.paper === 58 ? "text-[10px]" : "text-[11px]"}`}>
        <AutoPrint enabled={!!sp.auto} kind="receipt" size={paper.size} />
        <style>{receiptPageCss(s.receipt_width)}</style>
        <div className="text-center">
          <div className="text-sm font-bold">{s.shop_name}</div>
          {s.phone && <div>Tel {s.phone}</div>}
          <div className="my-1 border-y border-dashed border-black py-1 font-bold">REPAIR JOB · {r.number}</div>
        </div>
        <div>Date: {fmtDate(r.created_at, true)}</div>
        <div>Customer: {r.customer_name}</div>
        <div>Phone: {r.customer_phone}</div>
        <div className="my-1 border-t border-dashed border-black" />
        <div>Device: {r.device}</div>
        {r.imei && <div>IMEI: {r.imei}</div>}
        <div>Problem: {r.issue}</div>
        {r.accessories && <div>Accessories: {r.accessories}</div>}
        {r.condition_notes && <div>Condition: {r.condition_notes}</div>}
        <div className="my-1 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>Estimate</span><span>{s.currency} {num(r.estimate)}</span></div>
        <div className="flex justify-between"><span>Advance paid</span><span>{num(r.advance)}</span></div>
        {r.promised_at && <div className="flex justify-between font-bold"><span>Ready by</span><span>{fmtDate(r.promised_at)}</span></div>}
        {s.repair_terms && <div className="mt-2 text-[9px]">{s.repair_terms}</div>}
        <div className="mt-2">Bring this slip to collect your device.</div>
        <div className="mt-2"><Bar /></div>
        <div className="my-3 text-center text-[9px]">- - - - - - - - ✂ device tag - - - - - - - -</div>
        <div className="border-2 border-black p-1.5">
          <div className="text-center text-base font-bold">{r.number}</div>
          <div>{r.customer_name} · {r.customer_phone}</div>
          <div>{r.device}</div>
          <div className="truncate">{r.issue}</div>
          <Bar />
        </div>
      </div>
    );
  }

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
