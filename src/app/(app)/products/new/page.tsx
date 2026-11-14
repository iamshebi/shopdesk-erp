import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ProductForm from "@/components/product-form";
import { createProduct } from "../actions";
import CustomFieldInputs from "@/components/custom-fields-inputs";
import { customFields } from "@/lib/custom-fields";

export default async function NewProduct({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const cfs = await customFields("products");
  const user = await requireUser("products.edit");
  const cats = await q<{ v: string }>("SELECT DISTINCT category v FROM products WHERE category <> '' ORDER BY 1");
  const brands = await q<{ v: string }>("SELECT DISTINCT brand v FROM products WHERE brand <> '' ORDER BY 1");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add product" />
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <ProductForm action={createProduct} categories={cats.map((c) => c.v)} brands={brands.map((b) => b.v)} isNew showCost={can(user, "products.cost")} extra={cfs.length ? <CustomFieldInputs fields={cfs} /> : null} />
    </div>
  );
}
