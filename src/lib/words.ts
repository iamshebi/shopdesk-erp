const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? " " + ONES[r % 10] : ""}`);
  return parts.join(" ");
}

function intWords(n: number): string {
  if (n === 0) return "Zero";
  const scales: [number, string][] = [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
  const out: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) {
      out.push(`${below1000(Math.floor(n / v))} ${name}`);
      n %= v;
    }
  }
  if (n) out.push(below1000(n));
  return out.join(" ");
}

export function amountInWords(amount: number, currency = "AED") {
  const whole = Math.floor(Math.abs(amount) + 1e-9);
  const fils = Math.round((Math.abs(amount) - whole) * 100);
  const name = currency === "AED" ? "Dirhams" : currency;
  return `${name} ${intWords(whole)}${fils ? ` and ${intWords(fils)} Fils` : ""} Only`;
}
