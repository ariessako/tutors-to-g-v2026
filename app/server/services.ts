import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { applications, reviews, settings as settingsTable, users } from './db/schema';
import { cluster, matchesFor, type ClusterResult, type PersonInput } from '../shared/matching';
import type { Settings } from '../shared/types';

export const uid = (prefix: string) => prefix + randomBytes(6).toString('base64url');
export const nowIso = () => new Date().toISOString();

export const DEFAULT_SETTINGS: Settings = { k: 4, seed: 7, init: 'kmeans++', approach: 'joint' };

export interface TutorStats {
  avg: number;
  count: number;
  /** Counts of 5★ down to 1★. */
  dist: number[];
}

/**
 * Matching and aggregate helpers. Clustering results are cached until any
 * write request bumps the data version.
 */
export function createServices(db: Db) {
  let version = 0;
  const cache = new Map<string, ClusterResult>();

  function bump() {
    version++;
    cache.clear();
  }

  function getSettings(): Settings {
    const row = db.select().from(settingsTable).where(eq(settingsTable.id, 1)).get();
    return row ? { k: row.k, seed: row.seed, init: row.init, approach: row.approach } : DEFAULT_SETTINGS;
  }

  /** Active students and active, approved tutors: the people k-means clusters. */
  function pool(): PersonInput[] {
    const students = db
      .select({ id: users.id, name: users.name, profile: users.profile })
      .from(users)
      .where(and(eq(users.role, 'student'), eq(users.status, 'active')))
      .all();
    const tutors = db
      .select({ id: users.id, name: users.name, profile: users.profile })
      .from(users)
      .innerJoin(applications, eq(applications.userId, users.id))
      .where(and(eq(users.role, 'teacher'), eq(users.status, 'active'), eq(applications.status, 'approved')))
      .all();
    return [
      ...students.filter((s) => s.profile).map((s) => ({ id: s.id, name: s.name, role: 'student' as const, profile: s.profile! })),
      ...tutors.filter((t) => t.profile).map((t) => ({ id: t.id, name: t.name, role: 'teacher' as const, profile: t.profile! })),
    ];
  }

  function clusterNow(s: Settings = getSettings()) {
    const key = [version, s.k, s.seed, s.init, s.approach].join('|');
    let res = cache.get(key);
    if (!res) {
      res = cluster(pool(), s);
      cache.set(key, res);
    }
    return res;
  }

  const matches = (studentId: string) => matchesFor(clusterNow(), studentId);

  /** Rating stats per tutor, counting only reviews that aren't hidden. */
  function allTutorStats(): Map<string, TutorStats> {
    const out = new Map<string, TutorStats>();
    const rows = db.select({ tutorId: reviews.tutorId, rating: reviews.rating }).from(reviews).where(eq(reviews.hidden, false)).all();
    for (const r of rows) {
      let s = out.get(r.tutorId);
      if (!s) out.set(r.tutorId, (s = { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] }));
      s.avg += r.rating;
      s.count++;
      s.dist[5 - r.rating]++;
    }
    for (const s of out.values()) s.avg = Math.round((s.avg / s.count) * 10) / 10;
    return out;
  }

  const tutorStats = (tutorId: string): TutorStats => allTutorStats().get(tutorId) ?? { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] };

  return { bump, getSettings, pool, clusterNow, matches, allTutorStats, tutorStats };
}

export type Services = ReturnType<typeof createServices>;
