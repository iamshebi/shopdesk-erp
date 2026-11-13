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
];
