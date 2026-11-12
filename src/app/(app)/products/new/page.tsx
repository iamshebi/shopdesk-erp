import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ProductForm from "@/components/product-form";
import { createProduct } from "../actions";

export default async function NewProduct() {
  const user = await requireUser("products.edit");
  const cats = await q<{ v: string }>("SELECT DISTINCT category v FROM products WHERE category <> '' ORDER BY 1");
  const brands = await q<{ v: string }>("SELECT DISTINCT brand v FROM products WHERE brand <> '' ORDER BY 1");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add product" />
      <ProductForm action={createProduct} categories={cats.map((c) => c.v)} brands={brands.map((b) => b.v)} isNew showCost={can(user, "products.cost")} />
    </div>
  );
}
