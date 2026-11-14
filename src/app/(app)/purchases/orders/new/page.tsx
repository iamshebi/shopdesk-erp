import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import POForm from "./form";

export default async function NewPO({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("purchases");
  const sp = await searchParams;
  const suppliers = await q<any>("SELECT id, name FROM suppliers ORDER BY name");
  const warehouses = await q<any>("SELECT id, name FROM warehouses WHERE active ORDER BY is_default DESC, name");
  // ?items=12:5,13:10 (from reorder suggestions)
  const want = (sp.items ?? "").split(",").map((x) => x.split(":").map(Number)).filter(([a, b]) => a > 0 && b > 0);
  const prods = want.length ? await q<any>("SELECT id, name, cost FROM products WHERE id = ANY($1)", [want.map(([a]) => a)]) : [];
  const preset = want.map(([id, qty]) => { const p = prods.find((x) => x.id === id); return p ? { product_id: id, name: p.name, qty, unit_cost: Number(p.cost) } : null; }).filter(Boolean) as any[];
  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase request" subtitle="Ask to buy stock. Once approved it becomes a purchase order you can send to the supplier." />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <POForm suppliers={suppliers} warehouses={warehouses} preset={preset} supplierId={Number(sp.supplier) || undefined} />
    </div>
  );
}
