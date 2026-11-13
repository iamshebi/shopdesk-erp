"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, one, tx, nextNumber } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { log } from "@/lib/activity";
import { moveQty, moveUnit, MOVE_TYPES, WH_STOCK_SQL } from "@/lib/inventory";
import { str } from "@/lib/util";

function back(path: string, msg: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

export async function saveWarehouse(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(str(fd, "id"));
  const name = str(fd, "name");
  if (!name) back("/inventory", "Give the warehouse a name", "err");
  if (id) await q("UPDATE warehouses SET name=$2, code=$3, address=$4, active=$5 WHERE id=$1", [id, name, str(fd, "code"), str(fd, "address"), fd.get("active") !== "off"]);
  else await q("INSERT INTO warehouses (name, code, address) VALUES ($1,$2,$3)", [name, str(fd, "code"), str(fd, "address")]);
  await log(user.id, id ? "Warehouse edited" : "Warehouse added", name, "/inventory");
  revalidatePath("/inventory");
  back("/inventory", id ? "Saved" : `${name} added`);
}

export async function setDefaultWarehouse(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(str(fd, "id"));
  await tx(async (t) => {
    await t("UPDATE warehouses SET is_default = (id = $1)", [id]);
  });
  const w = await one<{ name: string }>("SELECT name FROM warehouses WHERE id=$1", [id]);
  await log(user.id, "Default warehouse changed", w?.name ?? "", "/inventory");
  back("/inventory", `${w?.name} is now where sales and purchases take stock from by default`);
}

interface Line { product_id: number; qty: number; imeis?: string }

function parseLines(fd: FormData): Line[] {
  try {
    const raw = JSON.parse(str(fd, "lines") || "[]");
    return (Array.isArray(raw) ? raw : []).map((l: any) => ({ product_id: Number(l.product_id), qty: Math.round(Number(l.qty) || 0), imeis: String(l.imeis ?? "") })).filter((l) => l.product_id > 0);
  } catch {
    return [];
  }
}

export async function createTransfer(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const from = Number(str(fd, "from")), to = Number(str(fd, "to"));
  const lines = parseLines(fd);
  if (!from || !to || from === to) back("/inventory/transfer", "Choose two different warehouses", "err");
  if (!lines.length) back("/inventory/transfer", "Add at least one product", "err");
  let id = 0, number = "";
  try {
    ({ id, number } = await tx(async (t) => {
      const number = await nextNumber(t, "transfer", "TR-");
      const [tr] = await t<{ id: number }>("INSERT INTO stock_transfers (number, from_warehouse_id, to_warehouse_id, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [number, from, to, str(fd, "notes"), user.id]);
      for (const l of lines) {
        const [p] = await t<any>(`SELECT p.id, p.name, p.track_serial, p.is_service, ${WH_STOCK_SQL("p", "$2")} AS have FROM products p WHERE p.id=$1`, [l.product_id, from]);
        if (!p || p.is_service) continue;
        if (p.track_serial) {
          const imeis = (l.imeis ?? "").split(/[\s,]+/).filter(Boolean);
          if (!imeis.length) throw new Error(`Scan or type the IMEIs to move for ${p.name}`);
          for (const imei of imeis) {
            const [u] = await t<{ id: number }>("SELECT id FROM units WHERE product_id=$1 AND imei=$2 AND status='in_stock' AND warehouse_id=$3", [p.id, imei, from]);
            if (!u) throw new Error(`IMEI ${imei} (${p.name}) is not in stock in the sending warehouse`);
            await t("UPDATE units SET warehouse_id=$2 WHERE id=$1", [u.id, to]);
            await t("INSERT INTO stock_transfer_items (transfer_id, product_id, unit_id, qty) VALUES ($1,$2,$3,1)", [tr.id, p.id, u.id]);
            await moveUnit(t, { unitId: u.id, productId: p.id, qty: -1, type: "transfer_out", ref: number, userId: user.id, warehouseId: from });
            await moveUnit(t, { unitId: u.id, productId: p.id, qty: 1, type: "transfer_in", ref: number, userId: user.id, warehouseId: to });
          }
        } else {
          if (l.qty <= 0) continue;
          if (l.qty > p.have) throw new Error(`Only ${p.have} of ${p.name} in the sending warehouse`);
          await t("INSERT INTO stock_transfer_items (transfer_id, product_id, qty) VALUES ($1,$2,$3)", [tr.id, p.id, l.qty]);
          await moveQty(t, { productId: p.id, qty: -l.qty, type: "transfer_out", ref: number, userId: user.id, warehouseId: from });
          await moveQty(t, { productId: p.id, qty: l.qty, type: "transfer_in", ref: number, userId: user.id, warehouseId: to });
        }
      }
      return { id: tr.id, number };
    }));
  } catch (e: any) {
    back("/inventory/transfer", e?.message || "Transfer failed. Nothing was moved.", "err");
  }
  await log(user.id, "Stock transfer", number, "/inventory/moves");
  revalidatePath("/inventory");
  back("/inventory/moves", `${number} done. Stock moved.`);
  void id;
}

export async function createAdjustment(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const wh = Number(str(fd, "warehouse_id"));
  const reason = MOVE_TYPES[str(fd, "reason")] ? str(fd, "reason") : "adjust";
  const note = str(fd, "note");
  const lines = parseLines(fd);
  if (!wh) back("/inventory/adjust", "Choose a warehouse", "err");
  if (!lines.length) back("/inventory/adjust", "Add at least one product", "err");
  let changed = 0;
  try {
    await tx(async (t) => {
      const ref = await nextNumber(t, "adjustment", "ADJ-");
      for (const l of lines) {
        const [p] = await t<any>("SELECT id, name, track_serial, is_service FROM products WHERE id=$1", [l.product_id]);
        if (!p || p.is_service) continue;
        if (p.track_serial) {
          const imeis = (l.imeis ?? "").split(/[\s,]+/).filter(Boolean);
          for (const imei of imeis) {
            const [u] = await t<{ id: number }>("SELECT id FROM units WHERE product_id=$1 AND imei=$2 AND status='in_stock' AND warehouse_id=$3", [p.id, imei, wh]);
            if (!u) throw new Error(`IMEI ${imei} (${p.name}) is not in stock in this warehouse`);
            const status = reason === "supplier_return" ? "returned_supplier" : "written_off";
            await t("UPDATE units SET status=$2, notes=$3 WHERE id=$1", [u.id, status, `${MOVE_TYPES[reason]}${note ? ": " + note : ""}`]);
            await moveUnit(t, { unitId: u.id, productId: p.id, qty: -1, type: reason, reason: note, ref, userId: user.id, warehouseId: wh });
            changed++;
          }
        } else if (l.qty) {
          const out = ["damaged", "lost", "writeoff", "supplier_return"].includes(reason);
          const qty = out ? -Math.abs(l.qty) : reason === "found" ? Math.abs(l.qty) : l.qty;
          await moveQty(t, { productId: p.id, qty, type: reason, reason: note, ref, userId: user.id, warehouseId: wh });
          changed++;
        }
      }
    });
  } catch (e: any) {
    back("/inventory/adjust", e?.message || "Adjustment failed. Nothing was changed.", "err");
  }
  await log(user.id, "Stock adjusted", `${MOVE_TYPES[reason]} · ${changed} line(s)${note ? " · " + note : ""}`, "/inventory/moves");
  revalidatePath("/inventory");
  back("/inventory/moves", `${changed} line(s) adjusted (${MOVE_TYPES[reason]})`);
}

export async function startCount(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const wh = Number(str(fd, "warehouse_id"));
  const category = str(fd, "category");
  const id = await tx(async (t) => {
    const number = await nextNumber(t, "count", "CNT-");
    const [c] = await t<{ id: number }>("INSERT INTO stock_counts (number, warehouse_id, category, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", [number, wh, category, str(fd, "notes"), user.id]);
    await t(
      `INSERT INTO stock_count_items (count_id, product_id, expected, cost)
       SELECT $1, p.id, ${WH_STOCK_SQL("p", "$2")}, p.cost FROM products p
       WHERE p.active AND NOT p.is_service ${category ? "AND p.category = $3" : ""} ORDER BY p.category, p.name`,
      category ? [c.id, wh, category] : [c.id, wh],
    );
    return c.id;
  });
  await log(user.id, "Stock count started", `#${id}`, `/inventory/counts/${id}`);
  redirect(`/inventory/counts/${id}`);
}

export async function saveCount(fd: FormData) {
  const user = await requireUser("stock.adjust");
  const id = Number(str(fd, "id"));
  const c = await one<{ status: string }>("SELECT status FROM stock_counts WHERE id=$1", [id]);
  if (!c || c.status !== "open") back(`/inventory/counts/${id}`, "This count is already applied", "err");
  await tx(async (t) => {
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("c_")) continue;
      const itemId = Number(k.slice(2));
      const val = String(v).trim();
      await t("UPDATE stock_count_items SET counted=$3 WHERE id=$1 AND count_id=$2", [itemId, id, val === "" ? null : Math.round(Number(val))]);
    }
  });
  void user;
  if (str(fd, "apply") === "1") return applyCount(id);
  back(`/inventory/counts/${id}`, "Counts saved. You can continue later.");
}

async function applyCount(id: number) {
  const user = await requireUser("stock.adjust");
  const c = await one<any>("SELECT * FROM stock_counts WHERE id=$1", [id]);
  let adjusted = 0, flagged = 0;
  await tx(async (t) => {
    const items = await t<any>(
      `SELECT i.*, p.track_serial, p.name, ${WH_STOCK_SQL("p", "$2")} AS now_qty FROM stock_count_items i JOIN products p ON p.id=i.product_id
       WHERE i.count_id=$1 AND i.counted IS NOT NULL`,
      [id, c.warehouse_id],
    );
    for (const i of items) {
      const diff = i.counted - i.now_qty;
      if (!diff) continue;
      if (i.track_serial) { flagged++; continue; } // IMEI items: fix by scanning in or writing off the exact units
      await moveQty(t, { productId: i.product_id, qty: diff, type: "count", reason: `Counted ${i.counted}, system had ${i.now_qty}`, ref: c.number, userId: user.id, warehouseId: c.warehouse_id });
      adjusted++;
    }
    await t("UPDATE stock_counts SET status='applied', applied_at=now() WHERE id=$1", [id]);
  });
  await log(user.id, "Stock count applied", `${c.number}: ${adjusted} products corrected`, `/inventory/counts/${id}`);
  revalidatePath("/inventory");
  back(`/inventory/counts/${id}`, `Applied. ${adjusted} product(s) corrected.${flagged ? ` ${flagged} IMEI product(s) differ: check them unit by unit.` : ""}`);
}
