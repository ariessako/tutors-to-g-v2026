/** SVG charts ported from the design's ttg-core plot helpers. */
import type { PointerEvent as RPointerEvent } from 'react';

export interface PlotPoint {
  id: string;
  x: number;
  y: number;
  color: string;
  shape?: 'circle' | 'square';
  hl?: boolean;
  label?: string | null;
  op?: number;
  title?: string;
}
export interface PlotCentroid { id: number; x: number; y: number; color: string; label: string }
export interface PlotLine { x1: number; y1: number; x2: number; y2: number; color: string; w?: number; dash?: boolean; op?: number }

export interface PlotSpec {
  w?: number;
  h?: number;
  pad?: number;
  points: PlotPoint[];
  centroids?: PlotCentroid[];
  lines?: PlotLine[];
  xLabel?: string;
  yLabel?: string;
  noAnim?: boolean;
  onPointClick?: (id: string) => void;
  onPointDown?: (id: string, e: RPointerEvent<SVGGElement>) => void;
  onMove?: (e: RPointerEvent<SVGSVGElement>) => void;
  onUp?: () => void;
  label: string;
}

const text = { fontSize: 12, fontFamily: 'var(--font-body)', fill: 'var(--color-neutral-700)' };
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--color-bg)', strokeWidth: 4 };

/** Scatter plot on a 0–1 square, with animated points and centroids. */
export function Plot(s: PlotSpec) {
  const W = s.w ?? 640;
  const H = s.h ?? 440;
  const P = s.pad ?? 34;
  const X = (x: number) => P + x * (W - 2 * P);
  const Y = (y: number) => P + (1 - y) * (H - 2 * P);
  const anim = !s.noAnim;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', userSelect: 'none', overflow: 'visible' }}
      onPointerMove={s.onMove}
      onPointerUp={s.onUp}
      role="img"
      aria-label={s.label}
    >
      <line x1={P - 12} y1={H - P + 12} x2={W - P + 12} y2={H - P + 12} style={{ stroke: 'var(--color-text)', strokeWidth: 1 }} />
      <line x1={P - 12} y1={P - 12} x2={P - 12} y2={H - P + 12} style={{ stroke: 'var(--color-text)', strokeWidth: 1 }} />
      {s.xLabel && <text x={W - P + 12} y={H - P + 30} textAnchor="end" style={text}>{s.xLabel}</text>}
      {s.yLabel && <text x={P - 12} y={P - 20} style={text}>{s.yLabel}</text>}
      {(s.lines ?? []).map((l, i) => (
        <line key={i} x1={X(l.x1)} y1={Y(l.y1)} x2={X(l.x2)} y2={Y(l.y2)} style={{ stroke: l.color, strokeWidth: l.w ?? 1, strokeDasharray: l.dash ? '3 4' : undefined, opacity: l.op ?? 1 }} />
      ))}
      {s.points.map((p) => (
        <g
          key={p.id}
          style={{
            fill: p.color,
            opacity: p.op ?? 1,
            transform: `translate(${X(p.x)}px, ${Y(p.y)}px)`,
            transition: anim ? 'fill .45s, opacity .45s, transform .6s cubic-bezier(.2,.7,.2,1)' : 'none',
            cursor: s.onPointDown ? 'grab' : s.onPointClick ? 'pointer' : 'default',
          }}
          onPointerDown={s.onPointDown ? (e) => s.onPointDown!(p.id, e) : undefined}
          onClick={s.onPointClick ? () => s.onPointClick!(p.id) : undefined}
        >
          {p.hl && <circle r={12} style={{ fill: 'none', stroke: 'var(--color-text)', strokeWidth: 1.5 }} />}
          {p.shape === 'square' ? <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" /> : <circle r={5} />}
          <title>{p.title ?? p.label ?? ''}</title>
          {p.label && (
            <text x={12} y={-10} style={{ fill: 'var(--color-text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', ...halo }}>
              {p.label}
            </text>
          )}
        </g>
      ))}
      {(s.centroids ?? []).map((c) => (
        <g key={c.id} style={{ transform: `translate(${X(c.x)}px, ${Y(c.y)}px)`, transition: anim ? 'transform .75s cubic-bezier(.2,.7,.2,1)' : 'none', pointerEvents: 'none' }}>
          <circle r={14} style={{ fill: 'var(--color-bg)', fillOpacity: 0.55, stroke: c.color, strokeWidth: 3 }} />
          <line x1={-21} x2={21} y1={0} y2={0} style={{ stroke: 'var(--color-text)', strokeWidth: 1 }} />
          <line x1={0} x2={0} y1={-21} y2={21} style={{ stroke: 'var(--color-text)', strokeWidth: 1 }} />
          <circle r={4} style={{ fill: c.color, stroke: 'var(--color-text)', strokeWidth: 0.8 }} />
          <text x={18} y={-16} style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', fill: 'var(--color-text)', ...halo }}>
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Maps a pointer event on a Plot back to 0–1 plot coordinates. */
export function plotInvert(e: RPointerEvent<SVGSVGElement>, s: { w?: number; h?: number; pad?: number }): [number, number] {
  const W = s.w ?? 640;
  const H = s.h ?? 440;
  const P = s.pad ?? 34;
  const r = e.currentTarget.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * W;
  const vy = ((e.clientY - r.top) / r.height) * H;
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [c((vx - P) / (W - 2 * P)), c(1 - (vy - P) / (H - 2 * P))];
}

/** Elbow chart: WCSS against k, clickable points. */
export function LineChart({ data, cur, onPick, w = 560, h = 240 }: { data: { k: number; wcss: number }[]; cur: number; onPick?: (k: number) => void; w?: number; h?: number }) {
  const P = 40;
  const mx = Math.max(...data.map((d) => d.wcss));
  const mn = Math.min(...data.map((d) => d.wcss)) * 0.9;
  const X = (i: number) => P + (i * (w - 2 * P)) / (data.length - 1);
  const Y = (v: number) => h - P - ((v - mn) / (mx - mn || 1)) * (h - 2 * P);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Elbow chart of WCSS by number of clusters">
      <line x1={P - 10} y1={h - P + 10} x2={w - P + 10} y2={h - P + 10} style={{ stroke: 'var(--color-text)' }} />
      <text x={P - 10} y={P - 18} style={text}>WCSS (total squared distance)</text>
      <text x={w - P + 10} y={h - 4} textAnchor="end" style={text}>k (number of clusters)</text>
      <polyline points={data.map((d, i) => `${X(i)},${Y(d.wcss)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--color-text)', strokeWidth: 1.5 }} />
      {data.map((d, i) => {
        const on = d.k === cur;
        return (
          <g key={d.k} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(d.k)}>
            <circle cx={X(i)} cy={Y(d.wcss)} r={14} style={{ fill: 'transparent' }} />
            <circle cx={X(i)} cy={Y(d.wcss)} r={on ? 7 : 4.5} style={{ fill: on ? 'var(--color-accent)' : 'var(--color-bg)', stroke: on ? 'var(--color-accent-700)' : 'var(--color-text)', strokeWidth: 1.5 }} />
            <text x={X(i)} y={h - P + 28} textAnchor="middle" style={{ ...text, fontWeight: on ? 600 : 400, fill: on ? 'var(--color-text)' : text.fill }}>{d.k}</text>
            <text x={X(i)} y={Y(d.wcss) - 14} textAnchor="middle" style={{ ...text, fontSize: 11 }}>{d.wcss.toFixed(0)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Weekly bars (value) with a session-count line on top. */
export function BarChart({ data, fmt = String, w = 640, h = 240 }: { data: { label: string; value: number; count: number }[]; fmt?: (v: number) => string; w?: number; h?: number }) {
  const PL = 48, PR = 40, PT = 16, PB = 30;
  const mx = Math.max(1, ...data.map((d) => d.value));
  const mc = Math.max(1, ...data.map((d) => d.count));
  const bw = (w - PL - PR) / data.length;
  const Y = (v: number) => h - PB - (v / mx) * (h - PT - PB);
  const Yc = (v: number) => h - PB - (v / mc) * (h - PT - PB);
  const tx = { fontSize: 11, fontFamily: 'var(--font-body)', fill: 'var(--color-muted)' };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Paid earnings and sessions per week">
      {[0, 0.5, 1].map((f, i) => (
        <g key={f}>
          <line x1={PL} x2={w - PR} y1={Y(mx * f)} y2={Y(mx * f)} style={{ stroke: 'var(--color-border)', strokeDasharray: i ? '3 4' : undefined }} />
          <text x={PL - 8} y={Y(mx * f) + 4} textAnchor="end" style={tx}>{fmt(Math.round(mx * f))}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={PL + i * bw + bw * 0.22} y={Y(d.value)} width={bw * 0.56} height={Math.max(0, h - PB - Y(d.value))} rx={4} style={{ fill: i === data.length - 1 ? 'var(--color-accent)' : 'var(--color-accent-200)' }}>
            <title>{`${d.label}: ${fmt(d.value)} · ${d.count} sessions`}</title>
          </rect>
          <text x={PL + i * bw + bw / 2} y={h - 10} textAnchor="middle" style={tx}>{d.label}</text>
        </g>
      ))}
      <polyline points={data.map((d, i) => `${PL + i * bw + bw / 2},${Yc(d.count)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--color-text)', strokeWidth: 1.5 }} />
      {data.map((d, i) => (
        <g key={`c${d.label}`}>
          <circle cx={PL + i * bw + bw / 2} cy={Yc(d.count)} r={3.5} style={{ fill: 'var(--color-surface)', stroke: 'var(--color-text)', strokeWidth: 1.5 }} />
          <text x={PL + i * bw + bw / 2} y={Yc(d.count) - 9} textAnchor="middle" style={{ ...tx, fill: 'var(--color-text)', fontWeight: 600 }}>{d.count}</text>
        </g>
      ))}
    </svg>
  );
}
