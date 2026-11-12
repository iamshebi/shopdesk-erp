import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, repairLabel } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default async function ImeiPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("imei");
  const sp = await searchParams;
  const t = (sp.q ?? "").trim();
  let events: { date: string; kind: string; text: React.ReactNode; tone: string }[] = [];
  let units: any[] = [];
  if (t.length >= 4) {
    const like = `%${t}%`;
    units = await q<any>("SELECT u.*, p.name FROM units u JOIN products p ON p.id=u.product_id WHERE u.imei ILIKE $1 OR u.imei2 ILIKE $1 ORDER BY u.created_at", [like]);
    const purchases = await q<any>("SELECT u.imei, pu.id, pu.number, pu.date, s.name supplier FROM units u JOIN purchases pu ON pu.id=u.purchase_id LEFT JOIN suppliers s ON s.id=pu.supplier_id WHERE u.imei ILIKE $1", [like]);
    const buys = await q<any>("SELECT * FROM buybacks WHERE imei ILIKE $1", [like]);
    const sold = await q<any>("SELECT si.imei, s.id, s.number, s.type, s.date, s.customer_name, s.customer_phone, si.total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.imei ILIKE $1", [like]);
    const reps = await q<any>("SELECT * FROM repairs WHERE imei ILIKE $1", [like]);
    events = [
      ...purchases.map((p) => ({ date: p.date, kind: "Purchased", tone: "blue", text: <>From {p.supplier ?? "—"} on <Link className="link" href={`/purchases/${p.id}`}>{p.number}</Link> · <span className="font-mono">{p.imei}</span></> })),
      ...buys.map((b) => ({ date: b.created_at, kind: "Bought used", tone: "violet", text: <>From {b.seller_name} ({b.id_type} {b.id_number}) for {num(b.price_paid)} · {b.number}</> })),
      ...sold.map((s) => ({ date: s.date, kind: s.type === "invoice" ? "Sold" : "Returned", tone: s.type === "invoice" ? "green" : "amber", text: <>{s.customer_name || "Walk-in"} {s.customer_phone} · <Link className="link" href={`/sales/${s.id}`}>{s.number}</Link> · {num(s.total)}</> })),
      ...reps.map((r) => ({ date: r.created_at, kind: "Repair", tone: "slate", text: <><Link className="link" href={`/repairs/${r.id}`}>{r.number}</Link> · {r.device} · {r.issue} · {repairLabel(r.status)}</> })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return (
    <div className="max-w-3xl">
      <PageHeader title="IMEI lookup" subtitle="Full history of any phone: where it came from, who bought it, repairs and returns" />
      <form className="mb-6 flex gap-2"><input name="q" defaultValue={t} placeholder="Scan or type IMEI / serial (at least 4 digits)" className="input h-12 font-mono text-base" autoFocus /><button className="btn-dark h-12">Search</button></form>
      {t && (
        <div className="space-y-6">
          {units.map((u) => (
            <div key={u.id} className="card flex items-center justify-between p-5">
              <div><Link href={`/products/${u.product_id}`} className="font-semibold hover:text-accent">{u.name}</Link><div className="font-mono text-xs text-slate-500">{u.imei}</div></div>
              <Badge tone={u.status === "in_stock" ? "green" : u.status === "sold" ? "slate" : "red"}>{u.status.replace("_", " ")}</Badge>
            </div>
          ))}
          {events.length === 0 ? <div className="card"><Empty>No record of this IMEI.</Empty></div> : (
            <ol className="card space-y-4 border-l-0 p-6">
              {events.map((e, i) => (
                <li key={i} className="flex gap-4 text-sm">
                  <div className="w-28 shrink-0 text-xs text-slate-400">{fmtDate(e.date, true)}</div>
                  <div><Badge tone={e.tone}>{e.kind}</Badge><div className="mt-1">{e.text}</div></div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
