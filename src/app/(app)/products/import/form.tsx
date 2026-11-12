"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { importProducts } from "../actions";

export default function ImportForm({ kind = "products" }: { kind?: "products" | "customers" }) {
  const [state, action, pending] = useActionState(importProducts, null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="hidden" name="kind" value={kind} />
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 p-6 text-sm text-slate-500 transition hover:border-accent hover:bg-accent/5">
        <span className="font-medium text-slate-700">{fileName || "Choose an Excel (.xlsx) or CSV file"}</span>
        <span className="text-xs">or paste rows below</span>
        <input type="file" name="file" accept=".xlsx,.csv,.txt,.tsv" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
      </label>
      <textarea name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} className="input font-mono text-xs"
        placeholder={kind === "customers" ? "name,phone,email,trn,address" : "name,brand,category,sku,barcode,cost,price,qty,serial"} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.count ? <p className="text-sm text-emerald-700">Imported {state.count} {kind}. <Link href={kind === "customers" ? "/customers" : "/products"} className="link">View →</Link></p> : null}
      <button className="btn-primary" disabled={pending}>{pending ? "Importing…" : `Import ${kind}`}</button>
    </form>
  );
}
