import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MOVE_TYPES } from "@/lib/inventory";
import { fmtDate, todayDubai } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import InventoryTabs from "../tabs";

const TONE: Record<string, string> = { sale: "blue", purchase: "green", return: "amber", transfer_in: "violet", transfer_out: "violet", damaged: "red", lost: "red", writeoff: "red", count: "amber" };

export default async function MovesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("products.view");
  const sp = await searchParams;
  const from = sp.from || new Date(Date.now() - 29 * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const to = sp.to || todayDubai();
  const params: unknown[] = [from, to];
  const where = ["(m.created_at AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2"];
  if (sp.wh) { params.push(Number(sp.wh)); where.push(`m.warehouse_id = $${params.length}`); }
  if (sp.type) { params.push(sp.type); where.push(`m.type = $${params.length}`); }
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(p.name ILIKE $${params.length} OR m.ref ILIKE $${params.length} OR un.imei ILIKE $${params.length})`); }
  if (sp.product) { params.push(Number(sp.product)); where.push(`m.product_id = $${params.length}`); }
  const rows = await q<any>(
    `SELECT m.*, p.name, p.brand, w.name wh, u.name by_name, un.imei FROM stock_moves m JOIN products p ON p.id=m.product_id
     LEFT JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN users u ON u.id=m.user_id LEFT JOIN units un ON un.id=m.unit_id
     WHERE ${where.join(" AND ")} ORDER BY m.id DESC LIMIT 500`,
    params,
  );
  const whs = await q<any>("SELECT id, name FROM warehouses ORDER BY name");
  return (
    <div className="max-w-6xl">
      <PageHeader title="Inventory" subtitle="Every stock movement: sales, purchases, returns, transfers, adjustments and counts" />
      <InventoryTabs active="/inventory/moves" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Product, IMEI or reference" className="input w-56" />
        <select name="wh" defaultValue={sp.wh ?? ""} className="input w-44"><option value="">All warehouses</option>{whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input w-48"><option value="">All movement types</option>{Object.entries(MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="date" name="from" defaultValue={from} className="input w-40" />
        <input type="date" name="to" defaultValue={to} className="input w-40" />
        <button className="btn-dark">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No stock movements in this period.</Empty> : (
          <table className="tbl">
            <thead><tr><th>When</th><th>Product</th><th>Warehouse</th><th>Type</th><th className="text-right">Qty</th><th>Reference</th><th>Staff</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(m.created_at, true)}</td>
                  <td><Link href={`/products/${m.product_id}`} className="font-medium hover:text-accent">{m.brand ? `${m.brand} ` : ""}{m.name}</Link>{m.imei && <div className="font-mono text-xs text-slate-400">{m.imei}</div>}{m.reason && <div className="text-xs text-slate-400">{m.reason}</div>}</td>
                  <td>{m.wh}</td>
                  <td><Badge tone={TONE[m.type] ?? "slate"}>{MOVE_TYPES[m.type] ?? m.type}</Badge></td>
                  <td className={`text-right tabular-nums font-medium ${m.qty < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td className="font-mono text-xs">{m.ref}</td>
                  <td>{m.by_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
