import { one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { num } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import ReportTabs from "@/components/report-tabs";
import PrintButton from "@/components/print-button";

const D = `(s.date AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2`;

function quarter() {
  const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const qs = Math.floor((m - 1) / 3) * 3 + 1;
  const end = new Date(Date.UTC(y, qs + 2, 0)).toISOString().slice(0, 10);
  return { from: `${y}-${String(qs).padStart(2, "0")}-01`, to: end };
}

export default async function VatReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("reports");
  const sp = await searchParams;
  const s = await getSettings();
  const qd = quarter();
  const from = sp.from || qd.from, to = sp.to || qd.to;
  const P = [from, to];
  const SIGN = "CASE WHEN s.type='invoice' THEN 1 ELSE -1 END";
  const out = await one<any>(
    `SELECT COALESCE(sum(${SIGN} * si.net) FILTER (WHERE NOT si.margin_scheme),0) std_net,
            COALESCE(sum(${SIGN} * si.vat) FILTER (WHERE NOT si.margin_scheme),0) std_vat,
            COALESCE(sum(${SIGN} * si.total) FILTER (WHERE si.margin_scheme),0) m_total,
            COALESCE(sum(${SIGN} * si.cost) FILTER (WHERE si.margin_scheme),0) m_cost,
            COALESCE(sum(${SIGN} * si.vat) FILTER (WHERE si.margin_scheme),0) m_vat,
            COALESCE(sum(si.net) FILTER (WHERE s.type='credit_note'),0) cn_net,
            COALESCE(sum(si.vat) FILTER (WHERE s.type='credit_note'),0) cn_vat
     FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${D}`, P);
  const pur = await one<any>("SELECT COALESCE(sum(subtotal) FILTER (WHERE vat > 0),0) net, COALESCE(sum(vat),0) vat, COALESCE(sum(subtotal) FILTER (WHERE vat = 0),0) zero FROM purchases WHERE date BETWEEN $1 AND $2", P);
  const exp = await one<any>("SELECT COALESCE(sum(amount) FILTER (WHERE vat > 0),0) net, COALESCE(sum(vat),0) vat FROM expenses WHERE date BETWEEN $1 AND $2", P);
  const marginNet = out.m_total - out.m_vat - out.m_cost;
  const outputVat = out.std_vat + out.m_vat;
  const inputVat = pur.vat + exp.vat;
  const due = outputVat - inputVat;
  const Row = ({ box, label, amount, vat, strong }: { box: string; label: string; amount?: number; vat?: number; strong?: boolean }) => (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="w-14 text-slate-400">{box}</td><td>{label}</td>
      <td className="text-right tabular-nums">{amount === undefined ? "" : num(amount)}</td>
      <td className="text-right tabular-nums">{vat === undefined ? "" : num(vat)}</td>
    </tr>
  );
  return (
    <div className="max-w-4xl">
      <PageHeader title="VAT return summary" subtitle={`${from} to ${to} · TRN ${s.trn || "not set"}`}><PrintButton /></PageHeader>
      <div className="no-print"><ReportTabs active="/reports/vat" from={from} to={to} /></div>
      <p className="mb-4 text-sm text-slate-500">Figures arranged like the FTA VAT 201 form, to copy into EmaraTax. Credit notes are already netted off. Please have your accountant / tax agent review before filing.</p>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Box</th><th>VAT on sales and all other outputs</th><th className="text-right">Amount ({s.currency})</th><th className="text-right">VAT ({s.currency})</th></tr></thead>
          <tbody>
            <Row box="1" label={`Standard rated supplies in ${s.emirate}`} amount={out.std_net} vat={out.std_vat} />
            {(out.m_total !== 0) && <Row box="1*" label={`Profit margin scheme — taxable margin on used goods (${num(out.m_total)} sold, ${num(out.m_cost)} cost)`} amount={marginNet} vat={out.m_vat} />}
            <Row box="" label="(of which: credit notes for returns, already deducted above)" amount={-out.cn_net} vat={-out.cn_vat} />
            <Row box="8" label="Total output VAT" amount={out.std_net + marginNet} vat={outputVat} strong />
          </tbody>
          <thead><tr><th>Box</th><th>VAT on expenses and all other inputs</th><th></th><th></th></tr></thead>
          <tbody>
            <Row box="9" label="Standard rated expenses — stock purchases" amount={pur.net} vat={pur.vat} />
            <Row box="9" label="Standard rated expenses — shop expenses" amount={exp.net} vat={exp.vat} />
            <Row box="11" label="Total recoverable input VAT" amount={pur.net + exp.net} vat={inputVat} strong />
          </tbody>
          <tbody>
            <tr className="bg-slate-50 text-base font-semibold"><td className="text-slate-400">12–14</td><td>{due >= 0 ? "Net VAT payable to FTA" : "Net VAT refundable"}</td><td></td><td className="text-right tabular-nums">{num(Math.abs(due))}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate-400">* Margin-scheme sales: VAT is due on the profit only (Article 29). Purchases without VAT ({num(pur.zero)}) and used devices bought from individuals carry no input VAT.</p>
    </div>
  );
}
