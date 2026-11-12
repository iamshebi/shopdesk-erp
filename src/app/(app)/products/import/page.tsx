import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ImportForm from "./form";

export default async function ImportPage() {
  await requireUser("products");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Import products" subtitle="Bring in a shop's full item list from Excel, their old software, or a CSV" />
      <div className="card mb-4 p-5 text-sm text-slate-600">
        <p className="mb-2">Save the sheet as <b>CSV</b>. A header row is recommended — columns are matched by name:</p>
        <code className="block rounded-lg bg-slate-50 p-3 text-xs">name, brand, category, sku, barcode, cost, price, qty, serial</code>
        <p className="mt-2 text-xs text-slate-500">Set <b>serial</b> to “yes” for phones tracked by IMEI (add the IMEIs afterwards or through a purchase). Without a header, columns are read in the order above.</p>
      </div>
      <ImportForm />
    </div>
  );
}
