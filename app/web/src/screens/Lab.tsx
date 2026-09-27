/**
 * K-means lab: re-runs the platform's clustering in the browser with the same
 * shared code the server uses. Admins' control changes update the live model;
 * everyone else explores a local preview.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Me, Profile, Settings } from '../../../shared/types';
import { BLOCKS, DIM, DMAX, blockSims, cluster, dist, elbow, kmeans, matchesFor, validateProfile, type PersonInput } from '../../../shared/matching';
import { clusterColor } from '../../../shared/format';
import { api, useAction, useApi } from '../api';
import { LineChart, Plot, plotInvert, type PlotLine, type PlotPoint } from '../charts';
import { ProfileFields, readProfile } from '../ProfileFields';
import { ErrorBox, Field, Icon, Loading, Seg, useToast } from '../ui';

interface LabData { settings: Settings; canEdit: boolean; people: PersonInput[]; spotlight: string | null }

type Tab = 'run' | 'enc' | 'k' | 'match' | 'sandbox' | 'add';
const TABS: { value: Tab; label: string }[] = [
  { value: 'run', label: 'Run & clusters' },
  { value: 'enc', label: 'Encoding' },
  { value: 'k', label: 'Choosing k' },
  { value: 'match', label: 'Matching' },
  { value: 'sandbox', label: '2D sandbox' },
  { value: 'add', label: 'Add a student' },
];

const first = (n: string) => n.split(' ')[0];
const fx = (n: number, d = 2) => Number(n).toFixed(d);
const SB = { w: 620, h: 460, pad: 34 };

export function Lab({ me }: { me: Me }) {
  const q = useApi<LabData>('/lab');
  if (!q.data) return q.error ? <ErrorBox error={q.error.message} /> : <Loading />;
  if (!q.data.people.some((p) => p.role === 'student') || !q.data.people.some((p) => p.role === 'teacher'))
    return <div className="empty">The lab needs at least one active student and one approved tutor.</div>;
  return <LabView data={q.data} me={me} />;
}

function LabView({ data, me }: { data: LabData; me: Me }) {
  const toast = useToast();
  const { run, error: saveError } = useAction();
  const [local, setLocal] = useState<Settings | null>(null);
  const [extra, setExtra] = useState<PersonInput[]>([]);
  const settings = local ?? data.settings;
  const people = useMemo(() => [...data.people, ...extra], [data.people, extra]);

  const [tab, setTab] = useState<Tab>('run');
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [cmpId, setCmpId] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const cl = useMemo(() => cluster(people, settings), [people, settings]);
  const el = useMemo(() => elbow(people, settings), [people, settings]);
  const km = cl.km;
  const k = km.centroids.length;
  const nSteps = km.hist.length + 1;
  const si = step == null ? nSteps - 1 : Math.min(step, nSteps - 1);
  const isMatch = si === nSteps - 1;
  const cur = isMatch ? null : km.hist[si];
  const hs = cur ?? km.hist[km.hist.length - 1];

  const students = cl.people.filter((p) => p.role === 'student');
  const tutors = cl.people.filter((p) => p.role === 'teacher');
  const spot = cl.people.find((p) => p.id === (spotId ?? data.spotlight)) ?? students[0];
  const M = matchesFor(cl, spot.id);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setStep((s) => {
        const nx = (s ?? 0) + 1;
        if (nx >= nSteps - 1) {
          setPlaying(false);
          return nSteps - 1;
        }
        return nx;
      });
    }, 1400);
    return () => clearInterval(t);
  }, [playing, nSteps]);

  function changeSettings(p: Partial<Settings>) {
    const next = { ...settings, ...p };
    setPlaying(false);
    setStep(0);
    setLocal(next);
    if (data.canEdit)
      void run(() => api('/admin/settings', { method: 'PUT', body: next })).then((r) => {
        if (!r) return;
        setLocal(null);
        toast('Live matching model updated.');
      });
  }
  const go = (i: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(nSteps - 1, i)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (step == null || step >= nSteps - 1) setStep(0);
    setPlaying(true);
  };

  // Plot
  const recIds = M ? M.inCluster.slice(0, 5).map((m) => m.id) : [];
  const points: PlotPoint[] = cl.people.map((p) => {
    let j: number | null = null;
    if (isMatch) j = cl.assignOf[p.id];
    else if (cur && cur.type !== 'init' && p.ci >= 0) j = cur.assign[p.ci];
    const inSpot = isMatch && M && cl.assignOf[p.id] === M.cluster;
    return {
      id: p.id,
      x: p.xy[0],
      y: p.xy[1],
      color: j == null ? 'var(--color-neutral-400)' : clusterColor(j),
      shape: p.role === 'teacher' ? 'square' : 'circle',
      hl: p.id === spot.id,
      label: p.id === spot.id ? spot.name : isMatch && recIds.indexOf(p.id) > -1 && recIds.indexOf(p.id) < 3 ? p.name : null,
      op: isMatch && M ? (inSpot ? 1 : 0.18) : 1,
      title: `${p.name} · ${p.role === 'teacher' ? 'Tutor' : 'Student'}`,
    };
  });
  const cents = hs.cxy.map((xy, j) => ({ id: j, x: xy[0], y: xy[1], color: clusterColor(j), label: `C${j + 1}` }));
  const spotD = hs.centroids.map((c) => dist(spot.vec, c));
  const nearJ = spotD.indexOf(Math.min(...spotD));
  const lines: PlotLine[] = [];
  if (cur?.type === 'assign')
    cents.forEach((c, j) => lines.push({ x1: spot.xy[0], y1: spot.xy[1], x2: c.x, y2: c.y, color: j === nearJ ? 'var(--color-text)' : 'var(--color-neutral-500)', dash: j !== nearJ, w: j === nearJ ? 1.5 : 1 }));
  if (isMatch && M)
    M.inCluster.slice(0, 3).forEach((m) => {
      const p = cl.people.find((x) => x.id === m.id)!;
      lines.push({ x1: spot.xy[0], y1: spot.xy[1], x2: p.xy[0], y2: p.xy[1], color: 'var(--color-text)', w: 1.2 });
    });
  const e1 = Math.round(cl.pca.explained[0] * 100);
  const e2 = Math.round(cl.pca.explained[1] * 100);

  // Explanation panel
  const who = settings.approach === 'tutor' ? 'tutor profiles' : 'profiles';
  const setN = cl.set.length;
  const ex = { kicker: `Step ${si + 1} of ${nSteps}`, title: '', paras: [] as string[], formula: '', wcss: 'wcss' in hs ? fx(hs.wcss, 1) : '—', metricLabel: '', metric: '' };
  if (!cur) {
    ex.title = `Recommend tutors from ${first(spot.name)}’s cluster`;
    if (M) {
      const top = M.inCluster.slice(0, 3).map((m) => `${m.name} (${m.pct}%)`).join(', ');
      ex.paras.push(
        settings.approach === 'tutor'
          ? `Only tutors were clustered. ${first(spot.name)}’s vector is compared with the ${k} final centroids; the nearest is C${M.cluster + 1} at distance ${fx(M.centroidD[M.cluster])}.`
          : `${first(spot.name)} ended in C${M.cluster + 1}, “${M.info.name}”, together with ${M.inCluster.length} tutors.`,
      );
      ex.paras.push(`Those tutors are ranked by distance to ${first(spot.name)}, closest first. Top three: ${top || 'none'}.`);
    }
    ex.formula = `match % = 1 − d² ÷ ${fx(DMAX * DMAX)}`;
    ex.metricLabel = 'Tutors in cluster';
    ex.metric = M ? String(M.inCluster.length) : '—';
  } else if (cur.type === 'init') {
    ex.title = `Place ${k} starting centroids`;
    ex.paras.push(
      settings.init === 'random'
        ? `Random start: ${k} ${who} are picked at random to act as the first centroids.`
        : 'K-means++ picks one profile at random as the first centroid. Each next centroid is picked with a probability proportional to its squared distance from the nearest centroid already chosen, so the starting points spread out.',
    );
    ex.paras.push(`Starting centroids: ${cur.initIdx.map((i, j) => `C${j + 1} = ${cl.set[i].name}`).join(', ')}.`);
    ex.formula = settings.init === 'random' ? 'each profile equally likely' : 'P(pick x) ∝ D(x)²';
    ex.metricLabel = 'Profiles clustered';
    ex.metric = String(setN);
    ex.wcss = '—';
  } else if (cur.type === 'assign') {
    ex.title = cur.converged ? 'Converged: nobody moved' : 'Assign every profile to its nearest centroid';
    ex.paras.push(`Each of the ${setN} ${who} measures its straight-line distance to all ${k} centroids and joins the closest one.`);
    ex.paras.push(
      cur.iter === 1
        ? 'This is the first assignment, so every profile receives a cluster.'
        : cur.converged
          ? `No profile switched clusters this round, so the centroids will not move again. K-means stops after ${cur.iter - 1} updates.`
          : `${cur.changed} profile${cur.changed === 1 ? '' : 's'} switched clusters this round.`,
    );
    ex.formula = 'd(a, c) = √ Σ (aᵢ − cᵢ)²';
    ex.metricLabel = 'Switched cluster';
    ex.metric = String(cur.iter === 1 ? setN : cur.changed);
  } else {
    const mv = cur.moved;
    const jm = mv.indexOf(Math.max(...mv));
    const prev = km.hist[si - 1];
    ex.title = 'Move each centroid to the average of its members';
    ex.paras.push('Every centroid becomes the mean of its members’ vectors: add each feature across the members and divide by how many there are.');
    ex.paras.push(`Largest move: C${jm + 1} shifted ${fx(mv[jm])}. WCSS fell from ${'wcss' in prev ? fx(prev.wcss, 1) : '—'} to ${fx(cur.wcss, 1)}.`);
    ex.formula = 'cⱼ = average of all x in cluster j';
    ex.metricLabel = 'Largest move';
    ex.metric = fx(mv[jm]);
  }
  const mxD = Math.max(...spotD);
  const stepLabel = (i: number) => {
    if (i === nSteps - 1) return 'Match';
    const s = km.hist[i];
    return s.type === 'init' ? 'Start' : s.type === 'assign' ? (s.converged ? 'Converged' : `Assign ${s.iter}`) : `Update ${s.iter}`;
  };

  const readOnlyNote = !data.canEdit && (
    <p className="muted" style={{ fontSize: 12, width: '100%' }}>
      {local ? 'You’re previewing different settings. Only admins change the live matching model. ' : 'Controls here preview changes locally. Only admins change the live matching model. '}
      {local && <button className="link" style={{ border: 0, background: 'none', padding: 0, color: 'var(--color-accent)' }} onClick={() => { setLocal(null); setStep(null); }}>Back to live settings</button>}
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 800 }}>
        <span className="row" style={{ gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>
          <Icon name="chart-scatter" style={{ fontSize: 15 }} />Matching model · K-means clustering
        </span>
        <h1 style={{ fontSize: 34 }}>How Tutors To Go groups students with tutors</h1>
        <p className="muted pretty" style={{ fontSize: 15 }}>
          {cl.nS} students and {cl.nT} approved tutors, each described by {DIM} numbers. With k = {k}, k-means settled after {km.iterations} iterations. Every figure on this page is computed live from the platform’s data
          {me.role !== 'admin' ? ', with other students’ names hidden' : ''}.
        </p>
      </header>

      <div className="card row wrap" style={{ padding: '14px 16px', gap: '14px 22px', alignItems: 'flex-end' }}>
        <div className="field"><span className="label">Clusters (k)</span><Seg label="Clusters" value={settings.k} onChange={(v) => changeSettings({ k: v })} options={[2, 3, 4, 5, 6, 7, 8].map((v) => ({ value: v, label: v }))} /></div>
        <div className="field"><span className="label">Starting centroids</span><Seg label="Starting centroids" value={settings.init} onChange={(v) => changeSettings({ init: v })} options={[{ value: 'kmeans++', label: 'K-means++' }, { value: 'random', label: 'Random' }]} /></div>
        <div className="field"><span className="label">What gets clustered</span><Seg label="What gets clustered" value={settings.approach} onChange={(v) => changeSettings({ approach: v })} options={[{ value: 'joint', label: 'Students + tutors' }, { value: 'tutor', label: 'Tutors only' }]} /></div>
        <Field label="Follow a student">
          <select className="input sm" style={{ minWidth: 210 }} value={spot.id} onChange={(e) => { setSpotId(e.target.value); setCmpId(null); }}>
            {students.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <button className="btn btn-secondary" style={{ height: 36, marginLeft: 'auto' }} onClick={() => changeSettings({ seed: settings.seed + 1 })}><Icon name="shuffle" />Re-seed · seed {settings.seed}</button>
        {readOnlyNote}
        <ErrorBox error={saveError} />
      </div>

      <Seg label="Lab section" large value={tab} onChange={setTab} options={TABS} />

      {tab === 'run' && (
        <>
          <section className="grid stack-md" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', gap: 20, alignItems: 'start' }}>
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
                <SectionTitle icon="play-circle" title="Watch it run, step by step" />
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-secondary btn-icon" onClick={() => go(0)} title="Back to start" aria-label="Back to start"><Icon name="skip-back" /></button>
                  <button className="btn btn-secondary btn-icon" onClick={() => go(si - 1)} title="Previous step" aria-label="Previous step"><Icon name="caret-left" /></button>
                  <button className="btn btn-primary" style={{ height: 36, minWidth: 96 }} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play'}</button>
                  <button className="btn btn-secondary btn-icon" onClick={() => go(si + 1)} title="Next step" aria-label="Next step"><Icon name="caret-right" /></button>
                  <button className="btn btn-secondary btn-icon" onClick={() => go(nSteps - 1)} title="Jump to result" aria-label="Jump to result"><Icon name="skip-forward" /></button>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                {Array.from({ length: nSteps }, (_, i) => (
                  <button key={i} onClick={() => go(i)} aria-current={i === si} style={{ border: 0, cursor: 'pointer', height: 26, padding: '0 10px', borderRadius: 13, fontSize: 12, fontWeight: 600, background: i === si ? 'var(--color-accent)' : 'var(--color-surface-2)', color: i === si ? 'var(--on-accent)' : 'var(--color-muted)' }}>
                    {stepLabel(i)}
                  </button>
                ))}
              </div>
              <div style={{ borderRadius: 10, background: 'var(--color-surface-2)', padding: 10 }}>
                <Plot
                  w={680}
                  h={480}
                  points={points}
                  centroids={cents}
                  lines={lines}
                  xLabel={`PC1 · ${e1}% of variation`}
                  yLabel={`PC2 · ${e2}%`}
                  label={`Scatter plot of ${cl.people.length} profiles in ${k} clusters`}
                  onPointClick={(id) => {
                    const p = cl.people.find((x) => x.id === id);
                    if (p?.role === 'student') {
                      setSpotId(id);
                      setCmpId(null);
                    }
                  }}
                />
              </div>
              <div className="muted row wrap" style={{ gap: 16, fontSize: 12 }}>
                <span>● Student</span><span>◆ Tutor</span><span>⊕ Centroid</span><span>Click a student dot to follow them</span>
                <span style={{ marginLeft: 'auto' }}>Step {si + 1} of {nSteps}</span>
              </div>
              <p className="muted pretty" style={{ fontSize: 12 }}>
                The model works in {DIM} dimensions; PCA flattens it to two for drawing. Across: {cl.pca.load1.pos.join(' & ')} ↔ {cl.pca.load1.neg.join(' & ')}. Up: {cl.pca.load2.pos.join(' & ')} ↔ {cl.pca.load2.neg.join(' & ')}.
              </p>
            </div>
            <aside className="card sticky-md-off" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }} aria-live="polite">
              <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>{ex.kicker}</span>
              <h3 style={{ fontSize: 22, textWrap: 'balance' }}>{ex.title}</h3>
              {ex.paras.map((p, i) => <p key={i} className="pretty" style={{ fontSize: 14 }}>{p}</p>)}
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-2)', fontFamily: 'var(--font-head)', fontStyle: 'italic', fontSize: 16 }}>{ex.formula}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{first(spot.name)}’s distance to each centroid{cur?.type === 'update' ? ' after the move' : ''}</div>
                {spotD.map((d, j) => (
                  <div key={j} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) 44px 64px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: clusterColor(j) }} />C{j + 1}</span>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: 6, background: clusterColor(j), width: `${Math.round((d / mxD) * 100)}%` }} /></div>
                    <span className="num" style={{ textAlign: 'right' }}>{fx(d)}</span>
                    <span>{j === nearJ && cur?.type !== 'init' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'var(--t-ok-bg)', color: 'var(--t-ok-fg)' }}>nearest</span>}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Metric label="WCSS" value={ex.wcss} />
                <Metric label={ex.metricLabel} value={ex.metric} />
              </div>
            </aside>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 21 }}>What each cluster has in common</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
              {cl.clusters.map((c) => (
                <div key={c.j} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, borderTop: `4px solid ${clusterColor(c.j)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--color-surface-2)' }}>C{c.j + 1}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{c.nS} students · {c.nT} tutors</span>
                  </div>
                  <div className="head-font" style={{ fontSize: 18, fontWeight: 600 }}>{c.name}</div>
                  <dl style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr)', gap: '4px 10px', margin: 0, fontSize: 13 }}>
                    {[
                      ['Hobbies', c.hobbies.join(', ')],
                      ['Learning', c.learning],
                      ['Personality', c.persona],
                      ['Subjects', c.subjects.join(', ')],
                      ['Free time', c.sched],
                      ['Level', c.grade],
                    ].map(([k2, v]) => (
                      <div key={k2} style={{ display: 'contents' }}><dt className="muted">{k2}</dt><dd style={{ margin: 0 }}>{v}</dd></div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === 'enc' && <Encoding spot={spot} tutors={tutors} cmpId={cmpId ?? M?.inCluster[0]?.id ?? tutors[0].id} onPick={setCmpId} />}

      {tab === 'k' && (
        <section className="card" style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionTitle icon="chart-line-down" title="Choosing k" />
            <p className="pretty" style={{ fontSize: 15 }}>
              WCSS adds up every profile’s squared distance to its own centroid. More clusters always lower it, so we look for the bend in the curve (the “elbow”) where one more cluster stops helping much.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Metric label="Elbow at" value={`k = ${elbowK(el)}`} />
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>In use</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>k = {settings.k}</div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Click any point on the chart to try that k.</p>
          </div>
          <div style={{ minWidth: 0 }}><LineChart data={el} cur={settings.k} onPick={(kk) => changeSettings({ k: kk })} /></div>
        </section>
      )}

      {tab === 'match' && <Approaches people={people} settings={settings} spot={spot} onUse={(approach) => changeSettings({ approach })} />}

      {tab === 'sandbox' && <Sandbox students={students.map((s) => ({ id: s.id, name: s.name, x: s.profile.social, y: s.profile.approach }))} />}

      {tab === 'add' && (
        <AddStudent
          added={added}
          onAdd={(name, profile) => {
            const id = `local_${Date.now()}`;
            setExtra([...extra, { id, name, role: 'student', profile }]);
            setSpotId(id);
            setCmpId(null);
            setAdded(name);
            setTab('run');
            setStep(0);
            setTimeout(() => setPlaying(true), 500);
          }}
        />
      )}
    </div>
  );
}

function elbowK(el: { k: number; wcss: number }[]) {
  let best = -Infinity;
  let at = el[1].k;
  for (let i = 1; i < el.length - 1; i++) {
    const d = el[i - 1].wcss - el[i].wcss - (el[i].wcss - el[i + 1].wcss);
    if (d > best) {
      best = d;
      at = el[i].k;
    }
  }
  return at;
}

const SectionTitle = ({ icon, title, sub }: { icon: string; title: string; sub?: string }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
    <span className="icon-tile sm" style={{ width: 34, height: 34, fontSize: 18 }}><Icon name={icon} /></span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <h3 style={{ fontSize: 21 }}>{title}</h3>
      {sub && <p className="muted pretty" style={{ fontSize: 14, maxWidth: 760 }}>{sub}</p>}
    </div>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--color-surface-2)' }}>
    <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
    <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
  </div>
);

type CP = ReturnType<typeof cluster>['people'][number];

function Encoding({ spot, tutors, cmpId, onPick }: { spot: CP; tutors: CP[]; cmpId: string; onPick: (id: string) => void }) {
  const B = tutors.find((t) => t.id === cmpId) ?? tutors[0];
  const sims = blockSims(spot.profile, B.profile);
  const tot = sims.reduce((s, b) => s + b.d2, 0) || 1;
  const cells = (vec: number[], bl: (typeof BLOCKS)[number]) =>
    bl.opts.map((o, i) => {
      const v = vec[bl.start + i];
      const on = bl.key === 'personality' || v > 0;
      return (
        <span key={o} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, background: on ? 'var(--color-text)' : 'var(--color-neutral-200)', color: on ? 'var(--color-bg)' : 'var(--color-neutral-700)' }}>
          {o} {Math.round(v * 100) / 100}
        </span>
      );
    });
  return (
    <section className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionTitle
        icon="list-numbers"
        title={`Each profile becomes a list of ${DIM} numbers`}
        sub="K-means only compares numbers. A chosen hobby, subject, schedule or level becomes its block weight, an unchosen one becomes 0, and the two personality sliders stay on a 0–1 scale. Hobbies carry the heaviest weight, so shared interests pull people together most."
      />
      <label className="row wrap">
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Compare {first(spot.name)} with</span>
        <select className="input sm" style={{ minWidth: 210, width: 'auto' }} value={B.id} onChange={(e) => onPick(e.target.value)}>
          {tutors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>Defaults to their closest tutor.</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }} className="divided">
        {BLOCKS.map((bl, i) => (
          <div key={bl.key} className="stack-md" style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 140px', gap: 18, alignItems: 'center', padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>{bl.label}</span>
              <span className="muted" style={{ fontSize: 12 }}>weight {bl.w}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 3 }}><span className="muted" style={{ width: 60, fontSize: 12 }}>{first(spot.name)}</span>{cells(spot.vec, bl)}</div>
              <div className="row wrap" style={{ gap: 3 }}><span className="muted" style={{ width: 60, fontSize: 12 }}>{first(B.name)}</span>{cells(B.vec, bl)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>d² = {fx(sims[i].d2)}</span>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-neutral-200)', overflow: 'hidden' }}><div style={{ height: 6, background: 'var(--color-accent)', width: `${Math.round((sims[i].d2 / tot) * 100)}%` }} /></div>
              <span className="muted" style={{ fontSize: 11 }}>{Math.round((sims[i].d2 / tot) * 100)}% of the total</span>
            </div>
          </div>
        ))}
      </div>
      <div className="num" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 10, background: 'var(--color-surface-2)', fontSize: 16 }}>
        <div>d({first(spot.name)}, {first(B.name)}) = √({sims.map((s) => fx(s.d2)).join(' + ')}) = √{fx(tot)} = <strong>{fx(Math.sqrt(tot))}</strong></div>
        <div>Match = 1 − d² ÷ d²<sub>max</sub> = 1 − {fx(tot)} ÷ {fx(DMAX * DMAX)} = <strong style={{ color: 'var(--color-accent-700)' }}>{Math.max(0, Math.round(100 * (1 - tot / (DMAX * DMAX))))}%</strong></div>
      </div>
    </section>
  );
}

function Approaches({ people, settings, spot, onUse }: { people: PersonInput[]; settings: Settings; spot: CP; onUse: (a: Settings['approach']) => void }) {
  const results = useMemo(
    () => ({
      joint: matchesFor(cluster(people, { ...settings, approach: 'joint' }), spot.id),
      tutor: matchesFor(cluster(people, { ...settings, approach: 'tutor' }), spot.id),
    }),
    [people, settings, spot.id],
  );
  const cards = [
    { letter: 'Approach A', ap: 'joint' as const, title: 'Cluster students and tutors together', steps: ['Put every student and approved tutor in one dataset.', 'Run k-means on everyone.', 'Recommend tutors who landed in the student’s cluster, closest first.'], note: 'Clusters describe whole communities, so they also suggest discussion groups.' },
    { letter: 'Approach B', ap: 'tutor' as const, title: 'Cluster tutors, then place the student', steps: ['Run k-means on tutor profiles only.', 'Measure the student’s distance to each final centroid.', 'Recommend tutors in the nearest centroid’s cluster, closest first.'], note: 'New students don’t shift the clusters; only tutor changes do.' },
  ];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionTitle icon="arrows-in" title="From clusters to matches" sub={`A cluster narrows the field; distance ranks it. Both ways of connecting students and tutors are computed below for ${spot.name}.`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {cards.map((a) => {
          const m = results[a.ap];
          const active = settings.approach === a.ap;
          return (
            <div key={a.ap} className="card card-pad">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent-700)' }}>{a.letter}</span>
                {active && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--t-ok-bg)', color: 'var(--t-ok-fg)' }}>In use</span>}
              </div>
              <h3 style={{ fontSize: 19 }}>{a.title}</h3>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 14 }}>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="muted" style={{ fontSize: 13 }}>{a.note}</p>
              {m && <div style={{ fontSize: 13, fontWeight: 600, padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface-2)' }}>{first(spot.name)} → C{m.cluster + 1} · {m.info.name} · {m.inCluster.length} tutors</div>}
              <div className="divided">
                {m?.inCluster.slice(0, 3).map((t, i) => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) 50px', gap: 10, padding: '7px 0', fontSize: 14 }}>
                    <span className="muted">{i + 1}</span><span>{t.name}</span><span className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-accent-700)' }}>{t.pct}%</span>
                  </div>
                ))}
              </div>
              {!active && <div><button className="btn btn-secondary" style={{ height: 36 }} onClick={() => onUse(a.ap)}>Use this approach</button></div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface SbPoint { id: string; name: string; x: number; y: number }

function Sandbox({ students }: { students: SbPoint[] }) {
  const initial = useMemo(() => students.slice(0, 28), [students]);
  const [pts, setPts] = useState<SbPoint[] | null>(null);
  const [kk, setK] = useState(3);
  const [seed, setSeed] = useState(5);
  const [drag, setDrag] = useState<string | null>(null);
  const [stepSel, setStepSel] = useState<number | null>(null);
  const cur = pts ?? initial;
  const res = useMemo(() => kmeans(cur.map((p) => [p.x, p.y]), kk, { seed }), [cur, kk, seed]);
  const si = stepSel == null ? res.hist.length - 1 : Math.min(stepSel, res.hist.length - 1);
  const sh = res.hist[si];
  const assign = sh.type === 'init' ? null : sh.assign;
  const label = sh.type === 'init' ? 'Start' : sh.type === 'assign' ? (sh.converged ? 'Converged' : `Assign ${sh.iter}`) : `Update ${sh.iter}`;
  return (
    <section className="card stack-md" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,1fr)', gap: 24, alignItems: 'start' }}>
      <div style={{ minWidth: 0, borderRadius: 10, background: 'var(--color-surface-2)', padding: 10 }}>
        <Plot
          {...SB}
          noAnim={!!drag}
          xLabel="Introvert → Extrovert"
          yLabel="Exploratory ↑   Structured ↓"
          label="Two-dimensional k-means sandbox"
          points={cur.map((p, i) => ({ id: p.id, x: p.x, y: p.y, color: assign ? clusterColor(assign[i]) : 'var(--color-neutral-400)', title: p.name, hl: p.id === drag }))}
          centroids={sh.centroids.map((c, j) => ({ id: j, x: c[0], y: c[1], color: clusterColor(j), label: `C${j + 1}` }))}
          lines={assign ? cur.map((p, i) => ({ x1: p.x, y1: p.y, x2: sh.centroids[assign[i]][0], y2: sh.centroids[assign[i]][1], color: clusterColor(assign[i]), op: 0.45 })) : []}
          onPointDown={(id, e) => {
            const svg = e.currentTarget.ownerSVGElement;
            svg?.setPointerCapture?.(e.pointerId);
            e.preventDefault();
            setDrag(id);
            setPts(cur);
            setStepSel(null);
          }}
          onMove={(e) => {
            if (!drag) return;
            const [x, y] = plotInvert(e, SB);
            setPts((ps) => (ps ?? initial).map((p) => (p.id === drag ? { ...p, x, y } : p)));
          }}
          onUp={() => setDrag(null)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionTitle icon="hand-grabbing" title="Try it in two dimensions" />
        <p className="pretty" style={{ fontSize: 14 }}>
          With only two features the picture is exactly what k-means sees: social energy across, learning approach up, for {cur.length} students. Drag any dot; k-means re-runs on every move from the same starting seed.
        </p>
        <div className="field"><span className="label">k</span><Seg label="Sandbox k" value={kk} onChange={(v) => { setK(v); setStepSel(null); }} options={[2, 3, 4, 5, 6].map((v) => ({ value: v, label: v }))} /></div>
        <label className="field">
          <span className="label">Scrub through the run · {label}</span>
          <input type="range" min={0} max={res.hist.length - 1} value={si} onChange={(e) => setStepSel(+e.target.value)} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Metric label="Iterations" value={String(res.iterations)} />
          <Metric label="WCSS" value={fx(res.wcss)} />
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-secondary" style={{ height: 36 }} onClick={() => { setSeed(seed + 1); setStepSel(null); }}><Icon name="shuffle" />New starting centroids</button>
          <button className="btn btn-ghost" style={{ height: 36 }} onClick={() => { setPts(null); setStepSel(null); }}>Reset dots</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Sandbox only. Dragging here doesn’t change anyone’s real profile.</p>
      </div>
    </section>
  );
}

function AddStudent({ added, onAdd }: { added: string | null; onAdd: (name: string, p: Profile) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    const p = readProfile(fd);
    const error = !name ? 'Enter a name.' : validateProfile(p);
    if (error) return setErr(error);
    setErr(null);
    setKey(key + 1);
    onAdd(name, p);
  }
  return (
    <section className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
      <SectionTitle
        icon="user-plus"
        title="Add a student and watch it re-cluster"
        sub="Fill in a profile the way a new student would at sign-up. They join this page’s dataset (nothing is saved), k-means runs again from the start, and the step-through follows them."
      />
      {added && <div className="alert alert-ok" style={{ fontSize: 14 }}><Icon name="check-circle" />{added} was added. The run now follows them.</div>}
      <form key={key} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Student name" style={{ maxWidth: 340 }}><input className="input sm" name="name" placeholder="e.g. Juan dela Cruz" /></Field>
        <ProfileFields mode="student" />
        <ErrorBox error={err} />
        <div><button type="submit" className="btn btn-primary" style={{ height: 40 }}><Icon name="user-plus" />Add and re-run k-means</button></div>
      </form>
    </section>
  );
}
