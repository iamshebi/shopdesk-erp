import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { Plus } from "lucide-react";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("purchases");
  const sp = await searchParams;
  const params: unknown[] = [];
  let where = "";
  if (sp.supplier) { params.push(Number(sp.supplier)); where = "WHERE p.supplier_id = $1"; }
  const rows = await q<any>(
    `SELECT p.*, s.name supplier FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id ${where} ORDER BY p.date DESC, p.id DESC LIMIT 300`,
    params,
  );
  return (
    <div>
      <PageHeader title="Purchases" subtitle="Stock bought from suppliers">
        <Link href="/purchases/new" className="btn-primary"><Plus size={16} /> New purchase</Link>
      </PageHeader>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No purchases yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Date</th><th>Supplier</th><th>Bill ref</th><th className="text-right">VAT</th><th className="text-right">Total</th><th className="text-right">Status</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/purchases/${p.id}`} className="font-medium hover:text-accent">{p.number}</Link></td>
                  <td>{fmtDate(p.date)}</td>
                  <td>{p.supplier ?? "—"}</td>
                  <td className="text-slate-500">{p.bill_ref}</td>
                  <td className="text-right tabular-nums">{num(p.vat)}</td>
                  <td className="text-right tabular-nums font-medium">{num(p.total)}</td>
                  <td className="text-right">{p.paid >= p.total ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Owe {num(p.total - p.paid)}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
