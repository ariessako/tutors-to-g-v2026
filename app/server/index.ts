import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { count } from 'drizzle-orm';
import { openDb } from './db';
import { users } from './db/schema';
import { createApp } from './app';
import { seedDemo } from './seed';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.TTG_DATA ?? join(root, 'data');
const port = Number(process.env.PORT ?? 3001);
const demo = process.env.TTG_DEMO !== '0';

const db = openDb(process.env.TTG_DB ?? join(dataDir, 'ttg.db'));
if (demo && db.select({ n: count() }).from(users).get()!.n === 0) {
  console.log('Empty database: loading demo data…');
  await seedDemo(db);
}

const { app } = createApp({ db, uploadsDir: process.env.TTG_UPLOADS ?? join(dataDir, 'uploads'), demo });

// In production the built web client is served from the same origin.
const web = join(root, 'web', 'dist');
if (existsSync(web)) {
  app.use(express.static(web, { index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(web, 'index.html')));
}

app.listen(port, () => console.log(`Tutors To Go API on http://localhost:${port}${demo ? ' (demo mode)' : ''}`));
