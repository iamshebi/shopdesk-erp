"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { getSettings, saveSettings } from "@/lib/settings";
import { loyaltyBalance } from "@/lib/marketing";
import { str, numf } from "@/lib/util";

function go(path: string, msg?: string, kind: "ok" | "err" = "ok"): never {
  redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}` : path);
}

export async function saveCoupon(fd: FormData) {
  const user = await requireUser("marketing");
  const id = Number(str(fd, "id"));
  const code = (str(fd, "code") || crypto.randomBytes(3).toString("hex")).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const type = str(fd, "type") === "amount" ? "amount" : "percent";
  const value = Math.max(0, numf(fd, "value"));
  if (!value || (type === "percent" && value > 100)) go("/marketing", "Enter a valid discount (percent 1–100 or an amount)", "err");
  const f = [code, type, value, Math.max(0, numf(fd, "min_total")), str(fd, "starts_on") || null, str(fd, "ends_on") || null, Math.max(0, Math.round(numf(fd, "max_uses"))), str(fd, "note"), str(fd, "affiliate"), Math.min(100, Math.max(0, numf(fd, "affiliate_rate")))];
  try {
    if (id) await q("UPDATE coupons SET code=$2, type=$3, value=$4, min_total=$5, starts_on=$6, ends_on=$7, max_uses=$8, note=$9, affiliate=$10, affiliate_rate=$11 WHERE id=$1", [id, ...f]);
    else await q("INSERT INTO coupons (code, type, value, min_total, starts_on, ends_on, max_uses, note, affiliate, affiliate_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", f);
  } catch {
    go("/marketing", `Code ${code} already exists`, "err");
  }
  await log(user.id, "Coupon saved", code, "/marketing");
  revalidatePath("/marketing");
  go("/marketing", `Coupon ${code} saved`);
}

export async function toggleCoupon(fd: FormData) {
  await requireUser("marketing");
  await q("UPDATE coupons SET active = NOT active WHERE id=$1", [Number(str(fd, "id"))]);
  go("/marketing");
}

export async function saveLoyalty(fd: FormData) {
  const user = await requireUser("marketing");
  await saveSettings({ loyalty_points_per_unit: Math.max(0, numf(fd, "loyalty_points_per_unit")), loyalty_point_value: Math.max(0, numf(fd, "loyalty_point_value")), loyalty_min_redeem: Math.max(0, Math.round(numf(fd, "loyalty_min_redeem"))), referral_points: Math.max(0, Math.round(numf(fd, "referral_points"))) });
  await log(user.id, "Loyalty settings changed", "", "/marketing");
  go("/marketing", "Loyalty settings saved");
}

/** Turn points into a one-time voucher for this customer. */
export async function redeemPoints(fd: FormData) {
  const user = await requireUser(["marketing", "customers"]);
  const cid = Number(str(fd, "customer_id"));
  const s = await getSettings();
  const back = `/customers/${cid}`;
  const res = await tx(async (t) => {
    const bal = await loyaltyBalance(t, cid);
    const pts = Math.min(bal, Math.round(numf(fd, "points")) || bal);
    if (pts <= 0 || pts < s.loyalty_min_redeem) return { err: `Needs at least ${s.loyalty_min_redeem} points (has ${bal})` };
    const value = Math.round(pts * Number(s.loyalty_point_value) * 100) / 100;
    if (value <= 0) return { err: "Set a point value first (Marketing → Loyalty)" };
    const code = `LOY-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    await t("INSERT INTO coupons (code, type, value, max_uses, customer_id, note) VALUES ($1,'amount',$2,1,$3,$4)", [code, value, cid, `${pts} loyalty points`]);
    await t("INSERT INTO loyalty_ledger (customer_id, points, note) VALUES ($1,$2,$3)", [cid, -pts, `Redeemed for voucher ${code}`]);
    return { code, value };
  });
  if ("err" in res) go(back, res.err, "err");
  await log(user.id, "Points redeemed", `${res.code} = ${res.value.toFixed(2)}`, back);
  go(back, `Voucher ${res.code} worth ${s.currency} ${res.value.toFixed(2)} created. Enter it at the till.`);
}

export async function adjustPoints(fd: FormData) {
  const user = await requireUser("marketing");
  const cid = Number(str(fd, "customer_id"));
  const pts = Math.round(numf(fd, "points"));
  if (pts) await q("INSERT INTO loyalty_ledger (customer_id, points, note) VALUES ($1,$2,$3)", [cid, pts, str(fd, "note") || `Adjusted by ${user.name}`]);
  go(`/customers/${cid}`, "Points adjusted");
}

