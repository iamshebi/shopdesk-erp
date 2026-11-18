// DOLLAR44 ERP plans. The plan is written into the subscription key, so only DOLLAR44 can change it.
// A plan switches modules off by removing their permissions for everyone, the owner included.

export type PlanId = "basic" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  label: string;
  users: number; // default staff logins allowed (0 = no limit); a key can override it
  blocked: string[]; // permissions this plan does not include
  summary: string;
}

const PRO_ONLY = ["orders", "crm", "support", "hr", "payroll", "tasks", "marketing", "shipping", "accounting", "website", "purchases.approve", "expenses.approve", "products.approve"];
const ENTERPRISE_ONLY = ["integrations"];

export const PLANS: Record<PlanId, Plan> = {
  basic: {
    id: "basic",
    label: "Basic",
    users: 3,
    blocked: [...PRO_ONLY, ...ENTERPRISE_ONLY],
    summary: "POS, VAT invoices, stock, purchases, repairs, buy-used, expenses and reports",
  },
  pro: {
    id: "pro",
    label: "Pro",
    users: 10,
    blocked: ENTERPRISE_ONLY,
    summary: "Basic plus accounting, HR and payroll, CRM, orders and quotes, marketing, shipping, website, approvals",
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    users: 0,
    blocked: [],
    summary: "Everything, plus API keys, webhooks and automation; no user limit",
  },
};

export function planOf(id: string | undefined): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "enterprise"];
}
