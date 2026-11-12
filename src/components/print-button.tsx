"use client";
import { Printer } from "lucide-react";
export default function PrintButton() {
  return <button onClick={() => window.print()} className="btn-ghost no-print"><Printer size={16} /> Print</button>;
}
