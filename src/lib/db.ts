import "server-only";
import { BASE_SCHEMA, MIGRATIONS } from "./schema";

// One tiny query layer that works with:
//  - a real Postgres (Supabase, Neon, etc.) when DATABASE_URL is set  -> production
//  - an embedded PGlite database in ./.data when it is not             -> local development
// Both speak plain SQL with $1, $2 placeholders.

type Row = Record<string, any>;
export type Exec = <T = Row>(text: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  query: Exec;
  transaction<T>(fn: (q: Exec) => Promise<T>): Promise<T>;
  setup(sqls: string[]): Promise<void>;
}

const g = globalThis as unknown as { __shopdb?: Promise<Driver> };

async function makePg(url: string): Promise<Driver> {
  const { Pool, types } = await import("pg");
  // Return NUMERIC and BIGINT as JS numbers.
  types.setTypeParser(1700, (v: string) => parseFloat(v));
  types.setTypeParser(20, (v: string) => parseInt(v, 10));
  // Return DATE as plain YYYY-MM-DD string.
  types.setTypeParser(1082, (v: string) => v);
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return {
    query: async (text, params = []) => (await pool.query(text, params as any[])).rows,
    setup: async (sqls) => {
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock(424242)");
        for (const s of sqls) await client.query(s);
      } finally {
        await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
        client.release();
      }
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(async (text, params = []) => (await client.query(text, params as any[])).rows);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function makePglite(): Promise<Driver> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || "./.data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, {
    parsers: {
      [types.NUMERIC]: (v: string) => parseFloat(v),
      [types.INT8]: (v: string) => parseInt(v, 10),
      [types.DATE]: (v: string) => v,
    },
  });
  return {
    query: async (text, params = []) => (await db.query(text, params as any[])).rows as any[],
    setup: async (sqls) => {
      for (const s of sqls) await db.exec(s);
    },
    transaction: (fn) =>
      db.transaction(async (tx) => fn(async (text, params = []) => (await tx.query(text, params as any[])).rows as any[])),
  };
}

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  const d = url ? await makePg(url) : await makePglite();
  await d.setup([BASE_SCHEMA, ...MIGRATIONS]);
  return d;
}

function driver(): Promise<Driver> {
  if (!g.__shopdb) {
    g.__shopdb = init().catch((e) => {
      g.__shopdb = undefined;
      throw e;
    });
  }
  return g.__shopdb;
}

export const q: Exec = async (text, params) => (await driver()).query(text, params);

export async function one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export async function tx<T>(fn: (q: Exec) => Promise<T>): Promise<T> {
  return (await driver()).transaction(fn);
}

/** Next sequential document number, e.g. INV-000123. Must be called inside a transaction. */
export async function nextNumber(t: Exec, name: string, prefix: string): Promise<string> {
  const rows = await t<{ value: number }>(
    `INSERT INTO counters (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [name],
  );
  return `${prefix}${String(rows[0].value).padStart(6, "0")}`;
}
