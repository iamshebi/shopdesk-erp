import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import StockLinesForm from "@/components/stock-lines-form";
import InventoryTabs from "../tabs";
import { createTransfer } from "../actions";
import Link from "next/link";

export default async function TransferPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("stock.adjust");
  const sp = await searchParams;
  const whs = await q<any>("SELECT id, name, is_default FROM warehouses WHERE active ORDER BY is_default DESC, name");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Inventory" subtitle="Move stock from one location to another" />
      <InventoryTabs active="/inventory/transfer" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      {whs.length < 2 ? (
        <div className="card p-6 text-sm text-slate-500">You need at least two warehouses to transfer stock. <Link href="/inventory" className="link">Add a warehouse</Link>.</div>
      ) : (
        <StockLinesForm action={createTransfer} mode="transfer" warehouses={whs} />
      )}
    </div>
  );
}
