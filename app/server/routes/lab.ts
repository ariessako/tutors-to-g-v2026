import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { files } from '../db/schema';
import { HttpError, requireUser } from '../auth';
import { childIdsOf } from '../services';
import type { Ctx } from '../context';

export function labRoutes(ctx: Ctx) {
  const { db, svc } = ctx;
  const r = Router();

  /**
   * The dataset the K-means lab clusters in the browser. Admins see every
   * name; everyone else sees other students as numbered, anonymous learners.
   */
  r.get('/lab', (req, res) => {
    const me = requireUser(req);
    const people = svc.pool();
    const own = new Set(me.role === 'student' ? [me.id] : me.role === 'parent' ? childIdsOf(db, me.id) : []);
    let n = 0;
    const shown = people.map((p) => ({
      id: p.id,
      role: p.role,
      profile: p.profile,
      name: p.role === 'teacher' || me.role === 'admin' || own.has(p.id) ? p.name : `Student ${++n}`,
    }));
    const firstStudent = shown.find((p) => p.role === 'student');
    const spot = shown.find((p) => own.has(p.id))?.id ?? (shown.some((p) => p.id === 's_bea') ? 's_bea' : (firstStudent?.id ?? null));
    res.json({ settings: svc.getSettings(), canEdit: me.role === 'admin', people: shown, spotlight: spot });
  });

  /** Downloads an uploaded file. Admins can open any file; others only their own uploads. */
  r.get('/files/:id', (req, res) => {
    const me = requireUser(req);
    const f = db.select().from(files).where(eq(files.id, req.params.id)).get();
    if (!f || (me.role !== 'admin' && f.ownerId !== me.id)) throw new HttpError(404, 'File not found.');
    const path = join(ctx.uploadsDir, f.storedName);
    if (!existsSync(path)) throw new HttpError(404, 'File not found.');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
    createReadStream(path).pipe(res);
  });

  return r;
}
