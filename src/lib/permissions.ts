// Every permission an admin can give a role. Shared by server checks and the role editor.

export interface Perm {
  key: string;
  label: string;
  hint?: string;
}

export const PERMISSION_GROUPS: { group: string; perms: Perm[] }[] = [
  {
    group: "Sales",
    perms: [
      { key: "pos", label: "Make sales (POS)" },
      { key: "orders", label: "Sales orders & quotations" },
      { key: "sales.view", label: "View invoices" },
      { key: "sales.all", label: "See invoices made by other staff", hint: "Without this, staff only see their own sales" },
      { key: "sales.price", label: "Change the selling price at the till" },
      { key: "sales.discount", label: "Give discounts" },
      { key: "sales.credit", label: "Sell on credit (pay later)" },
      { key: "sales.returns", label: "Process returns & refunds" },
      { key: "sales.payments", label: "Receive payments on unpaid invoices" },
      { key: "customers", label: "View & edit customers" },
    ],
  },
  {
    group: "Stock",
    perms: [
      { key: "products.view", label: "View stock" },
      { key: "products.edit", label: "Add & edit products and prices" },
      { key: "products.cost", label: "See cost prices & profit" },
      { key: "stock.adjust", label: "Adjust stock, add IMEIs, write off" },
      { key: "products.import", label: "Import products from Excel / CSV" },
      { key: "imei", label: "IMEI lookup" },
      { key: "purchases", label: "Purchases from suppliers" },
      { key: "suppliers", label: "Suppliers" },
    ],
  },
  {
    group: "Repairs & used devices",
    perms: [
      { key: "repairs", label: "Repair job cards" },
      { key: "repairs.deliver", label: "Deliver repairs & take payment" },
      { key: "buyback", label: "Buy used devices from customers" },
    ],
  },
  {
    group: "Money & reports",
    perms: [
      { key: "dashboard.money", label: "See sales totals on the dashboard" },
      { key: "expenses", label: "Record expenses" },
      { key: "expenses.delete", label: "Delete expenses" },
      { key: "reports", label: "Sales, profit & stock reports" },
      { key: "reports.day", label: "Day close (cash in drawer)" },
      { key: "reports.vat", label: "VAT return report" },
    ],
  },
  {
    group: "Administration",
    perms: [
      { key: "settings", label: "Shop settings, logo & invoice details" },
      { key: "website", label: "Publish products to the website" },
      { key: "staff", label: "Manage staff logins & roles" },
      { key: "data", label: "Export data, backup & restore" },
      { key: "activity", label: "View the activity log" },
    ],
  },
];

export const ALL_PERMS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

export const DEFAULT_ROLES: { name: string; perms: string[]; locked?: boolean }[] = [
  { name: "Owner", perms: ["*"], locked: true },
  {
    name: "Manager",
    perms: ALL_PERMS.filter((p) => !["settings", "staff", "data", "expenses.delete"].includes(p)),
  },
  {
    name: "Accountant",
    perms: ["sales.view", "sales.all", "sales.payments", "customers", "products.view", "products.cost", "imei", "purchases", "suppliers",
      "dashboard.money", "expenses", "reports", "reports.day", "reports.vat", "data"],
  },
  { name: "Cashier", perms: ["pos", "sales.view", "sales.discount", "customers", "products.view", "imei", "repairs", "repairs.deliver", "buyback"] },
  { name: "Technician", perms: ["repairs", "products.view", "imei"] },
];
