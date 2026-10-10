import { describe, expect, it } from 'vitest';
import { BLOCKS, DIM, DMAX, cluster, elbow, encode, kmeans, matchPct, matchesFor, validateProfile, type PersonInput } from '../shared/matching';
import type { Profile } from '../shared/types';

const base: Profile = { hobbies: ['Basketball', 'Music', 'Drawing'], learning: 'Visual', social: 0.5, approach: 0.5, subjects: ['Math'], sched: ['Weekends'], grades: ['Junior High'] };

describe('encode', () => {
  it('produces one number per feature, weighted by block', () => {
    const v = encode(base);
    expect(v).toHaveLength(DIM);
    const hobbies = BLOCKS.find((b) => b.key === 'hobbies')!;
    expect(v.slice(hobbies.start, hobbies.end).filter((x) => x > 0)).toEqual([1.4, 1.4, 1.4]);
  });

  it('gives identical profiles a 100% match and maximally different ones 0%', () => {
    expect(matchPct(0)).toBe(100);
    expect(matchPct(DMAX)).toBe(0);
  });
});

describe('kmeans', () => {
  it('separates two obvious groups and converges', () => {
    const X = [[0, 0], [0, 0.1], [0.1, 0], [5, 5], [5, 5.1], [5.1, 5]];
    const r = kmeans(X, 2, { seed: 3 });
    expect(r.assign[0]).toBe(r.assign[1]);
    expect(r.assign[0]).toBe(r.assign[2]);
    expect(r.assign[3]).toBe(r.assign[4]);
    expect(r.assign[0]).not.toBe(r.assign[3]);
    const last = r.hist[r.hist.length - 1];
    expect(last.type === 'assign' && last.converged).toBe(true);
  });

  it('is reproducible for the same seed', () => {
    const X = Array.from({ length: 30 }, (_, i) => [Math.sin(i), Math.cos(i * 1.7)]);
    expect(kmeans(X, 3, { seed: 9 }).assign).toEqual(kmeans(X, 3, { seed: 9 }).assign);
  });
});

describe('cluster and matchesFor', () => {
  const people: PersonInput[] = [
    { id: 's1', name: 'Student One', role: 'student', profile: base },
    { id: 't1', name: 'Close Tutor', role: 'teacher', profile: { ...base, subjects: ['Math', 'Science'] } },
    { id: 't2', name: 'Far Tutor', role: 'teacher', profile: { hobbies: ['Cooking', 'Reading', 'K-drama'], learning: 'Auditory', social: 0.1, approach: 0.1, subjects: ['Accounting'], sched: ['Weekday mornings'], grades: ['College'] } },
  ];

  it('ranks the closest tutor first', () => {
    const cl = cluster(people, { k: 2, seed: 7, init: 'kmeans++', approach: 'joint' });
    const m = matchesFor(cl, 's1')!;
    const all = [...m.inCluster, ...m.others].sort((a, b) => a.d - b.d);
    expect(all[0].id).toBe('t1');
    expect(all[0].sharedHobbies).toEqual(['Basketball', 'Music', 'Drawing']);
    expect(all[0].pct).toBeGreaterThan(all[1].pct);
  });

  it('places students at the nearest centroid when only tutors are clustered', () => {
    const cl = cluster(people, { k: 2, seed: 7, init: 'kmeans++', approach: 'tutor' });
    expect(cl.set.map((p) => p.id).sort()).toEqual(['t1', 't2']);
    expect(cl.assignOf.s1).toBe(cl.assignOf.t1);
  });

  it.each(['joint', 'tutor'] as const)('handles an empty dataset with %s clustering', (approach) => {
    const settings = { k: 4, seed: 7, init: 'kmeans++' as const, approach };
    const cl = cluster([], settings);
    expect(cl.km.centroids).toEqual([]);
    expect(cl.clusters).toEqual([]);
    expect(cl.pca.project(encode(base))).toEqual([0, 0]);
    expect(matchesFor(cl, 's1')).toBeNull();
    expect(elbow([], settings).every((p) => p.wcss === 0)).toBe(true);
  });

  it.each(['joint', 'tutor'] as const)('returns no matches without tutors in %s mode', (approach) => {
    const cl = cluster([people[0]], { k: 4, seed: 7, init: 'kmeans++', approach });
    expect(matchesFor(cl, 's1')).toBeNull();
    expect(cl.people[0].xy.every(Number.isFinite)).toBe(true);
    if (approach === 'tutor') expect(cl.assignOf.s1).toBe(-1);
  });
});

describe('validateProfile', () => {
  it('requires exactly three hobbies', () => {
    expect(validateProfile({ ...base, hobbies: ['Music'] })).toBe('Pick exactly three hobbies.');
    expect(validateProfile(base)).toBeNull();
  });
});
