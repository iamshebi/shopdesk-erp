export const FILE_KINDS: Record<string, { perm: string; public?: boolean; images?: boolean; label: string }> = {
  product: { perm: "products.edit", public: true, images: true, label: "Product images" },
  expense: { perm: "expenses", label: "Receipts" },
  purchase: { perm: "purchases", label: "Supplier bills" },
  task: { perm: "tasks", label: "Attachments" },
  employee: { perm: "hr", label: "Documents" },
  ticket: { perm: "support", label: "Attachments" },
  customer: { perm: "customers", label: "Documents" },
  company: { perm: "settings", label: "Company documents" },
};
export const MAX_FILE = 3 * 1024 * 1024;
export const fileUrl = (id: number) => `/api/files/${id}`;
