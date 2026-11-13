// Barcodes without extra libraries: Code 128 (B) as SVG, and internal EAN-13 numbers for products that have none.

const CODE128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

/** SVG markup for a Code 128-B barcode (printable ASCII). */
export function code128Svg(text: string, opts: { height?: number; module?: number } = {}) {
  const h = opts.height ?? 48, m = opts.module ?? 1.6;
  const chars = [...text].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
  const codes = [104, ...chars.map((c) => c.charCodeAt(0) - 32)];
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${h}" preserveAspectRatio="none" fill="#000">${bars.join("")}</svg>`;
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
