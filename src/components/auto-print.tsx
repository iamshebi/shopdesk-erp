"use client";
import { useEffect } from "react";

export type PrintKind = "receipt" | "label" | "a4";

declare global {
  interface Window {
    shopdeskDesktop?: { print: (kind: PrintKind, size?: string) => Promise<{ ok: boolean; reason: string }> };
  }
}

/**
 * In the Windows app this prints straight to the printer chosen for this job in File → Printer setup
 * (no print window, no page headers, receipt cut to the exact length). In a browser it opens the normal print window;
 * the print pages set zero page margins, so Chrome / Edge / Samsung Internet don't add the date, title and address.
 */
export async function printPage(kind: PrintKind = "a4", size = "") {
  const desk = typeof window !== "undefined" ? window.shopdeskDesktop : undefined;
  if (desk?.print) return desk.print(kind, size);
  window.print();
  return { ok: true, reason: "" };
}

export default function AutoPrint({ enabled, kind = "a4", size = "" }: { enabled: boolean; kind?: PrintKind; size?: string }) {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      // Wait for the logo and fonts so the first receipt isn't printed half-drawn.
      await Promise.all([document.fonts?.ready, ...[...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))]);
      const r = await printPage(kind, size);
      // At the counter: once the receipt has gone to the printer, close the print window.
      if (window.shopdeskDesktop && r.ok && kind !== "a4") window.close();
    }, 250);
    return () => clearTimeout(t);
  }, [enabled, kind, size]);
  return (
    <div className="no-print fixed right-4 top-4 flex gap-2">
      <button onClick={() => printPage(kind, size)} className="btn-dark btn-sm">Print</button>
      <button onClick={() => window.close()} className="btn-ghost btn-sm">Close</button>
    </div>
  );
}
