"use client";
import { Printer } from "lucide-react";
import { printPage, type PrintKind } from "./auto-print";

export default function PrintButton({ kind = "a4", size = "" }: { kind?: PrintKind; size?: string }) {
  return <button onClick={() => printPage(kind, size)} className="btn-ghost no-print"><Printer size={16} /> Print</button>;
}
