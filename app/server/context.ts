import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import type { Db } from './db';
import { files } from './db/schema';
import type { Services } from './services';
import { HttpError } from './auth';
import { nowIso, uid } from './services';
import { CURRICULA, GRADES, HOBBIES, LEARNING, METHODS, SCHED, SUBJECTS } from '../shared/vocab';
import { validateProfile } from '../shared/matching';

export interface Ctx {
  db: Db;
  svc: Services;
  uploadsDir: string;
  /** Demo mode: shows demo accounts on the login page and allows resetting the data. */
  demo: boolean;
  upload: multer.Multer;
}

const ALLOWED_UPLOADS = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']);

export function makeUpload(uploadsDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => cb(null, randomBytes(16).toString('hex') + extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 4 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_UPLOADS.has(file.mimetype)) cb(null, true);
      else cb(new HttpError(400, 'Upload a PDF or an image (PNG, JPG, WEBP or HEIC).'));
    },
  });
}

/** Records an uploaded file and returns its id. */
export function saveFile(db: Db, ownerId: string, f: Express.Multer.File) {
  const id = uid('f_');
  db.insert(files)
    .values({ id, ownerId, originalName: f.originalname, storedName: f.filename, mime: f.mimetype, size: f.size, createdAt: nowIso() })
    .run();
  return id;
}

const oneOf = (opts: readonly string[]) => z.string().refine((v) => opts.includes(v), 'Choose from the list.');

export const profileSchema = z
  .object({
    hobbies: z.array(oneOf(HOBBIES)),
    learning: z.string().refine((v) => v === '' || (LEARNING as readonly string[]).includes(v)),
    social: z.number().min(0).max(1),
    approach: z.number().min(0).max(1),
    subjects: z.array(oneOf(SUBJECTS)),
    sched: z.array(oneOf(SCHED)),
    grades: z.array(oneOf(GRADES)),
  })
  .superRefine((p, c) => {
    const err = validateProfile(p);
    if (err) c.addIssue({ code: 'custom', message: err });
  });

export const tutorDetailsSchema = z.object({
  headline: z.string().trim().max(120).default(''),
  rate: z.number().int().min(100, 'Set a rate of at least ₱100 per hour.').max(10_000),
  years: z.number().int().min(0).max(60),
  education: z.string().trim().max(200).default(''),
  curricula: z.array(oneOf(CURRICULA)).default([]),
  method: oneOf(METHODS),
  bio: z.string().trim().max(2000).default(''),
});

export const emailSchema = z.string().trim().toLowerCase().regex(/^\S+@\S+\.\S+$/, 'Enter a valid email address.');
