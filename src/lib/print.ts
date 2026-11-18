// Shared print settings: thermal receipt width and label sizes for barcode / IMEI label printers.
export const LABEL_SIZE_OPTIONS: [string, string][] = [
  ["a4", "A4 sheet, 3 across (office printer)"],
  ["50x25", "Label roll 50 × 25 mm"],
  ["40x30", "Label roll 40 × 30 mm"],
  ["38x25", "Label roll 38 × 25 mm"],
  ["50x30", "Label roll 50 × 30 mm"],
  ["58x40", "Label roll 58 × 40 mm"],
  ["60x40", "Label roll 60 × 40 mm"],
];
export const LABEL_SIZES = LABEL_SIZE_OPTIONS.map(([v]) => v);

/** "50x25" -> { w: 50, h: 25 }; anything else (including "a4") -> null. */
export function parseLabelSize(v: string | undefined | null) {
  const m = /^(\d{2,3})x(\d{2,3})$/.exec(String(v || ""));
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** Paper width and the printable width inside it. 80 mm printers print about 72 mm; 58 mm printers about 48 mm. */
export function receiptPaper(width: string | undefined | null) {
  return width === "58" ? { paper: 58, content: 48, size: "58" } : { paper: 80, content: 72, size: "80" };
}

/**
 * Page CSS for a thermal receipt. Zero margins stop browsers printing the date, page title and web address
 * (they are drawn inside the page margin); the width matches the roll so nothing is shrunk to fit.
 */
export function receiptPageCss(width: string | undefined | null) {
  const p = receiptPaper(width);
  // No page height here: thermal drivers feed the roll to the end of the content and cut. (The Windows app
  // measures the receipt and sends the exact length.)
  return `@media print { @page { margin: 0; } html, body { width: ${p.paper}mm; margin: 0 !important; padding: 0 !important; background: #fff; } }
  [data-receipt] { width: ${p.content}mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { [data-receipt] { margin: 0 auto !important; padding: 1mm 0 4mm !important; } }`;
}

/** Page CSS for one label per page on a label roll. */
export function labelPageCss(w: number, h: number) {
  return `@media print { @page { size: ${w}mm ${h}mm; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; background: #fff; } }
  [data-label] { width: ${w}mm; height: ${h}mm; break-after: page; page-break-after: always; overflow: hidden; }
  [data-label]:last-child { break-after: auto; page-break-after: auto; }`;
}
