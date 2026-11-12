"use client";
import { useEffect } from "react";

export default function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) setTimeout(() => window.print(), 300);
  }, [enabled]);
  return (
    <div className="no-print fixed right-4 top-4 flex gap-2">
      <button onClick={() => window.print()} className="btn-dark btn-sm">Print</button>
      <button onClick={() => window.close()} className="btn-ghost btn-sm">Close</button>
    </div>
  );
}
