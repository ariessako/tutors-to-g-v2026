/**
 * Feature encoding, k-means, PCA and match scoring.
 *
 * Pure functions with no I/O, so the server (live matches) and the browser
 * (K-means lab) run exactly the same computation and get the same answers.
 */
import { GRADES, HOBBIES, LEARNING, SCHED, SUBJECTS } from './vocab';
import type { Profile, Settings } from './types';

interface BlockDef {
  key: 'hobbies' | 'learning' | 'personality' | 'subjects' | 'sched' | 'grades';
  label: string;
  opts: readonly string[];
  /** Weight applied to every feature in the block. */
  w: number;
  /** Largest number of features two profiles can differ on in this block. */
  maxDiff: number;
  why: string;
}

export interface Block extends BlockDef {
  start: number;
  end: number;
  /** Largest possible distance contributed by this block. */
  bmax: number;
}

const BLOCK_DEFS: BlockDef[] = [
  { key: 'hobbies', label: 'Hobbies', opts: HOBBIES, w: 1.4, maxDiff: 6, why: 'Weighted highest. Shared interests are the signal the study links to stronger student motivation.' },
  { key: 'learning', label: 'Learning style', opts: LEARNING, w: 1.0, maxDiff: 2, why: 'How the student learns best vs. how the tutor teaches best.' },
  { key: 'personality', label: 'Personality', opts: ['Extroverted', 'Exploratory'], w: 1.0, maxDiff: 2, why: 'Two 0–1 scales: introvert → extrovert, structured → exploratory.' },
  { key: 'subjects', label: 'Subjects', opts: SUBJECTS, w: 0.9, maxDiff: 5, why: 'Subjects the student needs vs. subjects the tutor teaches.' },
  { key: 'sched', label: 'Schedule', opts: SCHED, w: 0.6, maxDiff: 4, why: 'Overlapping free time.' },
  { key: 'grades', label: 'Grade level', opts: GRADES, w: 0.6, maxDiff: 3, why: "The student's level vs. levels the tutor handles." },
];

export const BLOCKS: Block[] = (() => {
  let off = 0;
  return BLOCK_DEFS.map((b) => {
    const start = off;
    off += b.opts.length;
    return { ...b, start, end: off, bmax: b.w * Math.sqrt(b.maxDiff) };
  });
})();

/** Number of dimensions in an encoded profile. */
export const DIM = BLOCKS[BLOCKS.length - 1].end;
/** Largest possible distance between two profiles. */
export const DMAX = Math.sqrt(BLOCKS.reduce((s, b) => s + b.bmax * b.bmax, 0));
/** Human-readable name of each dimension. */
export const FEAT: string[] = BLOCKS.flatMap((b) => [...b.opts]);

export type Vec = number[];

export function encode(p: Profile): Vec {
  const v: Vec = [];
  for (const b of BLOCKS) {
    if (b.key === 'personality') v.push(+p.social * b.w, +p.approach * b.w);
    else if (b.key === 'learning') b.opts.forEach((o) => v.push(o === p.learning ? b.w : 0));
    else {
      const chosen = p[b.key] || [];
      b.opts.forEach((o) => v.push(chosen.includes(o) ? b.w : 0));
    }
  }
  return v;
}

export const dist2 = (a: Vec, b: Vec) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
};
export const dist = (a: Vec, b: Vec) => Math.sqrt(dist2(a, b));
const dot = (a: Vec, b: Vec) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
export const argmin = (a: number[]) => {
  let m = 0;
  for (let i = 1; i < a.length; i++) if (a[i] < a[m]) m = i;
  return m;
};

/** Seeded PRNG (mulberry32) so runs are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initCentroids(X: Vec[], k: number, r: () => number, method: Settings['init']) {
  const n = X.length;
  const idx: number[] = [];
  if (method === 'random') {
    while (idx.length < k) {
      const i = Math.floor(r() * n);
      if (!idx.includes(i)) idx.push(i);
    }
  } else {
    // k-means++: each next centroid is drawn with probability ∝ D(x)².
    idx.push(Math.floor(r() * n));
    while (idx.length < k) {
      const d2 = X.map((x) => Math.min(...idx.map((j) => dist2(x, X[j]))));
      const tot = d2.reduce((a, b) => a + b, 0);
      let t = r() * tot;
      let pick = 0;
      for (let i = 0; i < n; i++) {
        t -= d2[i];
        if (t <= 0) {
          pick = i;
          break;
        }
      }
      if (idx.includes(pick)) pick = d2.indexOf(Math.max(...d2));
      idx.push(pick);
    }
  }
  return { idx, C: idx.map((i) => X[i].slice()) };
}

export type KStep =
  | { type: 'init'; iter: 0; centroids: Vec[]; initIdx: number[] }
  | { type: 'assign'; iter: number; centroids: Vec[]; assign: number[]; changed: number; wcss: number; converged: boolean }
  | { type: 'update'; iter: number; centroids: Vec[]; assign: number[]; moved: number[]; wcss: number; counts: number[] };

export interface KMeansResult {
  hist: KStep[];
  centroids: Vec[];
  assign: number[];
  wcss: number;
  iterations: number;
}

export function kmeans(X: Vec[], kIn: number, opt: { seed?: number; init?: Settings['init'] } = {}): KMeansResult {
  const r = rng(opt.seed || 7);
  const n = X.length;
  if (!n) return { hist: [], centroids: [], assign: [], wcss: 0, iterations: 0 };
  const d = X[0].length;
  const k = Math.max(1, Math.min(kIn, n));
  const init = initCentroids(X, k, r, opt.init || 'kmeans++');
  let C = init.C;
  let assign: number[] = new Array(n).fill(-1);
  let wcss = 0;
  const hist: KStep[] = [{ type: 'init', iter: 0, centroids: C.map((c) => c.slice()), initIdx: init.idx }];
  for (let it = 1; it <= 40; it++) {
    const D = X.map((x) => C.map((c) => dist(x, c)));
    const na = D.map(argmin);
    const changed = na.reduce((s, a, i) => s + (a !== assign[i] ? 1 : 0), 0);
    assign = na;
    wcss = D.reduce((s, ds, i) => s + ds[na[i]] * ds[na[i]], 0);
    const converged = it > 1 && changed === 0;
    hist.push({ type: 'assign', iter: it, centroids: C.map((c) => c.slice()), assign: na.slice(), changed, wcss, converged });
    if (converged) break;
    const sums = C.map(() => new Array(d).fill(0));
    const cnt = new Array(k).fill(0);
    X.forEach((x, i) => {
      cnt[na[i]]++;
      for (let j = 0; j < d; j++) sums[na[i]][j] += x[j];
    });
    const NC = sums.map((s, j) => (cnt[j] ? s.map((v: number) => v / cnt[j]) : C[j].slice()));
    const moved = NC.map((c, j) => dist(c, C[j]));
    C = NC;
    const w2 = X.reduce((s, x, i) => s + dist2(x, C[na[i]]), 0);
    hist.push({ type: 'update', iter: it, centroids: C.map((c) => c.slice()), assign: na.slice(), moved, wcss: w2, counts: cnt });
  }
  return { hist, centroids: C, assign, wcss, iterations: hist[hist.length - 1].iter };
}

export interface Pca {
  project: (x: Vec) => [number, number];
  explained: [number, number];
  load1: { pos: string[]; neg: string[] };
  load2: { pos: string[]; neg: string[] };
}

/** Two principal components by power iteration, for drawing the clusters in 2D. */
export function pca2(X: Vec[]): Pca {
  const n = X.length;
  if (!n) return { project: () => [0, 0], explained: [0, 0], load1: { pos: [], neg: [] }, load2: { pos: [], neg: [] } };
  const d = X[0].length;
  const mu = new Array(d).fill(0);
  X.forEach((x) => x.forEach((v, i) => (mu[i] += v / n)));
  const Z = X.map((x) => x.map((v, i) => v - mu[i]));
  const power = (Zm: Vec[], seed: Vec) => {
    let v = seed.slice();
    for (let it = 0; it < 80; it++) {
      const s = Zm.map((z) => dot(z, v));
      const w = new Array(d).fill(0);
      Zm.forEach((z, i) => {
        for (let j = 0; j < d; j++) w[j] += z[j] * s[i];
      });
      const nr = Math.sqrt(dot(w, w)) || 1;
      v = w.map((x) => x / nr);
    }
    return v;
  };
  const v1 = power(Z, Array.from({ length: d }, (_, j) => 1 + (j % 5) * 0.13));
  const Z2 = Z.map((z) => {
    const p = dot(z, v1);
    return z.map((x, j) => x - p * v1[j]);
  });
  const v2 = power(Z2, Array.from({ length: d }, (_, j) => 1 - (j % 7) * 0.11));
  const tot = Z.reduce((s, z) => s + dot(z, z), 0) || 1;
  const e1 = Z.reduce((s, z) => s + dot(z, v1) ** 2, 0) / tot;
  const e2 = Z.reduce((s, z) => s + dot(z, v2) ** 2, 0) / tot;
  const loads = (v: Vec) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]);
    return { pos: idx.slice(0, 2).map((p) => FEAT[p[1]]), neg: idx.slice(-2).reverse().map((p) => FEAT[p[1]]) };
  };
  return {
    project: (x) => {
      const z = x.map((v, i) => v - mu[i]);
      return [dot(z, v1), dot(z, v2)];
    },
    explained: [e1, e2],
    load1: loads(v1),
    load2: loads(v2),
  };
}

export interface ClusterInfo {
  j: number;
  name: string;
  hobbies: string[];
  learning: string;
  social: number;
  approach: number;
  persona: string;
  subjects: string[];
  sched: string;
  grade: string;
  nS: number;
  nT: number;
}

/** Summarize a centroid as the traits its members share most. */
export function describe(c: Vec): Omit<ClusterInfo, 'j' | 'nS' | 'nT'> {
  const blk = (k: Block['key']) => BLOCKS.find((b) => b.key === k)!;
  const top = (k: Block['key'], n: number) => {
    const b = blk(k);
    return b.opts
      .map((o, i) => [o, c[b.start + i]] as const)
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, n)
      .map((x) => x[0]);
  };
  const p = blk('personality');
  const social = c[p.start] / p.w;
  const approach = c[p.start + 1] / p.w;
  const hobbies = top('hobbies', 3);
  const learning = top('learning', 1)[0];
  return {
    name: `${learning} · ${hobbies[0]} & ${hobbies[1]}`,
    hobbies,
    learning,
    social,
    approach,
    persona:
      (social > 0.6 ? 'Extroverted' : social < 0.4 ? 'Introverted' : 'Balanced') +
      ', ' +
      (approach > 0.6 ? 'exploratory' : approach < 0.4 ? 'structured' : 'flexible'),
    subjects: top('subjects', 2),
    sched: top('sched', 1)[0],
    grade: top('grades', 1)[0],
  };
}

/** A person as the clustering sees them. */
export interface PersonInput {
  id: string;
  name: string;
  role: 'student' | 'teacher';
  profile: Profile;
}

export interface ClusterPerson extends PersonInput {
  vec: Vec;
  /** Index into the clustered set, or -1 when this person was placed afterwards. */
  ci: number;
  /** PCA position, normalized to 0–1 on both axes. */
  xy: [number, number];
}

export type ClusterStep = KStep & { cxy: [number, number][] };

export interface ClusterResult {
  settings: Settings;
  people: ClusterPerson[];
  set: ClusterPerson[];
  km: Omit<KMeansResult, 'hist'> & { hist: ClusterStep[] };
  pca: Pca;
  assignOf: Record<string, number>;
  clusters: ClusterInfo[];
  nS: number;
  nT: number;
}

/**
 * Cluster active students and approved tutors.
 * `joint` clusters everyone; `tutor` clusters tutors only and places each
 * student at their nearest final centroid.
 */
export function cluster(input: PersonInput[], settings: Settings): ClusterResult {
  const students = input.filter((p) => p.role === 'student');
  const tutors = input.filter((p) => p.role === 'teacher');
  const people: ClusterPerson[] = [...students, ...tutors].map((p) => ({
    ...p,
    vec: encode(p.profile),
    ci: -1,
    xy: [0, 0],
  }));
  const set = settings.approach === 'tutor' ? people.filter((p) => p.role === 'teacher') : people;
  people.forEach((p) => (p.ci = set.indexOf(p)));
  const km = kmeans(
    set.map((p) => p.vec),
    settings.k,
    { seed: settings.seed, init: settings.init },
  );
  const assignOf: Record<string, number> = {};
  people.forEach((p) => {
    assignOf[p.id] = !km.centroids.length ? -1 : p.ci >= 0 ? km.assign[p.ci] : argmin(km.centroids.map((c) => dist(p.vec, c)));
  });
  const pca = pca2(people.map((p) => p.vec));
  const raw = people.map((p) => pca.project(p.vec));
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const mnx = Math.min(...xs);
  const mxx = Math.max(...xs);
  const mny = Math.min(...ys);
  const mxy = Math.max(...ys);
  const norm = ([x, y]: [number, number]): [number, number] => [(x - mnx) / (mxx - mnx || 1), (y - mny) / (mxy - mny || 1)];
  people.forEach((p, i) => (p.xy = norm(raw[i])));
  const hist = km.hist.map((h) => ({ ...h, cxy: h.centroids.map((c) => norm(pca.project(c))) }));
  const clusters = km.centroids.map((c, j) => ({
    ...describe(c),
    j,
    nS: people.filter((p) => p.role === 'student' && assignOf[p.id] === j).length,
    nT: people.filter((p) => p.role === 'teacher' && assignOf[p.id] === j).length,
  }));
  return {
    settings,
    people,
    set,
    km: { ...km, hist },
    pca,
    assignOf,
    clusters,
    nS: students.length,
    nT: tutors.length,
  };
}

/** WCSS for k = 2..8 (best of three seeds each), for the elbow chart. */
export function elbow(input: PersonInput[], settings: Settings) {
  const X = input.filter((p) => settings.approach !== 'tutor' || p.role === 'teacher').map((p) => encode(p.profile));
  return [2, 3, 4, 5, 6, 7, 8].map((k) => ({
    k,
    wcss: Math.min(...[0, 1, 2].map((i) => kmeans(X, k, { seed: settings.seed + i * 31 }).wcss)),
  }));
}

/** Per-block similarity between two profiles, 0–1. */
export function blockSims(pa: Profile, pb: Profile) {
  const a = encode(pa);
  const b = encode(pb);
  return BLOCKS.map((bl) => {
    let d2 = 0;
    for (let i = bl.start; i < bl.end; i++) {
      const d = a[i] - b[i];
      d2 += d * d;
    }
    return { key: bl.key, label: bl.label, d2, d: Math.sqrt(d2), sim: Math.max(0, 1 - d2 / (bl.bmax * bl.bmax)) };
  });
}

/** A one-sentence reason a student and tutor were matched. */
export function why(sp: Profile, tp: Profile, tutorName: string) {
  const f = tutorName.split(' ')[0];
  const parts: string[] = [];
  const sh = sp.hobbies.filter((h) => tp.hobbies.includes(h));
  if (sh.length) parts.push('you both list ' + sh.join(sh.length > 2 ? ', ' : ' and ').toLowerCase());
  if (sp.learning === tp.learning) parts.push(`${f} teaches the ${sp.learning.toLowerCase()} way you learn best`);
  const ss = sp.subjects.filter((x) => tp.subjects.includes(x));
  if (ss.length) parts.push(`${f} teaches ${ss.join(' and ')}`);
  const sc = sp.sched.filter((x) => tp.sched.includes(x));
  if (sc.length) parts.push(`you’re both free on ${sc[0].toLowerCase()}`);
  if (!parts.length) return 'Closest overall profile among tutors in your cluster.';
  const t = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

/** Match score shown to users: 1 − d² ÷ d²max, as a whole percent. */
export const matchPct = (d: number) => Math.max(0, Math.round(100 * (1 - (d * d) / (DMAX * DMAX))));

export interface ScoredTutor {
  id: string;
  name: string;
  d: number;
  pct: number;
  cluster: number;
  blocks: ReturnType<typeof blockSims>;
  sharedHobbies: string[];
  why: string;
}

export interface MatchResult {
  cluster: number;
  info: ClusterInfo;
  inCluster: ScoredTutor[];
  others: ScoredTutor[];
  centroidD: number[];
}

/** Tutors ranked by distance to a student, split into their cluster and the rest. */
export function matchesFor(cl: ClusterResult, studentId: string): MatchResult | null {
  const me = cl.people.find((p) => p.id === studentId);
  if (!me || !cl.nT || !cl.clusters.length) return null;
  const j = cl.assignOf[studentId];
  const scored = cl.people
    .filter((p) => p.role === 'teacher')
    .map((t) => {
      const d = dist(me.vec, t.vec);
      return {
        id: t.id,
        name: t.name,
        d,
        pct: matchPct(d),
        cluster: cl.assignOf[t.id],
        blocks: blockSims(me.profile, t.profile),
        sharedHobbies: me.profile.hobbies.filter((h) => t.profile.hobbies.includes(h)),
        why: why(me.profile, t.profile, t.name),
      };
    })
    .sort((a, b) => a.d - b.d);
  return {
    cluster: j,
    info: cl.clusters[j],
    inCluster: scored.filter((x) => x.cluster === j),
    others: scored.filter((x) => x.cluster !== j),
    centroidD: cl.km.centroids.map((c) => dist(me.vec, c)),
  };
}

/** Returns an error message, or null when the profile is complete. */
export function validateProfile(p: Profile): string | null {
  if (p.hobbies.length !== 3) return 'Pick exactly three hobbies.';
  if (!p.learning) return 'Choose a learning style.';
  if (!p.subjects.length) return 'Choose at least one subject.';
  if (!p.sched.length) return 'Choose at least one schedule window.';
  if (!p.grades.length) return 'Choose a grade level.';
  return null;
}
