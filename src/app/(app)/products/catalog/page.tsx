import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import Submit from "@/components/submit";
import { saveCategory, deleteCategory, saveBrand, deleteBrand } from "./actions";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser("products.view");
  const sp = await searchParams;
  const edit = can(user, "products.edit");
  // Pick up names typed straight on products so the lists are always complete.
  await q("INSERT INTO categories (name) SELECT DISTINCT category FROM products WHERE category <> '' ON CONFLICT DO NOTHING");
  await q("INSERT INTO brands (name) SELECT DISTINCT brand FROM products WHERE brand <> '' ON CONFLICT DO NOTHING");
  const cats = await q<any>("SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category=c.name AND p.active) n FROM categories c ORDER BY c.name");
  const brands = await q<any>("SELECT b.*, (SELECT count(*)::int FROM products p WHERE p.brand=b.name AND p.active) n FROM brands b ORDER BY b.name");
  const kids = (pid: number | null) => cats.filter((c) => (c.parent_id ?? null) === pid);
  const Row = ({ c, depth }: { c: any; depth: number }) => (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm" style={{ paddingLeft: depth * 20 }}>
        <Link href={`/products?cat=${encodeURIComponent(c.name)}`} className="hover:text-accent">{depth > 0 && "↳ "}{c.name} <span className="text-xs text-slate-400">{c.n}</span></Link>
        {edit && <details className="relative"><summary className="cursor-pointer text-xs text-accent">Edit</summary>
          <div className="absolute right-0 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <form action={saveCategory} className="space-y-2"><input type="hidden" name="id" value={c.id} /><input name="name" defaultValue={c.name} className="input" />
              <select name="parent_id" defaultValue={c.parent_id ?? ""} className="input"><option value="">Top level</option>{cats.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>Inside {x.name}</option>)}</select><Submit className="btn-dark btn-sm">Save</Submit></form>
            <form action={deleteCategory} className="mt-2"><input type="hidden" name="id" value={c.id} /><Submit className="btn-ghost btn-sm" confirm={`Delete category ${c.name}?`}>Delete</Submit></form>
          </div></details>}
      </div>
      {kids(c.id).map((k) => <Row key={k.id} c={k} depth={depth + 1} />)}
    </>
  );
  return (
    <div className="max-w-5xl">
      <PageHeader title="Categories & brands" subtitle="Organise the catalogue. Renaming here renames it on every product."><Link href="/products" className="btn-ghost">Products</Link></PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Categories &amp; subcategories</h3>
          {edit && <form action={saveCategory} className="mb-3 flex gap-2"><input name="name" placeholder="New category" className="input" required /><select name="parent_id" className="input w-44"><option value="">Top level</option>{cats.map((x) => <option key={x.id} value={x.id}>Inside {x.name}</option>)}</select><Submit className="btn-primary btn-sm">Add</Submit></form>}
          {kids(null).map((c) => <Row key={c.id} c={c} depth={0} />)}
          {cats.length === 0 && <p className="text-sm text-slate-400">No categories yet</p>}
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Brands</h3>
          {edit && <form action={saveBrand} className="mb-3 flex gap-2"><input name="name" placeholder="New brand" className="input" required /><Submit className="btn-primary btn-sm">Add</Submit></form>}
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm">
              <Link href={`/products?brand=${encodeURIComponent(b.name)}`} className="hover:text-accent">{b.name} <span className="text-xs text-slate-400">{b.n}</span></Link>
              {edit && <details className="relative"><summary className="cursor-pointer text-xs text-accent">Edit</summary>
                <div className="absolute right-0 z-10 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <form action={saveBrand} className="space-y-2"><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} className="input" /><input name="website" defaultValue={b.website} placeholder="Website" className="input" /><Submit className="btn-dark btn-sm">Save</Submit></form>
                  <form action={deleteBrand} className="mt-2"><input type="hidden" name="id" value={b.id} /><Submit className="btn-ghost btn-sm" confirm={`Delete brand ${b.name}?`}>Delete</Submit></form>
                </div></details>}
            </div>
          ))}
          {brands.length === 0 && <p className="text-sm text-slate-400">No brands yet</p>}
        </div>
      </div>
    </div>
  );
}
