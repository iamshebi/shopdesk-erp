export const SHIP_STATUSES = [
  { id: "pending", label: "Ready to ship", tone: "slate" },
  { id: "in_transit", label: "In transit", tone: "blue" },
  { id: "out_for_delivery", label: "Out for delivery", tone: "violet" },
  { id: "delivered", label: "Delivered", tone: "green" },
  { id: "failed", label: "Delivery failed", tone: "red" },
  { id: "returned", label: "Returned", tone: "amber" },
] as const;
export const shipStatus = (s: string) => SHIP_STATUSES.find((x) => x.id === s) ?? SHIP_STATUSES[0];
export function couriers(setting: string) {
  return setting.split("\n").map((l) => l.split("|")).filter((p) => p[0]?.trim()).map(([name, url]) => ({ name: name.trim(), url: (url ?? "").trim() }));
}
export function trackingUrl(setting: string, courier: string, no: string) {
  const c = couriers(setting).find((x) => x.name.toLowerCase() === courier.toLowerCase());
  return c?.url && no ? c.url.replace("{n}", encodeURIComponent(no)) : "";
}
