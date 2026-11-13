import ExcelJS from "exceljs";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { DATASETS } from "@/lib/datasets";

export const dynamic = "force-dynamic";

function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
  return v as string | number;
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await requireUser(kind === "products" ? ["data", "products.edit"] : "data");
  const ds = DATASETS[kind];
  if (!ds) return new Response("Unknown export", { status: 404 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2999-12-31";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sql = ds.sql.replace("{{date}}", ds.dated ? `(${ds.dated} AT TIME ZONE 'Asia/Dubai')::date BETWEEN $1 AND $2` : "TRUE");
  const ids = (url.searchParams.get("ids") || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const args: unknown[] = ds.dated ? [from, to] : [];
  const finalSql = ids.length && kind === "products" ? `SELECT * FROM (${sql}) x WHERE x.id = ANY($${args.push(ids)}::int[])` : sql;
  const rows = await q<Record<string, unknown>>(finalSql, args);
  const s = await getSettings();
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const base = `${s.shop_name.replace(/[^\w]+/g, "-")}-${kind}-${new Date().toISOString().slice(0, 10)}`;
  await log(user.id, "Data exported", `${ds.label} (${rows.length} rows, ${format.toUpperCase()})`, "/settings/data");

  if (format === "csv") {
    const esc = (v: unknown) => {
      const t = String(cell(v));
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const body = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = s.shop_name;
  const ws = wb.addWorksheet(ds.label.slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()), key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(cols.map((c) => [c, cell(r[c])]))));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
