import { q, tx } from "@/lib/db";
import { getUser, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createSale, SaleError, type SaleLineInput } from "@/lib/sales";
import { log } from "@/lib/activity";
import { num } from "@/lib/util";
import { after } from "next/server";
import { autoMessage } from "@/lib/auto-messages";
import { baseUrl, saleToken } from "@/lib/public-link";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type OfflineSale = {
  offline_id: string; offline_no: string; created_at: string;
  customer?: { name?: string; phone?: string };
  lines: { product_id: number; unit_id?: number | null; qty: number; unit_price: number; discount?: number }[];
  payments: { method: string; amount: number }[];
};

/**
 * Uploads sales made in the Windows app while the internet was down. Each sale is saved once (offline_id),
 * gets a normal invoice number, and keeps the time it was really made. Sending the same sale again is safe.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const sales: OfflineSale[] = Array.isArray(body?.sales) ? body.sales.slice(0, 200) : [];
  const s = await getSettings();
  const results: { offline_id: string; id?: number; number?: string; error?: string }[] = [];
  for (const o of sales) {
    if (!o?.offline_id || !Array.isArray(o.lines) || !o.lines.length) { results.push({ offline_id: String(o?.offline_id ?? ""), error: "Empty sale" }); continue; }
    const [done] = await q<{ id: number; number: string }>("SELECT id, number FROM sales WHERE offline_id=$1", [o.offline_id]);
    if (done) { results.push({ offline_id: o.offline_id, ...done }); continue; }
    try {
      // Same rules as the till: list price unless the cashier may change prices, no discount without permission.
      const lines: SaleLineInput[] = [];
      for (const l of o.lines) {
        const [p] = await q<{ price: number }>("SELECT price FROM products WHERE id=$1", [Number(l.product_id)]);
        let list = Number(p?.price ?? 0);
        if (l.unit_id) {
          const [u] = await q<{ price: number | null }>("SELECT price FROM units WHERE id=$1", [Number(l.unit_id)]);
          if (u?.price) list = Number(u.price);
        }
        lines.push({
          product_id: Number(l.product_id), unit_id: l.unit_id ? Number(l.unit_id) : null, qty: Math.max(1, Math.round(Number(l.qty) || 1)),
          unit_price: can(user, "sales.price") ? Number(l.unit_price) : list,
          discount: can(user, "sales.discount") ? Number(l.discount || 0) : 0,
        });
      }
      const payments = (o.payments || []).map((p) => ({ method: String(p.method), amount: Number(p.amount) || 0 }));
      if (!can(user, "sales.credit") && payments.some((p) => p.method === "credit")) throw new SaleError("This account can't sell on credit");
      const when = new Date(o.created_at);
      const at = isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60 * 1000 ? new Date() : when;
      const id = await tx(async (t) => {
        const sid = await createSale(t, s, { customer: { id: null, name: o.customer?.name || "", phone: o.customer?.phone || "", trn: "", address: "" }, lines, payments, notes: `Offline sale ${o.offline_no}`, userId: user.id });
        await t("UPDATE sales SET offline_id=$1, date=$2, created_at=$2 WHERE id=$3", [o.offline_id, at.toISOString(), sid]);
        await t("UPDATE payments SET created_at=$1 WHERE sale_id=$2", [at.toISOString(), sid]);
        const [row] = await t<{ number: string; total: number }>("SELECT number, total FROM sales WHERE id=$1", [sid]);
        await log(user.id, "Offline sale uploaded", `${row.number} (was ${o.offline_no}, made ${at.toISOString().slice(0, 16).replace("T", " ")}) · ${s.currency} ${num(row.total)}`, `/sales/${sid}`, t);
        return sid;
      });
      const [row] = await q<{ number: string; total: number; customer_phone: string }>("SELECT number, total, customer_phone FROM sales WHERE id=$1", [id]);
      results.push({ offline_id: o.offline_id, id, number: row.number });
      if (row.customer_phone) {
        const link = `${await baseUrl()}/i/${await saleToken(id)}`;
        after(() => autoMessage("sale", row.customer_phone, { number: row.number, total: Number(row.total), link }));
      }
    } catch (e) {
      // Uploaded twice at the same moment: the other request saved it.
      const [dup] = await q<{ id: number; number: string }>("SELECT id, number FROM sales WHERE offline_id=$1", [o.offline_id]);
      if (dup) { results.push({ offline_id: o.offline_id, ...dup }); continue; }
      results.push({ offline_id: o.offline_id, error: e instanceof SaleError ? e.message : "Could not save this sale" });
      if (!(e instanceof SaleError)) console.error("offline sync", e);
    }
  }
  return Response.json({ results });
}
