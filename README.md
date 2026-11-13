# ShopDesk ERP

A white-label billing, stock and repair system for mobile phone and electronics shops in the UAE.
One codebase. Each shop gets its own copy (own database, own logo, own name).

## What's inside

| Area | What it does |
|---|---|
| **POS / New sale** | Barcode and IMEI scanning, split payments (cash, card, Tabby, Tamara, bank, on credit), line discounts, change calculator, F9 to complete |
| **Tax invoices** | FTA-format tax invoice (A4) and 80 mm thermal receipt, bilingual English/Arabic headings, TRN, VAT breakdown, amount in words |
| **Returns** | Tax credit notes linked to the original invoice, stock and IMEIs go back automatically |
| **Stock** | Products with categories/brands, IMEI/serial tracking per unit, low-stock alerts, stock value, CSV import from Excel or old software |
| **Purchases** | Supplier bills with input VAT, IMEIs received, part payments and supplier balances |
| **Repairs** | Job cards (customer + shop copy + device tag), status timeline, technician assignment, WhatsApp updates, advance payments, deliver-and-invoice |
| **Buy used** | Seller ID capture (Emirates ID / passport), signed seller declaration, used phone goes into stock under the **profit margin scheme** |
| **IMEI lookup** | Full history of any phone: purchased from, bought used from, sold to, repaired, returned |
| **Customers** | Auto-saved from sales and repairs, history, outstanding balances, receive payments |
| **Expenses** | Monthly expenses with optional input VAT |
| **Reports** | Sales & profit, by category / payment method / staff, day close (expected cash in drawer), VAT 201 summary, stock valuation, slow and negative stock |
| **Staff & roles** | Owner creates roles with tick-box permissions (like Shopify staff), each staff member has their own login; price/discount/credit limits enforced at the till; staff can be limited to their own invoices |
| **Activity log** | Who did what and when: sales, refunds, price changes, stock adjustments, logins, staff and role changes |
| **Import / export / backup** | Excel & CSV import (products, customers), Excel/CSV export of every list, one-file full backup and restore |

## Tech

Next.js 16 (App Router, server actions) · PostgreSQL · Tailwind CSS 4. No ORM: plain SQL in `src/lib`.
The database tables create themselves on first start, so a new shop needs no migration step.

* With `DATABASE_URL` set → uses that Postgres (Supabase, Neon, any Postgres).
* Without it → uses an embedded database in `./.data` (local development only).

## Windows desktop app (offline, branded per shop)

Each client gets their own installer with their name and icon. Data stays on the shop computer
(`%APPDATA%\<Product>\data`), a backup is saved automatically every day to `Documents\<Product> Backups` (last 30 kept),
and other counters / phones on the shop Wi-Fi can open the address shown in **File → Use on other devices**.

**Make a new client brand:** copy `brands/default` to `brands/<client>`, edit `brand.json` (productName, executableName, appId)
and replace `icon.png` (512×512). The shop's logo, colours, TRN and invoice details are then set inside the app's Settings.

**Build the installer (free, no Windows PC needed):** on GitHub open *Actions → Build Windows installer → Run workflow*,
type the brand folder name (e.g. `zaitoon`), and download the `.exe` from the finished run.
On a Windows PC you can also run `node scripts/build-desktop.mjs --brand zaitoon --pack`.

The first launch shows a Windows SmartScreen warning ("unknown publisher") until you buy a code-signing certificate;
click *More info → Run anyway*. Windows Firewall will ask to allow network access — allow it on private networks
so other counters can connect.

## Samsung DeX, tablets and phones

ShopDesk is a web app, so on Samsung DeX it runs in Chrome or Samsung Internet. Two ways:

* **Cloud (works anywhere):** deploy to Vercel with a Postgres database (see *Set up a new shop* below), open the
  site on DeX and choose **⋮ → Add to Home screen** (Chrome) or **Add page to → Apps screen** (Samsung Internet).
  It then opens in its own resizable window with its own icon, like a desktop app.
* **Shop Wi-Fi (offline, no cloud):** run the Windows app on the shop PC, open **File → Use on other devices**
  and type that address (e.g. `http://192.168.1.20:4300`) into Chrome on DeX. Same data as the PC.

On Windows the cloud version can also be installed from Chrome or Edge (**Install app** icon in the address bar).

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000 → the setup screen creates the shop and the owner login
```

## Set up a new shop (about 10 minutes)

1. **Database:** create a free project on [supabase.com](https://supabase.com) (region: closest to UAE, e.g. Mumbai or Frankfurt).
   Go to *Connect* → copy the **Transaction pooler** connection string (port 6543) and put in the database password.
2. **Vercel:** *Add New → Project* → import this GitHub repo. Give the project the shop's name (e.g. `zaitoon-erp`).
3. Add these environment variables:
   * `DATABASE_URL` = the Supabase connection string
   * `SESSION_SECRET` = any long random text (e.g. run `openssl rand -hex 32`)
4. Deploy, open the site, and fill in the setup screen (shop name, TRN, owner login).
5. In **Settings**: upload the logo, set the brand colour, address, Arabic name and invoice terms. Add staff accounts.
6. **Stock → Import CSV** to load the shop's item list.

Every shop is a separate Vercel project + separate database, all deployed from this same repo.
Pushing an update to GitHub updates every shop on its next deploy.

## Changing the database later

Add new statements to `MIGRATIONS` in `src/lib/schema.ts` (e.g. `ALTER TABLE products ADD COLUMN IF NOT EXISTS …`).
They run automatically on every shop's next start. Never edit old statements.

## UAE VAT notes

* Selling prices are VAT-inclusive by default (switch in Settings).
* Invoices show supplier TRN, sequential number, date, line VAT and totals in AED. Customer TRN and address print when entered (needed for registered customers over AED 10,000).
* Used phones bought from people who are not VAT registered are sold under the profit margin scheme. VAT is charged on the profit only and is not shown on the invoice.
* The VAT report follows the VAT 201 boxes. Have the shop's accountant check it before filing.
* B2B e-invoicing through an Accredited Service Provider (ASP) is being phased in from 2027. This version does not include the ASP connection yet.
