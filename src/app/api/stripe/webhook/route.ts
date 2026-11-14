import { tx, one } from "@/lib/db";
import { verifyStripe } from "@/lib/stripe";
import { OUTSTANDING_SQL } from "@/lib/sales";
import { fireWebhook } from "@/lib/webhooks";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyStripe(raw, req.headers.get("stripe-signature")))) return new Response("Bad signature", { status: 400 });
  const ev = JSON.parse(raw);
  if (ev.type !== "checkout.session.completed" || ev.data?.object?.payment_status !== "paid") return Response.json({ ok: true });
  const sess = ev.data.object;
  const saleId = Number(sess.metadata?.sale_id);
  const amount = Math.round(Number(sess.amount_total)) / 100;
  if (!saleId || !amount) return Response.json({ ok: true });
  const ref = `stripe:${sess.id}`;
  const done = await tx(async (t) => {
    const [dup] = await t("SELECT 1 FROM payments WHERE reference=$1", [ref]);
    if (dup) return false;
    const [row] = await t<any>(`SELECT ${OUTSTANDING_SQL} outstanding FROM sales s WHERE s.id=$1`, [saleId]);
    if (!row) return false;
    const pay = Math.min(amount, Math.max(0, Number(row.outstanding)));
    if (pay <= 0) return false;
    await t("INSERT INTO payments (sale_id, method, amount, reference) VALUES ($1,'card',$2,$3)", [saleId, pay, ref]);
    await t("UPDATE sales SET paid = paid + $2 WHERE id=$1", [saleId, pay]);
    return true;
  });
  if (done) await (await import("@/lib/notify")).notifyPerm(["sales.payments"], `Online payment received: ${amount.toFixed(2)}`, `/sales/${saleId}`, "payment");
  if (done) await fireWebhook("sale.paid", await one("SELECT id, number, total, paid FROM sales WHERE id=$1", [saleId]));
  return Response.json({ ok: true });
}
