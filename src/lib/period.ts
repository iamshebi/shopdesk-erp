import { todayDubai } from "./util";
/** Default report period: this month so far (Dubai time). */
export function period(sp: Record<string, string>) {
  const today = todayDubai();
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const from = ok(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = ok(sp.to) ? sp.to : today;
  return { from, to: to < from ? from : to, today };
}
