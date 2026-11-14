import "server-only";
import { q } from "./db";
import { SEGMENTS, SEGMENT_BASE } from "./segments";

export async function campaignRecipients(c: { segment: string; group_name: string; channel: string }) {
  const seg = SEGMENTS[c.segment] ?? SEGMENTS.all;
  const need = c.channel === "email" ? "email <> ''" : "phone <> ''";
  return q<any>(`SELECT id, name, phone, email FROM (${SEGMENT_BASE}) x WHERE ${seg.where} AND NOT marketing_opt_out AND ${need} ${c.group_name ? "AND group_name=$1" : ""} ORDER BY spent DESC LIMIT 2000`, c.group_name ? [c.group_name] : []);
}
