"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { importProducts } from "../actions";

export default function ImportForm() {
  const [state, action, pending] = useActionState(importProducts, null);
  const [csv, setCsv] = useState("");
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="file" accept=".csv,.txt,.tsv" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
      <textarea name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={10} className="input font-mono text-xs" placeholder="…or paste CSV here" />
      <div className="text-xs text-slate-500">{csv ? `${csv.split(/\r?\n/).filter((l) => l.trim()).length} lines ready` : ""}</div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.count ? <p className="text-sm text-emerald-700">Imported {state.count} products. <Link href="/products" className="link">View stock →</Link></p> : null}
      <button className="btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
    </form>
  );
}
