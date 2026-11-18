import "server-only";
import { q, one } from "./db";

export interface Shift {
  id: number; user_id: number; staff: string; counter: string; opened_at: string; opening_float: number;
  closed_at: string | null; expected_cash: number | null; counted_cash: number | null; notes: string; closed_by_name: string | null;
}

/** The cashier's open shift, if any. */
export async function openShiftOf(userId: number) {
  return one<Shift>("SELECT s.*, u.name staff FROM cash_shifts s JOIN users u ON u.id=s.user_id WHERE s.user_id=$1 AND s.closed_at IS NULL", [userId]);
}

/**
 * Cash that should be in the drawer: opening float + cash taken by this cashier during the shift
 * - cash refunds - cash paid for used phones - cash expenses and supplier payments by this cashier + cash in - cash out.
 */
export async function shiftTotals(shift: { id: number; user_id: number; opened_at: string; opening_float: number; closed_at?: string | null }) {
  const p = [shift.user_id, shift.opened_at, shift.closed_at ?? new Date().toISOString()];
  const w = (col: string) => `${col} >= $2 AND ${col} <= $3`;
  const sum = async (sql: string, params: unknown[] = p) => Number((await one<{ v: number }>(sql, params))?.v ?? 0);
  const sales = await sum(`SELECT COALESCE(sum(pm.amount),0) v FROM payments pm JOIN sales s ON s.id=pm.sale_id WHERE s.type='invoice' AND pm.method='cash' AND pm.created_by=$1 AND ${w("pm.created_at")}`);
  const refunds = await sum(`SELECT COALESCE(sum(pm.amount),0) v FROM payments pm JOIN sales s ON s.id=pm.sale_id WHERE s.type='credit_note' AND pm.method='cash' AND pm.created_by=$1 AND ${w("pm.created_at")}`);
  const buybacks = await sum(`SELECT COALESCE(sum(price_paid),0) v FROM buybacks WHERE payment_method='cash' AND created_by=$1 AND ${w("created_at")}`);
  const expenses = await sum(`SELECT COALESCE(sum(total),0) v FROM expenses WHERE method='cash' AND status='approved' AND created_by=$1 AND ${w("created_at")}`);
  const suppliers = await sum(`SELECT COALESCE(sum(amount),0) v FROM supplier_payments WHERE method='cash' AND created_by=$1 AND ${w("created_at")}`);
  const cashIn = await sum("SELECT COALESCE(sum(amount),0) v FROM cash_moves WHERE shift_id=$1 AND kind='in'", [shift.id]);
  const cashOut = await sum("SELECT COALESCE(sum(amount),0) v FROM cash_moves WHERE shift_id=$1 AND kind='out'", [shift.id]);
  const card = await sum(`SELECT COALESCE(sum(pm.amount),0) v FROM payments pm JOIN sales s ON s.id=pm.sale_id WHERE s.type='invoice' AND pm.method<>'cash' AND pm.created_by=$1 AND ${w("pm.created_at")}`);
  const invoices = await sum(`SELECT count(*)::int v FROM sales WHERE type='invoice' AND created_by=$1 AND ${w("created_at")}`);
  const expected = Math.round((Number(shift.opening_float) + sales - refunds - buybacks - expenses - suppliers + cashIn - cashOut) * 100) / 100;
  return { sales, refunds, buybacks, expenses, suppliers, cashIn, cashOut, card, invoices, expected };
}

export async function shiftMoves(shiftId: number) {
  return q<{ id: number; kind: string; amount: number; reason: string; created_at: string; staff: string }>(
    "SELECT m.*, u.name staff FROM cash_moves m LEFT JOIN users u ON u.id=m.created_by WHERE m.shift_id=$1 ORDER BY m.created_at", [shiftId]);
}
