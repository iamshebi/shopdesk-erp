import { q } from "./db";

export const CF_ENTITIES: Record<string, string> = { products: "Products", customers: "Customers", employees: "Employees", orders: "Orders & quotations" };
export const CF_TYPES = [["text", "Text"], ["number", "Number"], ["date", "Date"], ["select", "Choice list"], ["checkbox", "Yes / no"], ["textarea", "Long text"]] as const;
export interface CustomField { id: number; entity: string; key: string; label: string; type: string; options: string; required: boolean }

export const customFields = (entity: string) => q<CustomField>("SELECT * FROM custom_fields WHERE entity=$1 ORDER BY sort, id", [entity]);

/** Reads cf_<key> inputs from a form into a JSON object; returns an error for missing required ones. */
export function readCustom(fields: CustomField[], fd: FormData): { values: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = String(fd.get(`cf_${f.key}`) ?? "").trim();
    if (f.type === "checkbox") { values[f.key] = fd.get(`cf_${f.key}`) === "on"; continue; }
    if (f.required && !raw) return { values, error: `${f.label} is required` };
    if (!raw) continue;
    values[f.key] = f.type === "number" ? Number(raw) : raw;
  }
  return { values };
}
