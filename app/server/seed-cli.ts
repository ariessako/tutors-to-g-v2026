/** `npm run seed`: resets the database to the demo dataset. */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db';
import { seedDemo } from './seed';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.TTG_DB ?? join(process.env.TTG_DATA ?? join(root, 'data'), 'ttg.db'));
await seedDemo(db);
console.log('Demo data loaded.');
