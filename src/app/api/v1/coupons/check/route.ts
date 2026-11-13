import { tx } from "@/lib/db";
import { apiAuth } from "@/lib/apikeys";
import { checkCoupon, CouponError } from "@/lib/marketing";

export async function POST(req: Request) {
  const a = await apiAuth(req, "read");
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  try {
    const c = await tx((t) => checkCoupon(t, String(b.code ?? ""), Number(b.amount) || 0, null));
    return Response.json({ data: { valid: true, code: c.code, discount: c.discount, label: c.label } });
  } catch (e) {
    return Response.json({ data: { valid: false, reason: e instanceof CouponError ? e.message : "error" } });
  }
}
