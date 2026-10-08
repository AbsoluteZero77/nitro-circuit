export const TAU = Math.PI * 2;

export type Vec = { x: number; y: number };

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function angleWrap(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function angleDelta(from: number, to: number): number {
  return angleWrap(to - from);
}

/** Wrap a distance difference on a closed loop of length `len` into (-len/2, len/2]. */
export function wrapLoop(d: number, len: number): number {
  if (d > len / 2) return d - len;
  if (d < -len / 2) return d + len;
  return d;
}

export function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

export type Sample = Vec & {
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  s: number;
};

export function sampleClosedSpline(points: Vec[], segs = 20): Sample[] {
  const n = points.length;
  const raw: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < segs; s++) raw.push(catmullRom(p0, p1, p2, p3, s / segs));
  }
  return finishSamples(raw);
}

/** Turn a closed polyline into samples with tangents, normals and cumulative distance. */
export function finishSamples(raw: Vec[]): Sample[] {
  const N = raw.length;
  const out: Sample[] = [];
  let dist = 0;
  for (let i = 0; i < N; i++) {
    const a = raw[(i - 1 + N) % N];
    const b = raw[(i + 1) % N];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    if (i > 0) dist += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    out.push({ x: raw[i].x, y: raw[i].y, tx, ty, nx: ty, ny: -tx, s: dist });
  }
  return out;
}

export function formatTime(s: number): string {
  if (!isFinite(s) || s <= 0) return "--:--.--";
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(2).padStart(5, "0")}`;
}
