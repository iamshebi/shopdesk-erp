import { DEFAULT_ROLES } from "./permissions";

// Database schema. Every statement is idempotent so it can run on every cold start.
// To change the schema later, append new statements to MIGRATIONS (never edit old ones).

export const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  track_serial BOOLEAN NOT NULL DEFAULT FALSE,
  is_service BOOLEAN NOT NULL DEFAULT FALSE,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  trn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  trn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id),
  bill_ref TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS buybacks (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  seller_name TEXT NOT NULL,
  seller_phone TEXT NOT NULL DEFAULT '',
  id_type TEXT NOT NULL DEFAULT 'Emirates ID',
  id_number TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  product_id INTEGER NOT NULL REFERENCES products(id),
  imei TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT '',
  price_paid NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'invoice',
  ref_sale_id INTEGER REFERENCES sales(id),
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_trn TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  repair_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales (date);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  imei TEXT NOT NULL,
  imei2 TEXT NOT NULL DEFAULT '',
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'in_stock',
  source TEXT NOT NULL DEFAULT 'purchase',
  margin_scheme BOOLEAN NOT NULL DEFAULT FALSE,
  purchase_id INTEGER REFERENCES purchases(id),
  buyback_id INTEGER REFERENCES buybacks(id),
  sale_id INTEGER REFERENCES sales(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS units_imei_idx ON units (imei);
CREATE INDEX IF NOT EXISTS units_product_idx ON units (product_id, status);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  unit_id INTEGER REFERENCES units(id),
  ref_item_id INTEGER,
  description TEXT NOT NULL,
  imei TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net NUMERIC(12,2) NOT NULL,
  vat NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_scheme BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repairs (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL,
  imei TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL,
  accessories TEXT NOT NULL DEFAULT '',
  condition_notes TEXT NOT NULL DEFAULT '',
  passcode TEXT NOT NULL DEFAULT '',
  estimate NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_method TEXT NOT NULL DEFAULT 'cash',
  final_charge NUMERIC(12,2),
  parts_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  technician_id INTEGER REFERENCES users(id),
  promised_at DATE,
  sale_id INTEGER REFERENCES sales(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS repair_logs (
  id SERIAL PRIMARY KEY,
  repair_id INTEGER NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC(12,2) NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

export const MIGRATIONS: string[] = [
  // Add future schema changes at the END of this list. Every statement must be safe to run again.

  // 1. Admin-defined roles with permissions
  `CREATE TABLE IF NOT EXISTS roles (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     permissions TEXT NOT NULL DEFAULT '[]',
     locked BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);
   ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
   INSERT INTO roles (name, permissions, locked)
     SELECT v.name, v.permissions, v.locked FROM (VALUES ${DEFAULT_ROLES.map(
       (r) => `(${sqlStr(r.name)}, ${sqlStr(JSON.stringify(r.perms))}, ${r.locked ? "TRUE" : "FALSE"})`,
     ).join(", ")}) AS v(name, permissions, locked)
     WHERE NOT EXISTS (SELECT 1 FROM roles);
   UPDATE users u SET role_id = r.id FROM roles r WHERE u.role_id IS NULL AND lower(r.name) = lower(u.role);
   UPDATE users SET role_id = (SELECT id FROM roles WHERE locked ORDER BY id LIMIT 1) WHERE role_id IS NULL;`,

  // 2. Activity log
  `CREATE TABLE IF NOT EXISTS activity (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     action TEXT NOT NULL,
     details TEXT NOT NULL DEFAULT '',
     ref TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS activity_created_idx ON activity (created_at DESC);`,

  // 3. Security: server-side sessions, login history, lockout, two-factor login
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     ip TEXT NOT NULL DEFAULT '',
     user_agent TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     revoked_at TIMESTAMPTZ
   );
   CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, revoked_at);
   CREATE TABLE IF NOT EXISTS login_events (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     username TEXT NOT NULL DEFAULT '',
     success BOOLEAN NOT NULL,
     reason TEXT NOT NULL DEFAULT '',
     ip TEXT NOT NULL DEFAULT '',
     user_agent TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS login_events_created_idx ON login_events (created_at DESC);
   ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT NOT NULL DEFAULT '';
   ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;`,

  // 4. Products v2: status, tags, description, website and SEO fields, change history
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS specs TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price NUMERIC(12,2);
   ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE products ADD COLUMN IF NOT EXISTS website_visible BOOLEAN NOT NULL DEFAULT TRUE;
   ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
   CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);
   CREATE TABLE IF NOT EXISTS product_history (
     id SERIAL PRIMARY KEY,
     product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     field TEXT NOT NULL,
     old_value TEXT NOT NULL DEFAULT '',
     new_value TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'edit',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS product_history_idx ON product_history (product_id, created_at DESC);`,

  // 5. Warehouses: stock per location, transfers, adjustments, stock counts, movement history
  `CREATE TABLE IF NOT EXISTS warehouses (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     code TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '',
     is_default BOOLEAN NOT NULL DEFAULT FALSE,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   INSERT INTO warehouses (name, code, is_default) SELECT 'Main shop', 'MAIN', TRUE WHERE NOT EXISTS (SELECT 1 FROM warehouses);
   CREATE TABLE IF NOT EXISTS product_stock (
     product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
     qty INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (product_id, warehouse_id)
   );
   ALTER TABLE units ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);
   CREATE TABLE IF NOT EXISTS stock_moves (
     id SERIAL PRIMARY KEY,
     product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     warehouse_id INTEGER REFERENCES warehouses(id),
     unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
     qty INTEGER NOT NULL,
     type TEXT NOT NULL,
     reason TEXT NOT NULL DEFAULT '',
     ref TEXT NOT NULL DEFAULT '',
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS stock_moves_product_idx ON stock_moves (product_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS stock_moves_created_idx ON stock_moves (created_at DESC);
   CREATE TABLE IF NOT EXISTS stock_transfers (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
     to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
     notes TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS stock_transfer_items (
     id SERIAL PRIMARY KEY,
     transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
     product_id INTEGER NOT NULL REFERENCES products(id),
     unit_id INTEGER REFERENCES units(id),
     qty INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS stock_counts (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
     category TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'open',
     notes TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     applied_at TIMESTAMPTZ
   );
   CREATE TABLE IF NOT EXISTS stock_count_items (
     id SERIAL PRIMARY KEY,
     count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
     product_id INTEGER NOT NULL REFERENCES products(id),
     expected INTEGER NOT NULL,
     counted INTEGER,
     cost NUMERIC(12,2) NOT NULL DEFAULT 0
   );
   INSERT INTO product_stock (product_id, warehouse_id, qty)
     SELECT p.id, (SELECT id FROM warehouses WHERE is_default ORDER BY id LIMIT 1), p.stock_qty
     FROM products p WHERE NOT p.track_serial AND NOT p.is_service AND p.stock_qty <> 0
       AND NOT EXISTS (SELECT 1 FROM product_stock);
   UPDATE units SET warehouse_id = (SELECT id FROM warehouses WHERE is_default ORDER BY id LIMIT 1) WHERE warehouse_id IS NULL;`,

  // 6. Sales orders and quotations (also printed as proforma invoices and delivery notes)
  `CREATE TABLE IF NOT EXISTS orders (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL DEFAULT 'order',
     status TEXT NOT NULL DEFAULT 'draft',
     customer_id INTEGER REFERENCES customers(id),
     customer_name TEXT NOT NULL DEFAULT '',
     customer_phone TEXT NOT NULL DEFAULT '',
     customer_email TEXT NOT NULL DEFAULT '',
     customer_trn TEXT NOT NULL DEFAULT '',
     customer_address TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'shop',
     sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     valid_until DATE,
     delivery_method TEXT NOT NULL DEFAULT 'pickup',
     delivery_address TEXT NOT NULL DEFAULT '',
     delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
     courier TEXT NOT NULL DEFAULT '',
     tracking_no TEXT NOT NULL DEFAULT '',
     expected_date DATE,
     advance NUMERIC(12,2) NOT NULL DEFAULT 0,
     advance_method TEXT NOT NULL DEFAULT 'cash',
     subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
     discount NUMERIC(12,2) NOT NULL DEFAULT 0,
     vat NUMERIC(12,2) NOT NULL DEFAULT 0,
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     terms TEXT NOT NULL DEFAULT '',
     sale_id INTEGER REFERENCES sales(id),
     ref_order_id INTEGER REFERENCES orders(id),
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS orders_kind_status_idx ON orders (kind, status);
   CREATE TABLE IF NOT EXISTS order_items (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     product_id INTEGER REFERENCES products(id),
     description TEXT NOT NULL,
     qty INTEGER NOT NULL,
     unit_price NUMERIC(12,2) NOT NULL,
     discount NUMERIC(12,2) NOT NULL DEFAULT 0,
     net NUMERIC(12,2) NOT NULL DEFAULT 0,
     vat NUMERIC(12,2) NOT NULL DEFAULT 0,
     total NUMERIC(12,2) NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS order_events (
     id SERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,

  // 7. Website connection: product links to the website catalogue, publish history
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS web_id TEXT NOT NULL DEFAULT '';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
   CREATE INDEX IF NOT EXISTS products_web_id_idx ON products (web_id);
   CREATE TABLE IF NOT EXISTS website_publishes (
     id SERIAL PRIMARY KEY,
     summary TEXT NOT NULL DEFAULT '',
     added INTEGER NOT NULL DEFAULT 0,
     updated INTEGER NOT NULL DEFAULT 0,
     commit_sha TEXT NOT NULL DEFAULT '',
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,

  // 8. Accounting: chart of accounts, double-entry journal, bank reconciliation
  `CREATE TABLE IF NOT EXISTS accounts (
     id SERIAL PRIMARY KEY,
     code TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     system_key TEXT NOT NULL DEFAULT '',
     is_bank BOOLEAN NOT NULL DEFAULT FALSE,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS journal_entries (
     id SERIAL PRIMARY KEY,
     date DATE NOT NULL,
     number TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT '',
     memo TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE UNIQUE INDEX IF NOT EXISTS journal_source_idx ON journal_entries (source) WHERE source <> '';
   CREATE INDEX IF NOT EXISTS journal_date_idx ON journal_entries (date);
   CREATE TABLE IF NOT EXISTS bank_reconciliations (
     id SERIAL PRIMARY KEY,
     account_id INTEGER NOT NULL REFERENCES accounts(id),
     statement_date DATE NOT NULL,
     statement_balance NUMERIC(14,2) NOT NULL,
     notes TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS journal_lines (
     id SERIAL PRIMARY KEY,
     entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
     account_id INTEGER NOT NULL REFERENCES accounts(id),
     debit NUMERIC(14,2) NOT NULL DEFAULT 0,
     credit NUMERIC(14,2) NOT NULL DEFAULT 0,
     memo TEXT NOT NULL DEFAULT '',
     reconciliation_id INTEGER REFERENCES bank_reconciliations(id) ON DELETE SET NULL
   );
   CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines (account_id);
   CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines (entry_id);`,

  // 9. CRM (leads, activities, customer groups) and customer support (tickets, knowledge base)
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_name TEXT NOT NULL DEFAULT '';
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0;
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
   CREATE TABLE IF NOT EXISTS leads (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     phone TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     company TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'walk-in',
     interest TEXT NOT NULL DEFAULT '',
     value NUMERIC(12,2) NOT NULL DEFAULT 0,
     stage TEXT NOT NULL DEFAULT 'new',
     owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     next_followup DATE,
     lost_reason TEXT NOT NULL DEFAULT '',
     customer_id INTEGER REFERENCES customers(id),
     notes TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS crm_activities (
     id SERIAL PRIMARY KEY,
     customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
     lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
     type TEXT NOT NULL DEFAULT 'note',
     body TEXT NOT NULL DEFAULT '',
     due_date DATE,
     done BOOLEAN NOT NULL DEFAULT FALSE,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS crm_activities_due_idx ON crm_activities (done, due_date);
   CREATE TABLE IF NOT EXISTS tickets (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     customer_id INTEGER REFERENCES customers(id),
     customer_name TEXT NOT NULL DEFAULT '',
     customer_phone TEXT NOT NULL DEFAULT '',
     subject TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'inquiry',
     priority TEXT NOT NULL DEFAULT 'normal',
     status TEXT NOT NULL DEFAULT 'open',
     channel TEXT NOT NULL DEFAULT 'shop',
     reference TEXT NOT NULL DEFAULT '',
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     resolved_at TIMESTAMPTZ
   );
   CREATE TABLE IF NOT EXISTS ticket_messages (
     id SERIAL PRIMARY KEY,
     ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     internal BOOLEAN NOT NULL DEFAULT FALSE,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS kb_articles (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT 'General',
     published BOOLEAN NOT NULL DEFAULT TRUE,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,

  // 10. HR (departments, employees, attendance, leave, payroll) and tasks / projects
  `CREATE TABLE IF NOT EXISTS departments (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
   CREATE TABLE IF NOT EXISTS employees (
     id SERIAL PRIMARY KEY,
     code TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     phone TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     designation TEXT NOT NULL DEFAULT '',
     department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     join_date DATE,
     basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
     allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
     annual_leave_days NUMERIC(5,1) NOT NULL DEFAULT 30,
     labour_card_no TEXT NOT NULL DEFAULT '',
     bank_routing TEXT NOT NULL DEFAULT '',
     iban TEXT NOT NULL DEFAULT '',
     active BOOLEAN NOT NULL DEFAULT TRUE,
     notes TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS attendance (
     id SERIAL PRIMARY KEY,
     employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
     date DATE NOT NULL,
     status TEXT NOT NULL DEFAULT 'present',
     check_in TEXT NOT NULL DEFAULT '',
     check_out TEXT NOT NULL DEFAULT '',
     overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
     note TEXT NOT NULL DEFAULT '',
     UNIQUE (employee_id, date)
   );
   CREATE TABLE IF NOT EXISTS leave_requests (
     id SERIAL PRIMARY KEY,
     employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
     type TEXT NOT NULL DEFAULT 'annual',
     from_date DATE NOT NULL,
     to_date DATE NOT NULL,
     days NUMERIC(5,1) NOT NULL DEFAULT 1,
     reason TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS payroll_runs (
     id SERIAL PRIMARY KEY,
     month TEXT NOT NULL UNIQUE,
     status TEXT NOT NULL DEFAULT 'draft',
     method TEXT NOT NULL DEFAULT 'bank',
     paid_date DATE,
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS payslips (
     id SERIAL PRIMARY KEY,
     run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
     employee_id INTEGER NOT NULL REFERENCES employees(id),
     days_paid NUMERIC(5,1) NOT NULL DEFAULT 30,
     unpaid_days NUMERIC(5,1) NOT NULL DEFAULT 0,
     basic NUMERIC(12,2) NOT NULL DEFAULT 0,
     allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
     overtime NUMERIC(12,2) NOT NULL DEFAULT 0,
     bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
     deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
     net NUMERIC(12,2) NOT NULL DEFAULT 0,
     note TEXT NOT NULL DEFAULT '',
     UNIQUE (run_id, employee_id)
   );
   CREATE TABLE IF NOT EXISTS projects (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'active',
     due_date DATE,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS tasks (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     status TEXT NOT NULL DEFAULT 'todo',
     priority TEXT NOT NULL DEFAULT 'normal',
     due_date DATE,
     link TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     done_at TIMESTAMPTZ
   );
   CREATE TABLE IF NOT EXISTS task_comments (
     id SERIAL PRIMARY KEY,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,

  // 11. Marketing (coupons, loyalty), recurring invoices, multi-currency, shipping, payment links,
  //     API keys, webhooks, automation, email log
  `CREATE TABLE IF NOT EXISTS coupons (
     id SERIAL PRIMARY KEY,
     code TEXT NOT NULL UNIQUE,
     type TEXT NOT NULL DEFAULT 'percent',
     value NUMERIC(12,2) NOT NULL DEFAULT 0,
     min_total NUMERIC(12,2) NOT NULL DEFAULT 0,
     starts_on DATE,
     ends_on DATE,
     max_uses INTEGER NOT NULL DEFAULT 0,
     uses INTEGER NOT NULL DEFAULT 0,
     customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
     note TEXT NOT NULL DEFAULT '',
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS loyalty_ledger (
     id SERIAL PRIMARY KEY,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     points INTEGER NOT NULL,
     sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
     note TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_code TEXT NOT NULL DEFAULT '';
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS pay_link TEXT NOT NULL DEFAULT '';
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS pay_link_ref TEXT NOT NULL DEFAULT '';
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_date DATE;
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(14,6) NOT NULL DEFAULT 1;
   CREATE TABLE IF NOT EXISTS currencies (
     code TEXT PRIMARY KEY,
     name TEXT NOT NULL DEFAULT '',
     rate NUMERIC(14,6) NOT NULL DEFAULT 1,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS recurring_invoices (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     customer_id INTEGER NOT NULL REFERENCES customers(id),
     lines JSONB NOT NULL DEFAULT '[]',
     every TEXT NOT NULL DEFAULT 'month',
     next_date DATE NOT NULL,
     end_date DATE,
     due_days INTEGER NOT NULL DEFAULT 7,
     auto_email BOOLEAN NOT NULL DEFAULT FALSE,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     runs INTEGER NOT NULL DEFAULT 0,
     last_sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS shipments (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
     sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
     customer_name TEXT NOT NULL DEFAULT '',
     customer_phone TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '',
     courier TEXT NOT NULL DEFAULT '',
     tracking_no TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     cost NUMERIC(12,2) NOT NULL DEFAULT 0,
     cod_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
     cod_collected BOOLEAN NOT NULL DEFAULT FALSE,
     notes TEXT NOT NULL DEFAULT '',
     shipped_at TIMESTAMPTZ,
     delivered_at TIMESTAMPTZ,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS api_keys (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     prefix TEXT NOT NULL,
     key_hash TEXT NOT NULL UNIQUE,
     scopes TEXT NOT NULL DEFAULT 'read',
     last_used_at TIMESTAMPTZ,
     revoked BOOLEAN NOT NULL DEFAULT FALSE,
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS webhooks (
     id SERIAL PRIMARY KEY,
     url TEXT NOT NULL,
     events TEXT NOT NULL DEFAULT '*',
     secret TEXT NOT NULL,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS webhook_deliveries (
     id SERIAL PRIMARY KEY,
     webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
     event TEXT NOT NULL,
     status INTEGER NOT NULL DEFAULT 0,
     response TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS automation_rules (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     trigger TEXT NOT NULL,
     threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
     action TEXT NOT NULL,
     assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     email TEXT NOT NULL DEFAULT '',
     active BOOLEAN NOT NULL DEFAULT TRUE,
     last_run_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS automation_log (
     id SERIAL PRIMARY KEY,
     rule_id INTEGER REFERENCES automation_rules(id) ON DELETE CASCADE,
     dedupe_key TEXT NOT NULL,
     message TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (rule_id, dedupe_key)
   );
   CREATE TABLE IF NOT EXISTS email_log (
     id SERIAL PRIMARY KEY,
     to_addr TEXT NOT NULL,
     subject TEXT NOT NULL,
     status TEXT NOT NULL,
     error TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );`,

  // 12. Files & documents, product variants/custom fields/related/approval, categories & brands,
  //     bin locations, batches & expiry, purchase orders & approvals, debit notes, commissions,
  //     store credit, expense approval, books lock
  `CREATE TABLE IF NOT EXISTS files (
     id SERIAL PRIMARY KEY,
     kind TEXT NOT NULL,
     owner_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     mime TEXT NOT NULL DEFAULT 'application/octet-stream',
     size INTEGER NOT NULL DEFAULT 0,
     data BYTEA NOT NULL,
     sort INTEGER NOT NULL DEFAULT 0,
     uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS files_owner_idx ON files (kind, owner_id);
   ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
   ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS related_ids INTEGER[] NOT NULL DEFAULT '{}';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
   ALTER TABLE products ADD COLUMN IF NOT EXISTS track_batch BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_list JSONB NOT NULL DEFAULT '{}';
   ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
   ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}';
   CREATE TABLE IF NOT EXISTS custom_fields (
     id SERIAL PRIMARY KEY,
     entity TEXT NOT NULL,
     key TEXT NOT NULL,
     label TEXT NOT NULL,
     type TEXT NOT NULL DEFAULT 'text',
     options TEXT NOT NULL DEFAULT '',
     required BOOLEAN NOT NULL DEFAULT FALSE,
     sort INTEGER NOT NULL DEFAULT 0,
     UNIQUE (entity, key)
   );
   CREATE TABLE IF NOT EXISTS categories (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
     description TEXT NOT NULL DEFAULT '',
     sort INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS brands (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     description TEXT NOT NULL DEFAULT '',
     website TEXT NOT NULL DEFAULT ''
   );
   INSERT INTO categories (name) SELECT DISTINCT category FROM products WHERE category <> '' ON CONFLICT DO NOTHING;
   INSERT INTO brands (name) SELECT DISTINCT brand FROM products WHERE brand <> '' ON CONFLICT DO NOTHING;
   ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
   CREATE TABLE IF NOT EXISTS batches (
     id SERIAL PRIMARY KEY,
     product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
     warehouse_id INTEGER REFERENCES warehouses(id),
     batch_no TEXT NOT NULL,
     expiry_date DATE,
     qty INTEGER NOT NULL DEFAULT 0,
     cost NUMERIC(12,2) NOT NULL DEFAULT 0,
     purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS batches_product_idx ON batches (product_id, expiry_date);
   CREATE TABLE IF NOT EXISTS purchase_orders (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     supplier_id INTEGER REFERENCES suppliers(id),
     status TEXT NOT NULL DEFAULT 'request',
     warehouse_id INTEGER REFERENCES warehouses(id),
     expected_date DATE,
     supplier_quote_ref TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
     requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     approved_at TIMESTAMPTZ,
     sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS purchase_order_items (
     id SERIAL PRIMARY KEY,
     po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
     product_id INTEGER NOT NULL REFERENCES products(id),
     qty INTEGER NOT NULL,
     unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
     received_qty INTEGER NOT NULL DEFAULT 0
   );
   ALTER TABLE purchases ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL;
   ALTER TABLE purchases ADD COLUMN IF NOT EXISTS due_date DATE;
   ALTER TABLE purchases ADD COLUMN IF NOT EXISTS returned NUMERIC(12,2) NOT NULL DEFAULT 0;
   ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT '';
   ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
   CREATE TABLE IF NOT EXISTS purchase_returns (
     id SERIAL PRIMARY KEY,
     number TEXT NOT NULL UNIQUE,
     purchase_id INTEGER NOT NULL REFERENCES purchases(id),
     supplier_id INTEGER REFERENCES suppliers(id),
     date DATE NOT NULL DEFAULT CURRENT_DATE,
     subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
     vat NUMERIC(12,2) NOT NULL DEFAULT 0,
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     reason TEXT NOT NULL DEFAULT '',
     created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS purchase_return_items (
     id SERIAL PRIMARY KEY,
     return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
     purchase_item_id INTEGER,
     product_id INTEGER NOT NULL REFERENCES products(id),
     unit_id INTEGER,
     qty INTEGER NOT NULL,
     unit_cost NUMERIC(12,2) NOT NULL,
     vat NUMERIC(12,2) NOT NULL DEFAULT 0,
     total NUMERIC(12,2) NOT NULL DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS notifications (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     link TEXT NOT NULL DEFAULT '',
     kind TEXT NOT NULL DEFAULT 'info',
     read_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at);
   ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_base TEXT NOT NULL DEFAULT 'profit';
   ALTER TABLE sales ADD COLUMN IF NOT EXISTS sales_rep_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
   ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
   ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
   ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;`,
];
