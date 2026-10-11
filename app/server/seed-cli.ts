/** `npm run seed`: resets the database to the demo dataset. */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db';
import { seedDemo } from './seed';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.TTG_DATA ?? join(root, 'data');
const db = openDb(process.env.TTG_DB ?? join(dataDir, 'ttg.db'));
await seedDemo(db, process.env.TTG_UPLOADS ?? join(dataDir, 'uploads'));
console.log('Demo data loaded.');
