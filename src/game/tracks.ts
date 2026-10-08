import { finishSamples, TAU, wrapLoop, type Sample, type Vec } from "./math.ts";

export type TrackTheme = "grass" | "desert" | "night";

export type CarDef = {
  id: string;
  name: string;
  handle: string;
  color: string;
  src: string;
  accel: number;
  top: number;
  grip: number;
  turn: number;
  blurb: string;
};

export const CARS: CarDef[] = [
  { id: "vex", name: "VEX-7", handle: "WEDGE", color: "#c43028", src: "game/car-red.png",
    accel: 0.92, top: 0.88, grip: 0.78, turn: 0.9, blurb: "Nervous power. Lives on the handbrake." },
  { id: "tourer", name: "TOURER", handle: "SALOON", color: "#2a5fd0", src: "game/car-blue.png",
    accel: 0.78, top: 0.86, grip: 1.05, turn: 0.92, blurb: "Planted touring car. Forgives the grass." },
  { id: "rallye", name: "RALLYE", handle: "HATCH", color: "#e0b21a", src: "game/car-yellow.png",
    accel: 0.86, top: 0.76, grip: 0.96, turn: 1.12, blurb: "Short wheelbase. Eats hairpins." },
  { id: "gt", name: "GREEN GT", handle: "COUPE", color: "#2f7a3a", src: "game/car-green.png",
    accel: 0.7, top: 1.08, grip: 0.88, turn: 0.78, blurb: "Long bonnet. King of the straights." },
];

export type TrackDef = {
  id: string;
  name: string;
  subtitle: string;
  laps: number;
  roadHalf: number;
  runoff: number;
  theme: TrackTheme;
  points: Vec[];
};

/** Closed loop of control points: an ellipse with optional sine-harmonic wobble. */
function blob(n: number, a: number, b: number, harm: [number, number, number][]): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    let r = 1;
    for (const [k, amp, ph] of harm) r += amp * Math.sin(k * th + ph);
    pts.push({ x: a * r * Math.cos(th), y: b * r * Math.sin(th) });
  }
  return pts;
}

export const TRACKS: TrackDef[] = [
  {
    id: "oval", name: "WORKBENCH OVAL", subtitle: "Stadium · easy",
    laps: 3, roadHalf: 78, runoff: 42, theme: "grass",
    points: blob(16, 620, 360, [[3, 20 / 620, 0]]),
  },
  {
    id: "canyon", name: "COPPER CANYON", subtitle: "Desert · flowing",
    laps: 3, roadHalf: 66, runoff: 46, theme: "desert",
    points: blob(28, 820, 420, [[3, 0.13, 0.6], [5, 0.06, 1.9], [2, 0.05, 0.2]]),
  },
  {
    id: "park", name: "DENISE PARK", subtitle: "Night street · technical",
    laps: 3, roadHalf: 56, runoff: 36, theme: "night",
    points: blob(32, 700, 430, [[4, 0.15, 0.3], [7, 0.05, 1.0], [2, 0.07, 2.0]]),
  },
];

export type Track = {
  def: TrackDef;
  samples: Sample[];
  /** Centre-line radius of curvature at each sample (Infinity on straights). */
  radius: number[];
  length: number;
  spacing: number;
  wallR: number;
  /** Null when built headless (tests). */
  canvas: HTMLCanvasElement | null;
  originX: number;
  originY: number;
  worldW: number;
  worldH: number;
};

const SEGS = 20;

/** Pure geometry — no DOM needed, so the simulation can be tested in Node. */
export function buildTrack(def: TrackDef): Track {
  const n = def.points.length;
  const raw: Vec[] = [];
  const P = def.points;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let s = 0; s < SEGS; s++) {
      const t = s / SEGS, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  const N = raw.length;

  // Put the start line on the straightest stretch (room for the grid behind it).
  const turn: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = raw[i], b = raw[(i + 1) % N], c = raw[(i + 2) % N];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
    turn.push(Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))));
  }
  const back = 45, fwd = 10;
  let bestStart = 0, bestScore = Infinity;
  for (let i = 0; i < N; i++) {
    let sc = 0;
    for (let k = -back; k <= fwd; k++) sc += turn[(i + k + N) % N] * (k < 0 ? 1.4 : 1);
    if (sc < bestScore) { bestScore = sc; bestStart = i; }
  }
  const rotated = raw.slice(bestStart).concat(raw.slice(0, bestStart));
  const samples = finishSamples(rotated);
  const last = samples[N - 1];
  const length = last.s + Math.hypot(samples[0].x - last.x, samples[0].y - last.y);

  const radius: number[] = [];
  const K = 4;
  for (let i = 0; i < N; i++) {
    const a = samples[(i - K + N) % N], b = samples[i], c = samples[(i + K) % N];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ca = Math.hypot(a.x - c.x, a.y - c.y);
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    radius.push(area2 < 1e-3 ? Infinity : (ab * bc * ca) / (2 * area2));
  }

  const wallR = def.roadHalf + def.runoff;
  const wallPad = wallR + 120;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x - wallPad); maxX = Math.max(maxX, s.x + wallPad);
    minY = Math.min(minY, s.y - wallPad); maxY = Math.max(maxY, s.y + wallPad);
  }
  return {
    def, samples, radius, length, spacing: length / N, wallR, canvas: null,
    originX: minX, originY: minY, worldW: maxX - minX, worldH: maxY - minY,
  };
}

export type Locate = {
  /** Index of the segment start (segment runs i -> i+1). */
  i: number;
  /** Distance along the track at the closest point, 0..length. */
  s: number;
  /** Distance from the centre line. */
  d: number;
  /** Signed lateral offset (positive = along the sample normal). */
  lat: number;
  px: number;
  py: number;
};

/**
 * Closest point on the centre line. With a `hint` only a window around it is searched, which keeps
 * a car locked to its own stretch of road even where two sections run close together.
 */
export function locate(track: Track, x: number, y: number, hint = -1, window = 36): Locate {
  const S = track.samples;
  const N = S.length;
  let best = 0, bestD2 = Infinity, bestT = 0;
  const lo = hint < 0 ? 0 : -window;
  const hi = hint < 0 ? N - 1 : window;
  for (let k = lo; k <= hi; k++) {
    const i = hint < 0 ? k : (((hint + k) % N) + N) % N;
    const a = S[i], b = S[(i + 1) % N];
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((x - a.x) * abx + (y - a.y) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a.x + abx * t), dy = y - (a.y + aby * t);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = i; bestT = t; }
  }
  const a = S[best], b = S[(best + 1) % N];
  const px = a.x + (b.x - a.x) * bestT, py = a.y + (b.y - a.y) * bestT;
  const segLen = best < N - 1 ? S[best + 1].s - a.s : track.length - a.s;
  const lat = (x - px) * a.nx + (y - py) * a.ny;
  return { i: best, s: a.s + bestT * segLen, d: Math.sqrt(bestD2), lat, px, py };
}

export { wrapLoop };

// ───────────────────────── painting (browser only) ─────────────────────────

const PALETTE = {
  grass: { ground: "#1c4a22", ground2: "#163c1c", sand: "#8a7a3a", road: "#3a3c44", road2: "#2c2e36",
    kerbA: "#c43028", kerbB: "#e8e0d0", line: "#d4c878", tree: "#0f3a14", stand: "#4a3a2a" },
  desert: { ground: "#c4a05a", ground2: "#b08848", sand: "#e0c078", road: "#4a4038", road2: "#3a322c",
    kerbA: "#c43028", kerbB: "#efe6d4", line: "#e8d090", tree: "#6a5030", stand: "#7a4a28" },
  night: { ground: "#0c1c28", ground2: "#08141e", sand: "#1a3040", road: "#2a3038", road2: "#1e2228",
    kerbA: "#e07a1a", kerbB: "#3aa0c8", line: "#6ec8e0", tree: "#0a2830", stand: "#1a2838" },
};

function ditherPattern(c1: string, c2: string): CanvasPattern | string {
  const p = document.createElement("canvas");
  p.width = 8; p.height = 8;
  const x = p.getContext("2d");
  if (!x) return c1;
  x.fillStyle = c1; x.fillRect(0, 0, 8, 8);
  x.fillStyle = c2;
  for (let y = 0; y < 8; y++) for (let c = 0; c < 8; c++) if ((c + y) % 2 === 0) x.fillRect(c, y, 1, 1);
  return x.createPattern(p, "repeat") ?? c1;
}

function loop(ctx: CanvasRenderingContext2D, S: Sample[], ox: number, oy: number) {
  ctx.beginPath();
  ctx.moveTo(S[0].x - ox, S[0].y - oy);
  for (let i = 1; i < S.length; i++) ctx.lineTo(S[i].x - ox, S[i].y - oy);
  ctx.closePath();
}

/** Browser build: geometry plus the pre-rendered ground texture. */
export function bakeTrack(def: TrackDef): Track {
  const track = buildTrack(def);
  const S = track.samples;
  const pal = PALETTE[def.theme];
  const scale = Math.min(1, 2200 / Math.max(track.worldW, track.worldH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(track.worldW * scale);
  canvas.height = Math.ceil(track.worldH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("track canvas");
  ctx.scale(scale, scale);
  const ox = track.originX, oy = track.originY;

  ctx.fillStyle = ditherPattern(pal.ground, pal.ground2);
  ctx.fillRect(0, 0, track.worldW, track.worldH);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.strokeStyle = pal.sand;
  ctx.lineWidth = track.wallR * 2;
  loop(ctx, S, ox, oy); ctx.stroke();

  ctx.lineCap = "butt";
  ctx.strokeStyle = pal.kerbA;
  ctx.lineWidth = def.roadHalf * 2 + 14;
  ctx.setLineDash([16, 16]);
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.strokeStyle = pal.kerbB;
  ctx.lineDashOffset = 16;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.lineCap = "round";

  ctx.strokeStyle = pal.road;
  ctx.lineWidth = def.roadHalf * 2;
  loop(ctx, S, ox, oy); ctx.stroke();

  ctx.strokeStyle = pal.road2;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  ctx.globalAlpha = 0.85;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // Start / finish line across the road.
  const st = S[0];
  ctx.save();
  ctx.translate(st.x - ox, st.y - oy);
  ctx.rotate(Math.atan2(st.ty, st.tx));
  ctx.fillStyle = pal.line;
  for (let i = -def.roadHalf + 4; i < def.roadHalf - 4; i += 12) ctx.fillRect(-5, i, 10, 8);
  ctx.restore();

  // Scenery just outside the walls.
  for (let i = 0; i < S.length; i += 14) {
    const s = S[i];
    const prev = S[(i - 1 + S.length) % S.length];
    const curv = Math.abs(Math.atan2(s.tx * prev.ty - s.ty * prev.tx, s.tx * prev.tx + s.ty * prev.ty));
    if (curv > 0.12) continue;
    const d = track.wallR + 28 + (i % 3) * 10;
    const tx = s.x - s.nx * d - ox, ty = s.y - s.ny * d - oy;
    ctx.fillStyle = pal.tree;
    ctx.beginPath(); ctx.arc(tx, ty, 11 + (i % 5), 0, TAU); ctx.fill();
    ctx.fillStyle = pal.stand;
    ctx.fillRect(tx - 3, ty - 3, 6, 6);
  }
  if (def.theme === "grass") {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const s = S[Math.floor((S.length / 6) * k + 8) % S.length];
        const d = track.wallR + 36;
        ctx.save();
        ctx.translate(s.x + s.nx * side * d - ox, s.y + s.ny * side * d - oy);
        ctx.rotate(Math.atan2(s.ty, s.tx));
        ctx.fillStyle = pal.stand; ctx.fillRect(-28, -10, 56, 20);
        ctx.fillStyle = "#c43028"; ctx.fillRect(-28, -10, 56, 5);
        ctx.restore();
      }
    }
  }
  track.canvas = canvas;
  return track;
}
