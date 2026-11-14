// Whitelisted building blocks: users pick names, never SQL.
const D = (expr: string) => `(${expr} AT TIME ZONE 'Asia/Dubai')`;
export const DATASETS: Record<string, { label: string; from: string; date: string; dims: Record<string, [string, string]>; metrics: Record<string, [string, string]> }> = {
  sales: {
    label: "Sales (invoice lines)",
    from: "sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id LEFT JOIN users u ON u.id=s.created_by LEFT JOIN customers c ON c.id=s.customer_id",
    date: D("s.date"),
    dims: {
      day: ["Day", `to_char(${D("s.date")},'YYYY-MM-DD')`], month: ["Month", `to_char(${D("s.date")},'YYYY-MM')`], weekday: ["Weekday", `to_char(${D("s.date")},'Dy')`], hour: ["Hour", `to_char(${D("s.date")},'HH24')`],
      product: ["Product", "COALESCE(p.name, si.description)"], category: ["Category", "COALESCE(NULLIF(p.category,''),'—')"], brand: ["Brand", "COALESCE(NULLIF(p.brand,''),'—')"],
      customer: ["Customer", "COALESCE(NULLIF(s.customer_name,''),'Walk-in')"], group: ["Customer group", "COALESCE(NULLIF(c.group_name,''),'—')"], cashier: ["Staff", "COALESCE(u.name,'—')"], coupon: ["Coupon", "COALESCE(NULLIF(s.coupon_code,''),'—')"],
    },
    metrics: {
      revenue: ["Revenue incl. VAT", "sum(CASE WHEN s.type='credit_note' THEN -si.total ELSE si.total END)"], net: ["Net sales", "sum(CASE WHEN s.type='credit_note' THEN -si.net ELSE si.net END)"],
      vat: ["VAT", "sum(CASE WHEN s.type='credit_note' THEN -si.vat ELSE si.vat END)"], cost: ["Cost", "sum(CASE WHEN s.type='credit_note' THEN -si.cost ELSE si.cost END)"],
      profit: ["Gross profit", "sum(CASE WHEN s.type='credit_note' THEN -(si.net-si.cost) ELSE si.net-si.cost END)"], qty: ["Units", "sum(CASE WHEN s.type='credit_note' THEN -si.qty ELSE si.qty END)"],
      invoices: ["Invoices", "count(DISTINCT s.id) FILTER (WHERE s.type='invoice')"], discount: ["Discounts", "sum(si.discount)"],
    },
  },
  payments: {
    label: "Payments received", from: "payments pm JOIN sales s ON s.id=pm.sale_id", date: D("pm.created_at"),
    dims: { day: ["Day", `to_char(${D("pm.created_at")},'YYYY-MM-DD')`], month: ["Month", `to_char(${D("pm.created_at")},'YYYY-MM')`], method: ["Method", "pm.method"] },
    metrics: { amount: ["Amount", "sum(CASE WHEN s.type='credit_note' THEN -pm.amount ELSE pm.amount END)"], count: ["Payments", "count(*)"] },
  },
  expenses: {
    label: "Expenses", from: "(SELECT * FROM expenses WHERE status='approved') e", date: "e.date",
    dims: { month: ["Month", "to_char(e.date,'YYYY-MM')"], day: ["Day", "to_char(e.date,'YYYY-MM-DD')"], category: ["Category", "e.category"], method: ["Paid by", "e.method"] },
    metrics: { amount: ["Amount excl. VAT", "sum(e.amount)"], vat: ["VAT", "sum(e.vat)"], total: ["Total", "sum(e.total)"], count: ["Entries", "count(*)"] },
  },
  purchases: {
    label: "Purchases", from: "purchases pu LEFT JOIN suppliers su ON su.id=pu.supplier_id", date: "pu.date",
    dims: { month: ["Month", "to_char(pu.date,'YYYY-MM')"], supplier: ["Supplier", "COALESCE(su.name,'—')"] },
    metrics: { total: ["Total", "sum(pu.total)"], vat: ["VAT", "sum(pu.vat)"], unpaid: ["Unpaid", "sum(pu.total-pu.paid-pu.returned)"], count: ["Bills", "count(*)"] },
  },
  stock: {
    label: "Stock movements", from: "stock_moves m JOIN products p ON p.id=m.product_id LEFT JOIN warehouses w ON w.id=m.warehouse_id", date: D("m.created_at"),
    dims: { type: ["Movement type", "m.type"], product: ["Product", "p.name"], category: ["Category", "COALESCE(NULLIF(p.category,''),'—')"], warehouse: ["Warehouse", "COALESCE(w.name,'—')"], month: ["Month", `to_char(${D("m.created_at")},'YYYY-MM')`] },
    metrics: { qty: ["Quantity", "sum(m.qty)"], moves: ["Movements", "count(*)"] },
  },
};
