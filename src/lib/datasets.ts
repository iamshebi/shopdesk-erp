import "server-only";

// What can be exported. Each is plain SQL; columns become spreadsheet headers.
export const DATASETS: Record<string, { label: string; sql: string; dated?: string }> = {
  products: {
    label: "Products & stock",
    sql: `SELECT p.id, p.name, p.brand, p.category, p.sku, p.barcode, p.cost, p.price,
            CASE WHEN p.track_serial THEN (SELECT count(*)::int FROM units u WHERE u.product_id=p.id AND u.status='in_stock') ELSE p.stock_qty END AS qty,
            CASE WHEN p.track_serial THEN 'yes' ELSE 'no' END AS serial, p.reorder_level, CASE WHEN p.active THEN 'yes' ELSE 'no' END AS active,
            p.status, p.tags, p.discount_price, CASE WHEN p.featured THEN 'yes' ELSE 'no' END AS featured,
            CASE WHEN p.website_visible THEN 'yes' ELSE 'no' END AS on_website, p.description, p.specs, p.seo_title, p.seo_description
          FROM products p ORDER BY p.category, p.name`,
  },
  imeis: {
    label: "IMEIs / serial units",
    sql: `SELECT u.imei, p.name AS product, u.status, u.source, u.cost, u.price, CASE WHEN u.margin_scheme THEN 'yes' ELSE 'no' END AS margin_scheme, u.created_at
          FROM units u JOIN products p ON p.id=u.product_id ORDER BY u.created_at DESC`,
  },
  invoices: {
    label: "Invoices & credit notes",
    dated: "s.date",
    sql: `SELECT s.number, s.type, s.date, s.customer_name, s.customer_phone, s.customer_trn, s.subtotal AS net, s.vat, s.total, s.paid,
            (s.total - s.paid) AS unpaid, u.name AS staff, s.notes
          FROM sales s LEFT JOIN users u ON u.id=s.created_by WHERE {{date}} ORDER BY s.date`,
  },
  invoice_lines: {
    label: "Invoice line items",
    dated: "s.date",
    sql: `SELECT s.number, s.type, s.date, si.description, si.imei, si.qty, si.unit_price, si.discount, si.net, si.vat, si.total, si.cost,
            CASE WHEN si.margin_scheme THEN 'yes' ELSE 'no' END AS margin_scheme, u.name AS staff
          FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN users u ON u.id=s.created_by WHERE {{date}} ORDER BY s.date, si.id`,
  },
  payments: {
    label: "Payments received & refunds",
    dated: "pm.created_at",
    sql: `SELECT s.number, s.type, pm.created_at, pm.method, pm.amount, pm.reference, u.name AS staff
          FROM payments pm JOIN sales s ON s.id=pm.sale_id LEFT JOIN users u ON u.id=pm.created_by WHERE {{date}} ORDER BY pm.created_at`,
  },
  customers: {
    label: "Customers",
    sql: `SELECT c.id, c.name, c.phone, c.email, c.trn, c.address, c.created_at FROM customers c ORDER BY c.name`,
  },
  suppliers: { label: "Suppliers", sql: `SELECT id, name, phone, email, trn, address FROM suppliers ORDER BY name` },
  purchases: {
    label: "Purchases",
    dated: "p.created_at",
    sql: `SELECT p.number, p.date, sp.name AS supplier, p.bill_ref, p.subtotal, p.vat, p.total, p.paid, (p.total - p.paid) AS unpaid
          FROM purchases p LEFT JOIN suppliers sp ON sp.id=p.supplier_id WHERE {{date}} ORDER BY p.date`,
  },
  expenses: {
    label: "Expenses",
    dated: "e.created_at",
    sql: `SELECT e.date, e.category, e.description, e.amount AS net, e.vat, e.total, e.method FROM expenses e WHERE {{date}} ORDER BY e.date`,
  },
  repairs: {
    label: "Repair jobs",
    dated: "r.created_at",
    sql: `SELECT r.number, r.created_at, r.customer_name, r.customer_phone, r.device, r.imei, r.issue, r.status, r.estimate, r.advance,
            r.final_charge, r.parts_cost, t.name AS technician, r.delivered_at
          FROM repairs r LEFT JOIN users t ON t.id=r.technician_id WHERE {{date}} ORDER BY r.created_at`,
  },
  buybacks: {
    label: "Used devices bought",
    dated: "b.created_at",
    sql: `SELECT b.number, b.created_at, b.seller_name, b.seller_phone, b.id_type, b.id_number, b.nationality, p.name AS model, b.imei,
            b.condition, b.price_paid, b.payment_method
          FROM buybacks b JOIN products p ON p.id=b.product_id WHERE {{date}} ORDER BY b.created_at`,
  },
};

// Tables in dependency order, for full backup / restore.
export const BACKUP_TABLES = [
  "settings", "counters", "roles", "users", "warehouses", "products", "suppliers", "customers", "purchases", "purchase_items", "buybacks",
  "sales", "units", "sale_items", "payments", "repairs", "repair_logs", "expenses", "supplier_payments", "activity", "login_events", "product_history",
  "product_stock", "stock_moves", "stock_transfers", "stock_transfer_items", "stock_counts", "stock_count_items",
  "orders", "order_items", "order_events", "website_publishes",
  "accounts", "journal_entries", "bank_reconciliations", "journal_lines",
  "leads", "crm_activities", "tickets", "ticket_messages", "kb_articles",
  "departments", "employees", "attendance", "leave_requests", "payroll_runs", "payslips", "projects", "tasks", "task_comments",
];
