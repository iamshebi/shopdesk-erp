import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function BuybackPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("buyback");
  const sp = await searchParams;
  const params: unknown[] = [];
  let where = "";
  if (sp.q) { params.push(`%${sp.q}%`); where = "WHERE b.seller_name ILIKE $1 OR b.seller_phone ILIKE $1 OR b.imei ILIKE $1 OR b.id_number ILIKE $1 OR b.number ILIKE $1"; }
  const rows = await q<any>(
    `SELECT b.*, p.name model, u.status unit_status, s.number sale_no, s.id sale_id, si.total sold_for
     FROM buybacks b JOIN products p ON p.id=b.product_id
     LEFT JOIN units u ON u.buyback_id=b.id LEFT JOIN sales s ON s.id=u.sale_id
     LEFT JOIN sale_items si ON si.unit_id = u.id AND si.sale_id = s.id
     ${where} ORDER BY b.created_at DESC LIMIT 300`,
    params,
  );
  return (
    <div>
      <PageHeader title="Buy used" subtitle="Second-hand devices bought from customers">
        <Link href="/buyback/new" className="btn-primary"><Plus size={16} /> Buy a device</Link>
      </PageHeader>
      <form className="mb-4"><input name="q" defaultValue={sp.q} placeholder="Search seller, ID number, IMEI…" className="input max-w-sm" /></form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No used devices bought yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Date</th><th>Seller</th><th>Device</th><th className="text-right">Paid</th><th>Status</th><th className="text-right">Profit</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><a href={`/print/buyback/${b.id}`} target="_blank" className="font-medium hover:text-accent">{b.number}</a></td>
                  <td className="text-slate-500">{fmtDate(b.created_at)}</td>
                  <td>{b.seller_name}<div className="text-xs text-slate-400">{b.id_type} {b.id_number}</div></td>
                  <td>{b.model}<div className="font-mono text-xs text-slate-400">{b.imei}</div></td>
                  <td className="text-right tabular-nums">{num(b.price_paid)}</td>
                  <td>{b.unit_status === "sold" ? <Link href={`/sales/${b.sale_id}`}><Badge tone="slate">Sold · {b.sale_no}</Badge></Link> : <Badge tone={b.unit_status === "in_stock" ? "green" : "red"}>{(b.unit_status ?? "").replace("_", " ")}</Badge>}</td>
                  <td className="text-right tabular-nums">{b.sold_for ? num(b.sold_for - b.price_paid) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
