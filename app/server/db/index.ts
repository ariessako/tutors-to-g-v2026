import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

const here = dirname(fileURLToPath(import.meta.url));
/** Migrations live next to the schema in dev and are copied beside the bundle in production builds. */
const MIGRATIONS = process.env.TTG_MIGRATIONS ?? join(here, 'migrations');

export type Db = ReturnType<typeof openDb>;

/** Opens (creating if needed) the SQLite database and applies pending migrations. */
export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}
