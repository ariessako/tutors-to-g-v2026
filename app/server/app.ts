import { mkdirSync, rmSync } from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { ZodError } from 'zod';
import type { Db } from './db';
import { HttpError, loadUser } from './auth';
import { makeUpload, type Ctx } from './context';
import { createServices } from './services';
import { authRoutes } from './routes/auth';
import { sessionRoutes } from './routes/sessions';
import { teacherRoutes } from './routes/teacher';
import { groupRoutes } from './routes/groups';
import { adminRoutes } from './routes/admin';
import { labRoutes } from './routes/lab';

export interface AppOptions {
  db: Db;
  uploadsDir: string;
  demo: boolean;
}

/** Builds the Express app serving the JSON API under /api. */
export function createApp({ db, uploadsDir, demo }: AppOptions) {
  mkdirSync(uploadsDir, { recursive: true });
  const svc = createServices(db);
  const ctx: Ctx = { db, svc, uploadsDir, demo, upload: makeUpload(uploadsDir) };
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(loadUser(db));

  // Any successful write may change who gets clustered with whom.
  app.use((req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => res.statusCode < 400 && svc.bump());
    next();
  });

  const api = express.Router();
  for (const routes of [authRoutes, sessionRoutes, teacherRoutes, groupRoutes, adminRoutes, labRoutes]) api.use(routes(ctx));
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  app.use('/api', api);

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    // Drop files multer already stored for a request that failed.
    const uploaded = [req.file, ...Object.values((req.files ?? {}) as Record<string, Express.Multer.File[]>).flat()];
    for (const f of uploaded) if (f?.path) rmSync(f.path, { force: true });
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) return void res.status(400).json({ error: err.issues[0]?.message ?? 'Check the form and try again.' });
    if (err instanceof multer.MulterError)
      return void res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 10 MB.' : 'That upload didn’t work. Try again.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
  });

  return { app, svc };
}
