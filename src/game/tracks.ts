import { finishSamples, TAU, wrapLoop, type Sample, type Vec } from "./math.ts";

export type TrackTheme = "grass" | "desert" | "mesa" | "snow" | "forest" | "night" | "neon";

export type CarShape = "model-s" | "model-3" | "model-y" | "model-x" | "cybertruck" | "roadster";

export type CarDef = {
  id: string;
  name: string;
  handle: string;
  /** Paint name (Tesla's current colour range). */
  paint: string;
  color: string;
  shape: CarShape;
  accel: number;
  top: number;
  grip: number;
  turn: number;
  blurb: string;
};

export const CARS: CarDef[] = [
  { id: "model-s", name: "MODEL S", handle: "LIFTBACK", paint: "Ultra Red", color: "#b3141c", shape: "model-s",
    accel: 0.92, top: 0.9, grip: 0.8, turn: 0.9, blurb: "Plaid-fast liftback. Lives on the handbrake." },
  { id: "model-3", name: "MODEL 3", handle: "SEDAN", paint: "Pearl White", color: "#e6e9ec", shape: "model-3",
    accel: 0.8, top: 0.84, grip: 1.05, turn: 0.95, blurb: "Planted and forgiving. The all-rounder." },
  { id: "model-y", name: "MODEL Y", handle: "CROSSOVER", paint: "Deep Blue Metallic", color: "#1f3f78", shape: "model-y",
    accel: 0.84, top: 0.8, grip: 0.98, turn: 1.1, blurb: "Short and tall. Eats hairpins." },
  { id: "model-x", name: "MODEL X", handle: "SUV", paint: "Diamond Black", color: "#17181c", shape: "model-x",
    accel: 0.74, top: 0.96, grip: 0.9, turn: 0.78, blurb: "Heavy, wide, and very hard to stop." },
  { id: "cybertruck", name: "CYBERTRUCK", handle: "TRUCK", paint: "Quicksilver", color: "#aeb4bb", shape: "cybertruck",
    accel: 0.88, top: 1.0, grip: 0.84, turn: 0.82, blurb: "Bulletproof opinions. Flat out in a straight line." },
  { id: "roadster", name: "ROADSTER", handle: "SUPERCAR", paint: "Stealth Grey", color: "#5d6168", shape: "roadster",
    accel: 1.0, top: 1.06, grip: 0.72, turn: 0.86, blurb: "Silly quick. Twitchy. Don't blink." },
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
  { id: "oval", name: "WORKBENCH OVAL", subtitle: "Stadium · easy",
    laps: 3, roadHalf: 78, runoff: 42, theme: "grass",
    points: blob(16, 620, 360, [[3, 20 / 620, 0]]) },
  { id: "speedway", name: "SUNSET SPEEDWAY", subtitle: "Desert · flat out",
    laps: 3, roadHalf: 86, runoff: 50, theme: "desert",
    points: blob(24, 1100, 650, [[2, 0.06, 0.4], [3, 0.07, 1.7]]) },
  { id: "canyon", name: "COPPER CANYON", subtitle: "Red rock · flowing",
    laps: 3, roadHalf: 66, runoff: 46, theme: "mesa",
    points: blob(28, 820, 420, [[3, 0.13, 0.6], [5, 0.06, 1.9], [2, 0.05, 0.2]]) },
  { id: "frost", name: "FROSTBITE RING", subtitle: "Snow · sweeping",
    laps: 3, roadHalf: 60, runoff: 40, theme: "snow",
    points: blob(30, 760, 470, [[2, 0.10, 0.5], [3, 0.12, 2.1], [6, 0.04, 0.4]]) },
  { id: "pine", name: "PINE RIDGE", subtitle: "Forest · twisty",
    laps: 3, roadHalf: 62, runoff: 44, theme: "forest",
    points: blob(30, 720, 520, [[5, 0.10, 0.9], [3, 0.10, 0.1], [2, 0.08, 1.5]]) },
  { id: "park", name: "DENISE PARK", subtitle: "Night street · technical",
    laps: 3, roadHalf: 56, runoff: 36, theme: "night",
    points: blob(32, 700, 430, [[4, 0.15, 0.3], [7, 0.05, 1.0], [2, 0.07, 2.0]]) },
  { id: "neon", name: "NEON DOCKS", subtitle: "Harbour night · hard",
    laps: 3, roadHalf: 54, runoff: 34, theme: "neon",
    points: blob(30, 960, 400, [[3, 0.12, 1.2], [4, 0.05, 0.3], [5, 0.02, 2.5]]) },
];

export type PropKind = "tree" | "pine" | "cactus" | "rock" | "lamp" | "box";

export type Prop = {
  k: PropKind;
  x: number;
  y: number;
  /** Radius (round props). */
  r: number;
  /** Height above the ground. */
  h: number;
  /** Box footprint (width x depth) and rotation. */
  w: number;
  d: number;
  ang: number;
  c1: string;
  c2: string;
  /** Free-form variation 0..1. */
  t: number;
  /** Light glow colour for lamps. */
  glow?: string;
};

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
  /** Scenery that stands up out of the ground (drawn per frame so it can lean + cast shadows). */
  props: Prop[];
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
  const wallPad = wallR + 300;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x - wallPad); maxX = Math.max(maxX, s.x + wallPad);
    minY = Math.min(minY, s.y - wallPad); maxY = Math.max(maxY, s.y + wallPad);
  }
  return {
    def, samples, radius, length, spacing: length / N, wallR, canvas: null, props: [],
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

type Pal = {
  ground: string; ground2: string; ground3: string;
  sand: string; sand2: string;
  road: string; roadSpeck: string;
  kerbA: string; kerbB: string; line: string; barrier: string; dark: boolean;
};

const PALETTE: Record<TrackTheme, Pal> = {
  grass: { ground: "#2f7a33", ground2: "#276a2c", ground3: "#3a8a3e", sand: "#b6a05a", sand2: "#a58f4c",
    road: "#3d4049", roadSpeck: "#51555f", kerbA: "#d33a2c", kerbB: "#f0ebe0", line: "#ece8d2", barrier: "#1d1f24", dark: false },
  desert: { ground: "#d3ab62", ground2: "#c29a52", ground3: "#e0bd78", sand: "#eed496", sand2: "#dcc07c",
    road: "#4f453d", roadSpeck: "#655a50", kerbA: "#c43028", kerbB: "#f2eadb", line: "#efd896", barrier: "#2b2118", dark: false },
  mesa: { ground: "#a85a36", ground2: "#96492a", ground3: "#b86c44", sand: "#dca066", sand2: "#cc9058",
    road: "#483c37", roadSpeck: "#5c4e47", kerbA: "#c43028", kerbB: "#f0e8d8", line: "#efd8b0", barrier: "#2a1b15", dark: false },
  snow: { ground: "#e8f0f6", ground2: "#d8e4ee", ground3: "#f6fafd", sand: "#f8fbfd", sand2: "#e8f0f6",
    road: "#4c535d", roadSpeck: "#626a75", kerbA: "#c43030", kerbB: "#f4f7fa", line: "#f4f7fa", barrier: "#2c3138", dark: false },
  forest: { ground: "#2c4d27", ground2: "#234220", ground3: "#365c30", sand: "#806744", sand2: "#705839",
    road: "#46423d", roadSpeck: "#5a554f", kerbA: "#c8602a", kerbB: "#efe6d4", line: "#e8e0c8", barrier: "#1c1a16", dark: false },
  night: { ground: "#10222f", ground2: "#0c1b26", ground3: "#16303f", sand: "#203f52", sand2: "#19323f",
    road: "#2d343d", roadSpeck: "#404852", kerbA: "#e8861e", kerbB: "#46b4d8", line: "#8fd8ea", barrier: "#0b1218", dark: true },
  neon: { ground: "#150d27", ground2: "#100a1f", ground3: "#1b1234", sand: "#2c1b4e", sand2: "#231541",
    road: "#262640", roadSpeck: "#37375a", kerbA: "#ff2e97", kerbB: "#25e1ff", line: "#8ff4ff", barrier: "#0a0716", dark: true },
};

export function themeIsDark(t: TrackTheme): boolean {
  return PALETTE[t].dark;
}

export function themeGround(t: TrackTheme): string {
  return PALETTE[t].ground;
}

/** Multiply an #rrggbb colour (f<1 darkens, f>1 blends toward white). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; }
  else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noiseTile(base: string, speck: string, rnd: () => number, size = 64): CanvasPattern | string {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const x = c.getContext("2d");
  if (!x) return base;
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  x.fillStyle = speck;
  for (let i = 0; i < size * size * 0.1; i++) {
    x.globalAlpha = 0.2 + rnd() * 0.5;
    x.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1 + Math.floor(rnd() * 2), 1);
  }
  x.globalAlpha = 1;
  return x.createPattern(c, "repeat") ?? base;
}

function loop(ctx: CanvasRenderingContext2D, S: Sample[], ox: number, oy: number) {
  ctx.beginPath();
  ctx.moveTo(S[0].x - ox, S[0].y - oy);
  for (let i = 1; i < S.length; i++) ctx.lineTo(S[i].x - ox, S[i].y - oy);
  ctx.closePath();
}

const GRID_SLOTS: [number, number][] = [[45, -26], [45, 26], [115, -26], [115, 26], [185, -26], [185, 26]];

function makeProps(track: Track, rnd: () => number): Prop[] {
  const theme = track.def.theme;
  const S = track.samples;
  const props: Prop[] = [];
  const clear = track.wallR + 22;
  const free = (x: number, y: number, pad: number) => locate(track, x, y).d > clear + pad;
  const spot = (minD: number, maxD: number): { x: number; y: number } => {
    const s = S[Math.floor(rnd() * S.length)];
    const side = rnd() < 0.5 ? -1 : 1;
    const d = track.wallR + minD + rnd() * (maxD - minD);
    return { x: s.x + s.nx * side * d, y: s.y + s.ny * side * d };
  };
  const base: Prop = { k: "tree", x: 0, y: 0, r: 10, h: 30, w: 0, d: 0, ang: 0, c1: "#000", c2: "#000", t: 0 };
  const add = (p: Partial<Prop> & { k: PropKind; x: number; y: number }) => props.push({ ...base, t: rnd(), ...p });

  const count = Math.round(track.length / 22);
  for (let n = 0, tries = 0; n < count && tries < count * 6; tries++) {
    const { x, y } = spot(14, 260);
    let r = 9 + rnd() * 9;
    if (!free(x, y, r)) continue;
    n++;
    switch (theme) {
      case "grass": add({ k: "tree", x, y, r, h: 34, c1: "#1f5d26", c2: "#2f8a36" }); break;
      case "forest": r += 3; add({ k: "pine", x, y, r, h: 46, c1: "#173d1b", c2: "#26622c" }); break;
      case "snow": add({ k: "pine", x, y, r, h: 44, c1: "#2a5a40", c2: "#f4f8fb" }); break;
      case "desert":
        if (rnd() < 0.55) add({ k: "cactus", x, y, r: 5 + rnd() * 3, h: 13, c1: "#3d7a3a", c2: "#5da053" });
        else add({ k: "rock", x, y, r: 8 + rnd() * 12, h: 14, c1: "#a8825a", c2: "#c9a272" });
        break;
      case "mesa": add({ k: "rock", x, y, r: 12 + rnd() * 22, h: 26 + rnd() * 20, c1: "#8a4528", c2: "#c47a4c" }); break;
      case "night": case "neon":
        if (rnd() < 0.5) add({ k: "rock", x, y, r: 6 + rnd() * 6, h: 8, c1: "#26323e", c2: "#3a4856" });
        break;
    }
  }

  if (theme === "night" || theme === "neon") {
    const glowA = theme === "neon" ? "#ff4fd0" : "#ffd88a";
    const glowB = theme === "neon" ? "#34e8ff" : "#ffd88a";
    for (let i = 0; i < S.length; i += 12) {
      const s = S[i];
      const side = (i / 12) % 2 === 0 ? 1 : -1;
      const d = track.wallR + 16;
      add({ k: "lamp", x: s.x + s.nx * side * d, y: s.y + s.ny * side * d, r: 3, h: 42,
        c1: "#2a323c", c2: "#8a96a4", glow: side > 0 ? glowA : glowB });
    }
    const palette = theme === "neon"
      ? ["#2b1a5a", "#3a1a58", "#1a2a58", "#4a1a4a", "#14385a"]
      : ["#27303c", "#2f3a48", "#232a34", "#34404e"];
    const boxes = Math.round(track.length / 150);
    for (let n = 0, tries = 0; n < boxes && tries < boxes * 12; tries++) {
      const w = 60 + rnd() * 90, d = 50 + rnd() * 70;
      const { x, y } = spot(60, 320);
      if (!free(x, y, Math.max(w, d) * 0.75)) continue;
      n++;
      add({ k: "box", x, y, r: 0, h: 50 + rnd() * 70, w, d, ang: rnd() * Math.PI,
        c1: palette[Math.floor(rnd() * palette.length)], c2: theme === "neon" ? "#ff4fd0" : "#ffd88a" });
    }
    if (theme === "neon") {
      const cols = ["#d8452c", "#2c7ad8", "#e0b020", "#3aa860", "#9a4ad8"];
      for (let n = 0, tries = 0; n < 40 && tries < 400; tries++) {
        const { x, y } = spot(30, 200);
        if (!free(x, y, 40)) continue;
        n++;
        const ang = rnd() * Math.PI;
        const stack = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < stack; k++) {
          add({ k: "box", x: x + k * 3, y: y + k * 18, r: 0, h: 18, w: 46, d: 16, ang,
            c1: cols[Math.floor(rnd() * cols.length)], c2: "#ffffff" });
        }
      }
    }
  }

  // Grandstand beside the start line.
  const st = S[0];
  const sd = track.wallR + 46;
  for (const side of [-1, 1]) {
    const x = st.x + st.nx * side * sd, y = st.y + st.ny * side * sd;
    if (locate(track, x, y).d > track.wallR + 20) {
      add({ k: "box", x, y, r: 0, h: 26, w: 150, d: 34, ang: Math.atan2(st.ty, st.tx),
        c1: "#6a7280", c2: "crowd", t: side });
    }
  }
  return props;
}

/** Browser build: geometry, baked ground texture and the prop list. */
export function bakeTrack(def: TrackDef): Track {
  const track = buildTrack(def);
  const S = track.samples;
  const pal = PALETTE[def.theme];
  const rnd = mulberry(hashStr(def.id));
  const scale = Math.min(1, 2400 / Math.max(track.worldW, track.worldH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(track.worldW * scale);
  canvas.height = Math.ceil(track.worldH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("track canvas");
  ctx.scale(scale, scale);
  const ox = track.originX, oy = track.originY;
  const W = track.worldW, H = track.worldH;

  // Ground: base + big soft patches + speckle.
  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = 0.18 + rnd() * 0.22;
    ctx.fillStyle = rnd() < 0.5 ? pal.ground2 : pal.ground3;
    ctx.beginPath();
    ctx.ellipse(rnd() * W, rnd() * H, 40 + rnd() * 160, 30 + rnd() * 120, rnd() * Math.PI, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  const speck = Math.round((W * H) / 520);
  for (let i = 0; i < speck; i++) {
    ctx.fillStyle = rnd() < 0.5 ? pal.ground2 : pal.ground3;
    ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 1 + rnd() * 2);
  }
  ctx.globalAlpha = 1;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Soft shadow under the barrier, then the tyre wall.
  ctx.strokeStyle = "rgba(0,0,0,0.30)";
  ctx.lineWidth = (track.wallR + 20) * 2;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.strokeStyle = pal.barrier;
  ctx.lineWidth = (track.wallR + 9) * 2;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.setLineDash([6, 8]);
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth = (track.wallR - 3) * 2 + 3;
  loop(ctx, S, ox, oy); ctx.stroke();

  // Runoff.
  ctx.strokeStyle = noiseTile(pal.sand, pal.sand2, rnd);
  ctx.lineWidth = (track.wallR - 3) * 2;
  loop(ctx, S, ox, oy); ctx.stroke();

  // Kerbs.
  ctx.lineCap = "butt";
  ctx.strokeStyle = pal.kerbA;
  ctx.lineWidth = def.roadHalf * 2 + 16;
  ctx.setLineDash([14, 14]);
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.strokeStyle = pal.kerbB;
  ctx.lineDashOffset = 14;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.lineCap = "round";

  // Asphalt with edge lines.
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = def.roadHalf * 2 + 2;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.strokeStyle = noiseTile(pal.road, pal.roadSpeck, rnd);
  ctx.lineWidth = def.roadHalf * 2 - 4;
  loop(ctx, S, ox, oy); ctx.stroke();

  // Rubbered-in racing line + centre dashes.
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = def.roadHalf * 0.9;
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.strokeStyle = pal.line;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "butt";
  ctx.setLineDash([16, 18]);
  loop(ctx, S, ox, oy); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = "round";

  // Grid boxes behind the line.
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  for (const [dd, side] of GRID_SLOTS) {
    const idx = (S.length - Math.round(dd / track.spacing) + S.length) % S.length;
    const g = S[idx];
    ctx.save();
    ctx.translate(g.x + g.nx * side - ox, g.y + g.ny * side - oy);
    ctx.rotate(Math.atan2(g.ty, g.tx));
    ctx.strokeRect(-24, -16, 44, 32);
    ctx.restore();
  }

  // Chequered start/finish line.
  const st = S[0];
  ctx.save();
  ctx.translate(st.x - ox, st.y - oy);
  ctx.rotate(Math.atan2(st.ty, st.tx));
  const cell = 7;
  for (let row = 0; row < 3; row++) {
    for (let i = -def.roadHalf + 2, k = 0; i < def.roadHalf - 2; i += cell, k++) {
      ctx.fillStyle = (k + row) % 2 === 0 ? "#f4f4f4" : "#15171c";
      ctx.fillRect(-10 + row * cell, i, cell, Math.min(cell, def.roadHalf - 2 - i));
    }
  }
  ctx.restore();

  track.props = makeProps(track, rnd);
  track.canvas = canvas;
  return track;
}
