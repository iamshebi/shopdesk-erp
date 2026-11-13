import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Badge } from "@/components/ui";
import Submit from "@/components/submit";
import { saveArticle, deleteArticle } from "../actions";

export default async function KbPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("support");
  const sp = await searchParams;
  const params: unknown[] = [];
  let where = "";
  if (sp.q) { params.push(`%${sp.q}%`); where = "WHERE title ILIKE $1 OR body ILIKE $1 OR category ILIKE $1"; }
  const arts = await q<any>(`SELECT * FROM kb_articles ${where} ORDER BY category, title`, params);
  const form = (a: any = {}) => (
    <form action={saveArticle} className="grid gap-2">
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]"><input name="title" defaultValue={a.title} placeholder="Question / title" className="input" required /><input name="category" defaultValue={a.category ?? "General"} className="input" placeholder="Category" /></div>
      <textarea name="body" defaultValue={a.body} rows={4} className="input" placeholder="Answer, steps, policy…" />
      <div className="flex items-center gap-3"><label className="flex items-center gap-1 text-sm"><input type="checkbox" name="published" defaultChecked={a.published ?? true} /> Published</label><Submit className="btn-dark btn-sm">Save</Submit></div>
    </form>
  );
  return (
    <div className="max-w-4xl">
      <PageHeader title="Knowledge base" subtitle="FAQs, warranty rules and how-tos your staff can look up" />
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      <details className="card mb-6 p-5"><summary className="cursor-pointer font-semibold">+ New article</summary><div className="mt-4">{form()}</div></details>
      <form className="mb-4"><input name="q" defaultValue={sp.q} placeholder="Search answers…" className="input max-w-sm" /></form>
      <div className="space-y-3">
        {arts.map((a) => (
          <details key={a.id} id={`a${a.id}`} className="card p-5">
            <summary className="cursor-pointer"><span className="font-medium">{a.title}</span> <Badge tone="slate">{a.category}</Badge>{!a.published && <Badge tone="amber">Draft</Badge>}</summary>
            <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</div>
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-accent">Edit</summary><div className="mt-2">{form(a)}</div>
              <form action={deleteArticle} className="mt-2"><input type="hidden" name="id" value={a.id} /><Submit className="btn-danger btn-sm">Delete</Submit></form></details>
          </details>
        ))}
        {arts.length === 0 && <div className="card p-5 text-sm text-slate-400">No articles yet.</div>}
      </div>
    </div>
  );
}
