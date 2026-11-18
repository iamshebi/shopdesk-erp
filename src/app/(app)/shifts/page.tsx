import Link from "next/link";
import { q } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate, num } from "@/lib/util";
import { PageHeader, Badge, Empty } from "@/components/ui";
import Submit from "@/components/submit";
import PrintButton from "@/components/print-button";
import { openShiftOf, shiftTotals, shiftMoves } from "@/lib/shifts";
import { openShift, addCashMove, closeShift, setRequireShift } from "./actions";

function Diff({ v }: { v: number }) {
  if (Math.abs(v) < 0.005) return <Badge tone="green">Exact</Badge>;
  return v > 0 ? <Badge tone="amber">Over {num(v)}</Badge> : <Badge tone="red">Short {num(-v)}</Badge>;
}

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser(["pos", "shifts.all"]);
  const sp = await searchParams;
  const s = await getSettings();
  const all = can(user, "shifts.all");
  const mine = can(user, "pos") ? await openShiftOf(user.id) : undefined;
  const t = mine ? await shiftTotals(mine) : null;
  const moves = mine ? await shiftMoves(mine.id) : [];
  const others = all ? await q<any>("SELECT s.*, u.name staff FROM cash_shifts s JOIN users u ON u.id=s.user_id WHERE s.closed_at IS NULL AND s.user_id<>$1 ORDER BY s.opened_at", [user.id]) : [];
  const othersT = await Promise.all(others.map((o) => shiftTotals(o)));
  const history = await q<any>(
    `SELECT s.*, u.name staff, c.name closed_by_name FROM cash_shifts s JOIN users u ON u.id=s.user_id LEFT JOIN users c ON c.id=s.closed_by
     WHERE s.closed_at IS NOT NULL ${all ? "" : "AND s.user_id=$1"} ORDER BY s.closed_at DESC LIMIT 60`,
    all ? [] : [user.id],
  );
  const closed = sp.closed ? history.find((h) => h.id === Number(sp.closed)) : null;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Cash shift" subtitle={mine ? `Open since ${fmtDate(mine.opened_at, true)}${mine.counter ? ` · ${mine.counter}` : ""}` : "Open a shift at the start of the day, close it when you hand over the drawer"}>
        <PrintButton />
      </PageHeader>
      {sp.ok && <div className="card mb-4 bg-emerald-50 p-3 text-sm text-emerald-700">{sp.ok}</div>}
      {sp.err && <div className="card mb-4 bg-red-50 p-3 text-sm text-red-700">{sp.err}</div>}
      {sp.need && <div className="card mb-4 bg-amber-50 p-3 text-sm text-amber-800">Open your cash shift before making a sale.</div>}

      {closed && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold">Shift closed: {closed.staff}</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div><div className="label">Expected cash</div><div className="text-xl font-semibold tabular-nums">{num(closed.expected_cash)}</div></div>
            <div><div className="label">Counted cash</div><div className="text-xl font-semibold tabular-nums">{num(closed.counted_cash)}</div></div>
            <div><div className="label">Difference</div><div className="mt-1"><Diff v={closed.counted_cash - closed.expected_cash} /></div></div>
            <div><div className="label">Closed</div><div className="text-sm">{fmtDate(closed.closed_at, true)}</div></div>
          </div>
        </section>
      )}

      {can(user, "pos") && !mine && (
        <form action={openShift} className="card mb-6 grid gap-3 p-5 sm:grid-cols-4">
          <h2 className="font-semibold sm:col-span-4">Open my shift</h2>
          <label className="text-sm">Counter<input name="counter" placeholder="Counter 1" className="input mt-1" /></label>
          <label className="text-sm">Cash in drawer now (AED)<input name="opening_float" defaultValue="0" inputMode="decimal" className="input mt-1" required /></label>
          <div className="flex items-end sm:col-span-2"><Submit>Open shift</Submit></div>
        </form>
      )}

      {mine && t && (
        <>
          <section className="card mb-4 grid gap-4 p-5 sm:grid-cols-4">
            <div><div className="label">Expected in drawer</div><div className="text-2xl font-semibold tabular-nums">{num(t.expected)}</div></div>
            <div><div className="label">Cash sales</div><div className="text-xl tabular-nums">{num(t.sales)}</div><div className="text-xs text-slate-500">{t.invoices} invoices</div></div>
            <div><div className="label">Card, bank and others</div><div className="text-xl tabular-nums">{num(t.card)}</div><div className="text-xs text-slate-500">not in the drawer</div></div>
            <div><div className="label">Opening float</div><div className="text-xl tabular-nums">{num(mine.opening_float)}</div></div>
          </section>
          <div className="card mb-4 overflow-x-auto">
            <table className="tbl">
              <tbody>
                <tr><td>Opening float</td><td className="text-right tabular-nums">{num(mine.opening_float)}</td></tr>
                <tr><td>+ Cash sales</td><td className="text-right tabular-nums">{num(t.sales)}</td></tr>
                <tr><td>− Cash refunds</td><td className="text-right tabular-nums">{num(t.refunds)}</td></tr>
                <tr><td>− Used phones bought in cash</td><td className="text-right tabular-nums">{num(t.buybacks)}</td></tr>
                <tr><td>− Expenses and supplier payments in cash</td><td className="text-right tabular-nums">{num(t.expenses + t.suppliers)}</td></tr>
                <tr><td>+ Cash put in · − Cash taken out</td><td className="text-right tabular-nums">{num(t.cashIn - t.cashOut)}</td></tr>
                <tr className="font-semibold"><td>Expected in drawer</td><td className="text-right tabular-nums">{num(t.expected)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <form action={addCashMove} className="card grid gap-3 p-5">
              <h2 className="font-semibold">Cash in or out of the drawer</h2>
              <div className="grid grid-cols-2 gap-3">
                <select name="kind" className="input"><option value="out">Take cash out</option><option value="in">Put cash in</option></select>
                <input name="amount" placeholder="Amount" inputMode="decimal" className="input" required />
              </div>
              <input name="reason" placeholder="Reason: change from bank, petrol, paid to owner…" className="input" required />
              <Submit>Save</Submit>
              {moves.length > 0 && (
                <ul className="divide-y text-sm">
                  {moves.map((m) => <li key={m.id} className="flex justify-between py-1.5"><span>{m.kind === "in" ? "In" : "Out"} · {m.reason} · {fmtDate(m.created_at, true)}</span><span className="tabular-nums">{m.kind === "in" ? "+" : "−"}{num(m.amount)}</span></li>)}
                </ul>
              )}
            </form>
            <form action={closeShift} className="card grid gap-3 p-5">
              <h2 className="font-semibold">Close my shift</h2>
              <input type="hidden" name="id" value={mine.id} />
              <label className="text-sm">Cash counted in the drawer (AED)<input name="counted_cash" inputMode="decimal" className="input mt-1" required /></label>
              <input name="notes" placeholder="Note (optional)" className="input" />
              <Submit confirm="Close the shift with this cash count?">Close shift</Submit>
              <p className="text-xs text-slate-500">Count the cash before you look at the expected amount above; the difference is saved for the owner.</p>
            </form>
          </div>
        </>
      )}

      {others.length > 0 && (
        <section className="card mb-6 overflow-x-auto">
          <h2 className="px-5 pt-4 font-semibold">Open shifts of other staff</h2>
          <table className="tbl">
            <thead><tr><th>Cashier</th><th>Counter</th><th>Opened</th><th className="text-right">Expected cash</th><th>Close</th></tr></thead>
            <tbody>
              {others.map((o, i) => (
                <tr key={o.id}>
                  <td>{o.staff}</td><td>{o.counter}</td><td>{fmtDate(o.opened_at, true)}</td><td className="text-right tabular-nums">{num(othersT[i].expected)}</td>
                  <td>
                    <form action={closeShift} className="flex gap-2">
                      <input type="hidden" name="id" value={o.id} />
                      <input name="counted_cash" placeholder="Counted" inputMode="decimal" className="input w-28" required />
                      <Submit className="btn-dark">Close</Submit>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 font-semibold">Closed shifts</h2>
        {history.length === 0 ? <Empty>No closed shifts yet.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Cashier</th><th>Counter</th><th>Opened</th><th>Closed</th><th className="text-right">Float</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th>Difference</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.staff}</td><td>{h.counter}</td><td>{fmtDate(h.opened_at, true)}</td><td>{fmtDate(h.closed_at, true)}{h.closed_by_name && h.closed_by !== h.user_id ? ` by ${h.closed_by_name}` : ""}</td>
                  <td className="text-right tabular-nums">{num(h.opening_float)}</td><td className="text-right tabular-nums">{num(h.expected_cash)}</td><td className="text-right tabular-nums">{num(h.counted_cash)}</td>
                  <td><Diff v={h.counted_cash - h.expected_cash} />{h.notes ? <span className="ml-2 text-xs text-slate-500">{h.notes}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {can(user, "settings") && (
        <form action={setRequireShift} className="no-print mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <input type="hidden" name="on" value={s.require_open_shift ? "0" : "1"} />
          <span>Cashiers {s.require_open_shift ? "must" : "do not have to"} open a shift before their first sale.</span>
          <Submit className="btn-ghost">{s.require_open_shift ? "Make shifts optional" : "Make shifts required"}</Submit>
          <Link href="/reports/day" className="underline">Day close report</Link>
        </form>
      )}
    </div>
  );
}
