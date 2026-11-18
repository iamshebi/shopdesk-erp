// Barcodes without extra libraries: Code 128 (B) as SVG, and internal EAN-13 numbers for products that have none.

const CODE128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

/**
 * Code 128 symbol values for `text`. Long runs of digits (IMEIs, EANs, serials) use code set C, which packs
 * two digits per symbol, so a 15-digit IMEI is about 40% narrower and its bars stay thick enough to scan
 * on a 203 dpi thermal label. Everything else uses code set B.
 */
function code128Values(text: string) {
  const chars = [...text].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join("");
  const values: number[] = [];
  let set: "B" | "C" | "" = "";
  let i = 0;
  const digitRun = (from: number) => {
    let n = 0;
    while (from + n < chars.length && chars[from + n] >= "0" && chars[from + n] <= "9") n++;
    return n;
  };
  while (i < chars.length) {
    const run = digitRun(i);
    // Switch to C for runs of 4+ digits (or 2+ when the whole text is digits); keep an even count in C.
    const useC = run >= 4 || (run >= 2 && run === chars.length - i && i === 0);
    if (useC) {
      const pairs = run - (run % 2);
      if (set !== "C") { values.push(set === "" ? 105 : 99); set = "C"; }
      for (let k = 0; k < pairs; k += 2) values.push(Number(chars.slice(i + k, i + k + 2)));
      i += pairs;
    } else {
      if (set !== "B") { values.push(set === "" ? 104 : 100); set = "B"; }
      values.push(chars.charCodeAt(i) - 32);
      i += 1;
    }
  }
  if (!values.length) values.push(104);
  return values;
}

/** SVG markup for a Code 128 barcode (printable ASCII). */
export function code128Svg(text: string, opts: { height?: number; module?: number } = {}) {
  const h = opts.height ?? 48, m = opts.module ?? 1.6;
  const codes = code128Values(text);
  const check = codes.reduce((sum, c, i) => sum + c * (i === 0 ? 1 : i), 0) % 103;
  const all = [...codes, check, 106];
  let x = 10 * m; // quiet zone
  const bars: string[] = [];
  for (const code of all) {
    const pattern = CODE128[code];
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]) * m;
      if (i % 2 === 0) bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}"/>`);
      x += w;
    }
  }
  const width = x + 10 * m;
  // crispEdges stops the printer driver from greying the bar edges, which makes thermal barcodes hard to scan.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${bars.join("")}</svg>`;
}

/** EAN-13 check digit for the first 12 digits. */
export function ean13Check(d12: string) {
  const sum = [...d12].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/** Internal store barcode: prefix 20 (reserved for in-store use) + product id. */
export function internalEan13(productId: number) {
  const d12 = "20" + String(productId).padStart(10, "0");
  return d12 + ean13Check(d12);
}
