/** Date, money and display helpers shared by server and client. */
import { DAYS } from './vocab';

/** YYYY-MM-DD in local time. */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** The next date (1–8 days after `from`) that falls on the given weekday, e.g. 'Tue'. */
export function nextDate(day: string, from: Date = new Date()) {
  const target = DAYS.indexOf(day as (typeof DAYS)[number]);
  for (let i = 1; i < 9; i++) {
    const d = addDays(from, i);
    if (d.getDay() === target) return d;
  }
  return from;
}

/** "Tue, Sep 29" */
export const fmtDate = (s: string) =>
  parseIso(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "17:00" → "5:00 PM" */
export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Sep 27, 5:40 PM" */
export const fmtStamp = (isoStamp: string) =>
  new Date(isoStamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-US');

export const stars = (n: number) => {
  const r = Math.round(n);
  return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
};

export const hoursLabel = (h: number, long = false) => `${h} ${long ? (h === 1 ? 'hour' : 'hours') : h === 1 ? 'hr' : 'hrs'}`;

export const firstName = (name: string) => name.split(' ')[0];

const AVATAR_COLORS = 8;

/** Initials and a stable palette color for a name. */
export function avatar(name: string) {
  const parts = String(name || '?').trim().split(/\s+/);
  const ini = ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { ini, color: `var(--cl-${(h % AVATAR_COLORS) + 1})` };
}

/** Color for cluster j in charts. */
export const clusterColor = (j: number) => `var(--cl-${(j % AVATAR_COLORS) + 1})`;
