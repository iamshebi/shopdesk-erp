import { getSettings } from "./settings";

/** Returns an error message when a document dated d falls in a closed (locked) period. */
export async function lockedMessage(d: string | null | undefined) {
  const s = await getSettings();
  const lock = s.books_locked_until;
  if (lock && d && d.slice(0, 10) <= lock) return `The books are closed up to ${lock}. Use a later date, or reopen the period in Settings → Workflow.`;
  return "";
}

/** Start and end (YYYY-MM-DD) of the financial year containing the given date. */
export function fiscalYear(startMonth: number, date: string) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const sy = m >= startMonth ? y : y - 1;
  const from = `${sy}-${String(startMonth).padStart(2, "0")}-01`;
  const endD = new Date(Date.UTC(sy + 1, startMonth - 1, 0));
  return { from, to: endD.toISOString().slice(0, 10), label: startMonth === 1 ? String(sy) : `${sy}/${String(sy + 1).slice(2)}` };
}
