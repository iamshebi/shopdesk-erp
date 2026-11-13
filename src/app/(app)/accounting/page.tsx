import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ensureLedger } from "@/lib/accounting";
import { period } from "@/lib/period";
import { num } from "@/lib/util";
import { PageHeader, Stat } from "@/components/ui";
import AccountingTabs, { Period } from "./tabs";

export default async function AccountingHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser("accounting");
  await ensureLedger();
  const sp = await searchParams;
  const s = await getSettings();
  const { from, to } = period(sp);
  const pl = await one<any>(
    `SELECT COALESCE(sum(CASE WHEN a.type='income' THEN l.credit - l.debit END),0) income,
            COALESCE(sum(CASE WHEN a.system_key='cogs' THEN l.debit - l.credit END),0) cogs,
            COALESCE(sum(CASE WHEN a.type='expense' AND a.system_key<>'cogs' THEN l.debit - l.credit END),0) expenses
     FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id WHERE e.date BETWEEN $1 AND $2`,
    [from, to],
  );
  const bal = await q<any>(
    `SELECT a.system_key, a.is_bank, a.name, a.type, COALESCE(sum(CASE WHEN e.id IS NOT NULL THEN l.debit - l.credit END),0) dr FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
     LEFT JOIN journal_entries e ON e.id=l.entry_id AND e.date <= $1 WHERE a.system_key IN ('cash','card','bank','tabby','tamara','ar','ap','vat_in','vat_out','inventory') OR a.is_bank
     GROUP BY a.id ORDER BY a.code`,
    [to],
  );
  const k = (key: string) => Number(bal.find((b) => b.system_key === key)?.dr ?? 0);
  const money = bal.filter((b) => ["cash", "card", "bank", "tabby", "tamara"].includes(b.system_key) || b.is_bank);
  const gross = Number(pl.income) - Number(pl.cogs);
  const net = gross - Number(pl.expenses);
  return (
    <div className="max-w-6xl">
      <PageHeader title="Accounting" subtitle="Double-entry books posted automatically from every invoice, payment, purchase, expense and stock change" />
      <AccountingTabs active="/accounting" />
      <Period from={from} to={to} path="/accounting" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Income (net of VAT and returns)" value={`${s.currency} ${num(pl.income)}`} href={`/accounting/pl?from=${from}&to=${to}`} />
        <Stat label="Gross profit" value={`${s.currency} ${num(gross)}`} hint={`cost of goods ${num(pl.cogs)}`} href={`/accounting/pl?from=${from}&to=${to}`} />
        <Stat label="Expenses" value={`${s.currency} ${num(pl.expenses)}`} hint="incl. stock losses" href={`/accounting/pl?from=${from}&to=${to}`} />
        <Stat label="Net profit" value={`${s.currency} ${num(net)}`} hint={Number(pl.income) ? `${((net / Number(pl.income)) * 100).toFixed(1)}% of income` : ""} href={`/accounting/pl?from=${from}&to=${to}`} />
      </div>
      <h2 className="mb-3 font-semibold">Balances on {to}</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {money.map((b) => <Stat key={b.name} label={b.name} value={`${s.currency} ${num(b.dr)}`} href={`/accounting/ledger?account=${encodeURIComponent(b.name)}`} />)}
        <Stat label="Customers owe (receivable)" value={`${s.currency} ${num(k("ar"))}`} href="/customers?due=1" />
        <Stat label="We owe suppliers (payable)" value={`${s.currency} ${num(-k("ap"))}`} href="/suppliers" />
        <Stat label="VAT to pay (output − input)" value={`${s.currency} ${num(-k("vat_out") - k("vat_in"))}`} href="/reports/vat" />
        <Stat label="Inventory at cost" value={`${s.currency} ${num(k("inventory"))}`} href="/reports/stock" />
      </div>
      <p className="text-sm text-slate-500">Need to record owner money, a loan or a correction? Use <Link href="/accounting/journal" className="link">Journal entries</Link>. Card and Tabby balances fall when you record the settlement into the bank with a journal entry.</p>
    </div>
  );
}
