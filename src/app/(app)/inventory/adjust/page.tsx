import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import StockLinesForm from "@/components/stock-lines-form";
import InventoryTabs from "../tabs";
import { createAdjustment } from "../actions";

const REASONS: [string, string][] = [
  ["adjust", "Correction (+ or −)"], ["damaged", "Damaged (removes)"], ["lost", "Lost / stolen (removes)"], ["found", "Found (adds)"],
  ["supplier_return", "Returned to supplier (removes)"], ["writeoff", "Write off (removes)"],
];

export default async function AdjustPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("stock.adjust");
  const sp = await searchParams;
  const whs = await q<any>("SELECT id, name, is_default FROM warehouses WHERE active ORDER BY is_default DESC, name");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Inventory" subtitle="Correct stock with a reason: damaged, lost, found or returned to supplier" />
      <InventoryTabs active="/inventory/adjust" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <StockLinesForm action={createAdjustment} mode="adjust" warehouses={whs} reasons={REASONS} />
    </div>
  );
}
