import { requireUser } from "@/lib/auth";
import { DATASETS } from "@/lib/datasets";
import { PageHeader } from "@/components/ui";
import SettingsTabs from "@/components/settings-tabs";
import ImportForm from "../../products/import/form";
import RestoreForm from "./restore-form";
import { Download, FileSpreadsheet, FileText, DatabaseBackup } from "lucide-react";

export default async function DataPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser("data");
  const sp = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;
  const owner = me.perms.includes("*");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Move data in and out, and keep backups" />
      <SettingsTabs active="/settings/data" />

      <section className="card mb-6 p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">Export</h2><p className="text-sm text-slate-500">Download any list for Excel, your accountant or another system.</p></div>
          <form className="flex gap-2">
            <input type="date" name="from" defaultValue={from} className="input w-40" />
            <input type="date" name="to" defaultValue={to} className="input w-40" />
            <button className="btn-dark">Set dates</button>
          </form>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(DATASETS).map(([k, d]) => (
            <div key={k} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{d.label}</div>
                <div className="text-xs text-slate-400">{d.dated ? `${from} → ${to}` : "All records"}</div>
              </div>
              <div className="flex gap-1">
                <a href={`/api/export/${k}?format=xlsx&from=${from}&to=${to}`} className="btn-ghost btn-sm"><FileSpreadsheet size={14} /> Excel</a>
                <a href={`/api/export/${k}?format=csv&from=${from}&to=${to}`} className="btn-ghost btn-sm"><FileText size={14} /> CSV</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Import products</h2>
          <ImportForm kind="products" />
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Import customers</h2>
          <ImportForm kind="customers" />
        </section>
      </div>

      <section className="card grid gap-6 p-6 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><DatabaseBackup size={18} /> Full backup</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">One file with everything: products, IMEIs, invoices, customers, repairs, staff and settings. The desktop app also saves one automatically every day.</p>
          <a href="/api/backup" className="btn-primary"><Download size={16} /> Download backup now</a>
        </div>
        <div>
          <h2 className="font-semibold text-red-700">Restore from backup</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">Replaces <b>all</b> current data with the backup file. Use it when moving to a new computer or recovering. Owner only.</p>
          {owner ? <RestoreForm /> : <p className="text-sm text-slate-400">Ask the owner to do this.</p>}
        </div>
      </section>
    </div>
  );
}
