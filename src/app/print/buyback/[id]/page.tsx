import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import AutoPrint from "@/components/auto-print";

export default async function PrintBuyback({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSettings();
  const b = await one<any>("SELECT b.*, p.name model, u.name staff FROM buybacks b JOIN products p ON p.id=b.product_id LEFT JOIN users u ON u.id=b.created_by WHERE b.id=$1", [Number(id)]);
  if (!b) notFound();
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-slate-900">
      <AutoPrint enabled={!!sp.auto} />
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo && <img src={s.logo} alt="" className="h-14 object-contain" />}
          <div><div className="text-xl font-bold">{s.shop_name}</div><div className="text-slate-600">{[s.address, s.emirate].filter(Boolean).join(", ")} · {s.phone}</div>{s.trn && <div>TRN {s.trn}</div>}</div>
        </div>
        <div className="text-right"><div className="text-lg font-bold uppercase">Used Device Purchase</div><div className="text-lg">{b.number}</div><div>{fmtDate(b.created_at, true)}</div></div>
      </div>
      <h3 className="mt-6 font-semibold uppercase text-slate-500">Seller</h3>
      <table className="mt-2 w-full"><tbody>
        <tr><td className="w-48 py-1 text-slate-500">Name</td><td>{b.seller_name}</td></tr>
        <tr><td className="py-1 text-slate-500">{b.id_type} no.</td><td className="font-mono">{b.id_number}</td></tr>
        <tr><td className="py-1 text-slate-500">Nationality</td><td>{b.nationality || "—"}</td></tr>
        <tr><td className="py-1 text-slate-500">Phone</td><td>{b.seller_phone}</td></tr>
      </tbody></table>
      <h3 className="mt-6 font-semibold uppercase text-slate-500">Device</h3>
      <table className="mt-2 w-full"><tbody>
        <tr><td className="w-48 py-1 text-slate-500">Model</td><td>{b.model}</td></tr>
        <tr><td className="py-1 text-slate-500">IMEI</td><td className="font-mono">{b.imei}</td></tr>
        <tr><td className="py-1 text-slate-500">Condition</td><td>{b.condition || "—"}</td></tr>
        <tr><td className="py-1 text-slate-500">Amount paid</td><td className="font-semibold">{s.currency} {num(b.price_paid)} ({b.payment_method})</td></tr>
      </tbody></table>
      <div className="mt-8 rounded-lg border border-slate-300 p-4 leading-relaxed">
        I, <b>{b.seller_name}</b>, confirm that I am the lawful owner of the device described above, that it is not stolen, lost, financed or
        under any contract, and that I sell it to {s.legal_name || s.shop_name} of my own free will for the amount stated. I accept full legal
        responsibility if any of this is untrue. I confirm I have removed my accounts (iCloud / Google) and personal data.
      </div>
      <div className="mt-16 grid grid-cols-3 gap-10 text-center text-xs">
        <div className="border-t border-slate-400 pt-1">Seller signature</div>
        <div className="border-t border-slate-400 pt-1">Seller thumbprint / ID copy attached</div>
        <div className="border-t border-slate-400 pt-1">For {s.shop_name} ({b.staff})</div>
      </div>
    </div>
  );
}
