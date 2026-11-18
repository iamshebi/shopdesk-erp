"use client";
import { useEffect, useState } from "react";

/**
 * Prints the receipt for a sale that was just completed, once, without leaving the page.
 * Windows app: goes straight to the receipt printer chosen in File → Printer setup (no dialog).
 * Browser: prints from a hidden frame (the browser shows its print window; in Chrome started with
 * --kiosk-printing it prints straight away too).
 */
export default function AutoReceipt({ saleId, size }: { saleId: number; size: string }) {
  const [state, setState] = useState<"printing" | "done" | "failed" | "">("");
  useEffect(() => {
    const key = `sd-printed-${saleId}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
    const path = `/print/invoice/${saleId}?format=thermal`;
    setState("printing");
    const desk = (window as any).shopdeskDesktop;
    if (desk?.printUrl) {
      desk.printUrl(path, "receipt", size).then((r: { ok: boolean }) => setState(r?.ok ? "done" : "failed"), () => setState("failed"));
      return;
    }
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    f.src = path;
    f.onload = () => setTimeout(() => {
      try { f.contentWindow?.focus(); f.contentWindow?.print(); setState("done"); } catch { setState("failed"); }
      setTimeout(() => f.remove(), 60000);
    }, 400);
    document.body.appendChild(f);
  }, [saleId, size]);
  if (!state) return null;
  return <span className="text-xs text-emerald-700">{state === "printing" ? "Printing receipt…" : state === "done" ? "Receipt sent to printer" : "Receipt didn't print, use the Receipt button"}</span>;
}
