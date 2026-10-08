import { clamp, formatTime } from "./math.ts";
import { shade, themeGround, themeIsDark, type CarDef, type CarShape, type Prop } from "./tracks.ts";
import type { Car, RaceState } from "./sim.ts";

// ───────────────────────────── camera ─────────────────────────────

export type Camera = { x: number; y: number; yaw: number; zoom: number; shakeX: number; shakeY: number };

export function createCamera(): Camera {
  return { x: 0, y: 0, yaw: 0, zoom: 1, shakeX: 0, shakeY: 0 };
}

export function viewScale(w: number, h: number): number {
  return clamp(Math.min(w, h) / 430, 0.85, 1.6);
}

export function updateCamera(cam: Camera, car: Car, dt: number, speed: number, scale: number) {
  const fx = -Math.sin(car.heading);
  const fy = -Math.cos(car.heading);
  const look = 48 + speed * 0.18;
  const k = 1 - Math.exp(-9 * dt);
  cam.x += (car.x + fx * look - cam.x) * k;
  cam.y += (car.y + fy * look - cam.y) * k;
  cam.yaw += Math.atan2(Math.sin(car.heading - cam.yaw), Math.cos(car.heading - cam.yaw)) * (1 - Math.exp(-10 * dt));
  const zTarget = scale * (1.08 - Math.min(0.32, speed / 980));
  cam.zoom += (zTarget - cam.zoom) * (1 - Math.exp(-3 * dt));
}

export function snapCamera(cam: Camera, car: Car, scale = 1) {
  cam.x = car.x;
  cam.y = car.y;
  cam.yaw = car.heading;
  cam.zoom = scale;
}

/** How strongly tall things lean away from the camera focus (per unit of height). */
const LEAN = 0.003;

/** A fixed-on-screen offset (sx right, sy down) expressed as a world-space offset. */
function screenToWorld(yaw: number, sx: number, sy: number): { x: number; y: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: sx * c + sy * s, y: -sx * s + sy * c };
}

// ───────────────────────────── Tesla-style cars ─────────────────────────────

type Prof = [number, number][];

type ShapeSpec = {
  prof: Prof;
  cabin: Prof;
  sharp?: boolean;
  front: number;
  rear: number;
  track: number;
  wheelW: number;
  wheelL: number;
  roofH: number;
};

const SHAPES: Record<CarShape, ShapeSpec> = {
  "model-s": {
    prof: [[-29, 6], [-26, 10], [-18, 12.6], [-4, 13.2], [14, 13.2], [24, 12], [29, 8.5]],
    cabin: [[-9, 9.4], [-5, 11], [6, 11.6], [17, 10.6], [22, 8]],
    front: -17, rear: 17, track: 12.7, wheelW: 4.8, wheelL: 9.6, roofH: 9,
  },
  "model-3": {
    prof: [[-27, 6.5], [-24, 10.2], [-16, 12.8], [0, 13.4], [14, 13.2], [23, 11.6], [27, 8]],
    cabin: [[-8, 9.6], [-4, 11.4], [6, 11.8], [14, 10.6], [19, 8.2]],
    front: -16, rear: 16, track: 12.8, wheelW: 4.8, wheelL: 9.4, roofH: 9,
  },
  "model-y": {
    prof: [[-27, 7], [-23.5, 11.2], [-14, 13.4], [2, 13.8], [18, 13.8], [25, 12.8], [27, 10]],
    cabin: [[-8, 10], [-4, 12], [8, 12.4], [20, 11.8], [24, 9.6]],
    front: -16, rear: 16, track: 13.1, wheelW: 5, wheelL: 9.8, roofH: 12,
  },
  "model-x": {
    prof: [[-29, 7.5], [-25, 11.8], [-14, 14], [2, 14.4], [20, 14.4], [27, 13.2], [29, 10.5]],
    cabin: [[-14, 10.4], [-7, 12.8], [8, 13.2], [22, 12.6], [26, 10.2]],
    front: -17, rear: 18, track: 13.7, wheelW: 5.4, wheelL: 10.6, roofH: 14,
  },
  cybertruck: {
    prof: [[-31, 9], [-24, 13.6], [-8, 14.6], [4, 14.8], [28, 14], [31, 12.6]],
    cabin: [[-12, 8.5], [-4, 13], [8, 13.4], [11, 12]],
    sharp: true, front: -19, rear: 19, track: 13.9, wheelW: 5.6, wheelL: 11.6, roofH: 12,
  },
  roadster: {
    prof: [[-26, 6], [-22, 10.8], [-12, 13.8], [2, 14.4], [16, 14.2], [24, 12.4], [26, 8.5]],
    cabin: [[-4, 8.4], [0, 10], [7, 10.4], [12, 8.4]],
    front: -15, rear: 16, track: 13.6, wheelW: 5.2, wheelL: 9.6, roofH: 6,
  },
};

const S = 5; // sprite pixels per world unit
const SW = 34; // sprite width in world units
const SH = 70;

type Sprites = { body: HTMLCanvasElement; cabin: HTMLCanvasElement; wall: HTMLCanvasElement; shadow: HTMLCanvasElement };
const spriteCache = new Map<string, Sprites>();

function sil(ctx: CanvasRenderingContext2D, prof: Prof, sharp = false) {
  const n = prof.length;
  ctx.beginPath();
  ctx.moveTo(-prof[0][1], prof[0][0]);
  ctx.lineTo(prof[0][1], prof[0][0]);
  if (sharp) {
    for (let i = 1; i < n; i++) ctx.lineTo(prof[i][1], prof[i][0]);
    for (let i = n - 1; i >= 1; i--) ctx.lineTo(-prof[i][1], prof[i][0]);
  } else {
    for (let i = 1; i < n - 1; i++) {
      const [y, w] = prof[i], [y2, w2] = prof[i + 1];
      ctx.quadraticCurveTo(w, y, (w + w2) / 2, (y + y2) / 2);
    }
    ctx.lineTo(prof[n - 1][1], prof[n - 1][0]);
    ctx.lineTo(-prof[n - 1][1], prof[n - 1][0]);
    for (let i = n - 2; i >= 1; i--) {
      const [y, w] = prof[i], [y0, w0] = prof[i - 1];
      ctx.quadraticCurveTo(-w, y, -(w + w0) / 2, (y + y0) / 2);
    }
  }
  ctx.closePath();
}

function newSprite(): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = SW * S;
  c.height = SH * S;
  const x = c.getContext("2d");
  if (!x) throw new Error("sprite ctx");
  x.translate((SW * S) / 2, (SH * S) / 2);
  x.scale(S, S);
  return { c, x };
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

function buildSprites(def: CarDef): Sprites {
  const spec = SHAPES[def.shape];
  const dark = luminance(def.color) < 70;
  const light = luminance(def.color) > 190;
  const hi = dark ? 2.1 : light ? 1.06 : 1.22;
  const lo = dark ? 0.7 : light ? 0.78 : 0.7;
  const nose = spec.prof[0][0];
  const tail = spec.prof[spec.prof.length - 1][0];

  // ── body ──
  const body = newSprite();
  {
    const x = body.x;
    sil(x, spec.prof, spec.sharp);
    const g = x.createLinearGradient(-14, 0, 14, 0);
    g.addColorStop(0, shade(def.color, lo));
    g.addColorStop(0.28, shade(def.color, hi));
    g.addColorStop(0.55, shade(def.color, dark ? 1.4 : 1.02));
    g.addColorStop(1, shade(def.color, lo * 0.85));
    x.fillStyle = g;
    x.fill();
    x.lineWidth = 0.55;
    x.strokeStyle = "rgba(0,0,0,0.55)";
    x.stroke();

    x.save();
    sil(x, spec.prof, spec.sharp);
    x.clip();
    // soft specular band down the left shoulder
    const sg = x.createLinearGradient(-12, 0, -4, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, `rgba(255,255,255,${dark ? 0.2 : 0.16})`);
    sg.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = sg;
    x.fillRect(-14, nose, 10, tail - nose);
    // hood / boot shut lines
    x.strokeStyle = "rgba(0,0,0,0.38)";
    x.lineWidth = 0.35;
    const cabNose = spec.cabin[0][0];
    const cabTail = spec.cabin[spec.cabin.length - 1][0];
    x.beginPath();
    x.moveTo(-8.5, cabNose - 1); x.quadraticCurveTo(0, cabNose - 3.5, 8.5, cabNose - 1);
    x.moveTo(-9, cabTail + 1); x.quadraticCurveTo(0, cabTail + 3, 9, cabTail + 1);
    x.stroke();
    if (def.shape === "cybertruck") {
      // flat steel panels + darker load bed
      x.fillStyle = "rgba(0,0,0,0.22)";
      x.fillRect(-11.5, cabTail + 1.5, 23, tail - cabTail);
      x.strokeStyle = "rgba(255,255,255,0.35)";
      x.lineWidth = 0.5;
      x.beginPath();
      x.moveTo(-14, cabNose - 8); x.lineTo(-9, nose + 3);
      x.moveTo(14, cabNose - 8); x.lineTo(9, nose + 3);
      x.moveTo(0, nose); x.lineTo(0, cabNose - 2);
      x.stroke();
    }
    if (def.shape === "roadster") {
      x.fillStyle = "rgba(0,0,0,0.3)";
      x.beginPath(); x.ellipse(0, tail - 6, 9, 2.2, 0, 0, Math.PI * 2); x.fill();
    }
    x.restore();

    // LED headlight signatures
    x.fillStyle = "#f4fbff";
    x.shadowColor = "rgba(190,230,255,0.9)";
    x.shadowBlur = 2.4;
    if (def.shape === "cybertruck") {
      x.fillRect(-12.4, nose + 0.4, 24.8, 1.2);
    } else {
      for (const sd of [-1, 1]) {
        x.beginPath();
        x.moveTo(sd * 4.6, nose + 1.4);
        x.lineTo(sd * 9.6, nose + 3.8);
        x.lineTo(sd * 9.6, nose + 5.1);
        x.lineTo(sd * 4.6, nose + 2.8);
        x.closePath();
        x.fill();
      }
    }
    // tail lights
    x.fillStyle = "#ff2a2a";
    x.shadowColor = "rgba(255,40,40,0.9)";
    if (def.shape === "cybertruck" || def.shape === "model-y" || def.shape === "model-x") {
      x.fillRect(-11.4, tail - 1.8, 22.8, 1.2);
    } else {
      for (const sd of [-1, 1]) {
        x.beginPath();
        x.moveTo(sd * 5.2, tail - 2.6);
        x.lineTo(sd * 10.6, tail - 3.8);
        x.lineTo(sd * 10.6, tail - 2.5);
        x.lineTo(sd * 5.2, tail - 1.5);
        x.closePath();
        x.fill();
      }
    }
    x.shadowBlur = 0;
    // side mirrors
    x.fillStyle = shade(def.color, lo * 0.9);
    for (const sd of [-1, 1]) {
      x.beginPath();
      x.ellipse(sd * (spec.cabin[0][1] + 1.6), spec.cabin[0][0] + 1.5, 1.5, 0.9, sd * 0.4, 0, Math.PI * 2);
      x.fill();
    }
  }

  // ── cabin (the glass roof) ──
  const cabin = newSprite();
  {
    const x = cabin.x;
    sil(x, spec.cabin, spec.sharp);
    x.fillStyle = shade(def.color, dark ? 1.2 : 0.55);
    x.fill();
    x.save();
    x.translate(0, 0);
    x.scale(0.84, 0.9);
    const cy = (spec.cabin[0][0] + spec.cabin[spec.cabin.length - 1][0]) / 2;
    x.translate(0, cy * (1 / 0.9 - 1));
    sil(x, spec.cabin, spec.sharp);
    const g = x.createLinearGradient(-10, spec.cabin[0][0], 10, spec.cabin[spec.cabin.length - 1][0]);
    g.addColorStop(0, "#35465c");
    g.addColorStop(0.45, "#101722");
    g.addColorStop(1, "#05080d");
    x.fillStyle = g;
    x.fill();
    x.clip();
    x.fillStyle = "rgba(255,255,255,0.16)";
    x.beginPath();
    x.moveTo(-14, spec.cabin[0][0]);
    x.lineTo(-4, spec.cabin[0][0]);
    x.lineTo(6, spec.cabin[spec.cabin.length - 1][0]);
    x.lineTo(-4, spec.cabin[spec.cabin.length - 1][0]);
    x.closePath();
    x.fill();
    x.restore();
    sil(x, spec.cabin, spec.sharp);
    x.lineWidth = 0.45;
    x.strokeStyle = "rgba(0,0,0,0.6)";
    x.stroke();
    if (def.shape === "model-x") {
      // falcon-wing door seams
      x.strokeStyle = "rgba(255,255,255,0.22)";
      x.lineWidth = 0.3;
      x.beginPath();
      for (const sd of [-1, 1]) { x.moveTo(sd * 12.6, 0); x.lineTo(sd * 4.5, -2); x.lineTo(sd * 4.5, 14); }
      x.stroke();
    }
  }

  // ── cabin-wall silhouette (stacked under the roof to make it look solid) ──
  const wall = newSprite();
  {
    sil(wall.x, spec.cabin, spec.sharp);
    wall.x.fillStyle = shade(def.color, dark ? 0.9 : 0.42);
    wall.x.fill();
  }

  // ── blurred drop shadow ──
  const shadow = newSprite();
  {
    const x = shadow.x;
    x.filter = "blur(0.9px)";
    sil(x, spec.prof, spec.sharp);
    x.fillStyle = "#000";
    x.fill();
    x.filter = "none";
  }
  return { body: body.c, cabin: cabin.c, wall: wall.c, shadow: shadow.c };
}

function spritesFor(def: CarDef): Sprites {
  let s = spriteCache.get(def.id);
  if (!s) {
    s = buildSprites(def);
    spriteCache.set(def.id, s);
  }
  return s;
}

/** Data-URL of the car for menus (nose up, roof lifted slightly). */
const previewCache = new Map<string, string>();
export function carPreview(def: CarDef): string {
  const hit = previewCache.get(def.id);
  if (hit) return hit;
  const sp = spritesFor(def);
  const c = document.createElement("canvas");
  c.width = sp.body.width;
  c.height = sp.body.height;
  const x = c.getContext("2d");
  if (!x) return "";
  x.drawImage(sp.shadow, 6 * S * 0.35, 8 * S * 0.35);
  x.globalAlpha = 0.4;
  x.fillStyle = "#000";
  x.globalAlpha = 1;
  const spec = SHAPES[def.shape];
  const drawWheels = (cx: number) => {
    x.fillStyle = "#0b0c0e";
    for (const sd of [-1, 1]) for (const wy of [spec.front, spec.rear]) {
      x.fillRect(cx + sd * spec.track * S - (spec.wheelW * S) / 2, (SH * S) / 2 + wy * S - (spec.wheelL * S) / 2, spec.wheelW * S, spec.wheelL * S);
    }
  };
  drawWheels((SW * S) / 2);
  x.drawImage(sp.body, 0, 0);
  for (const t of [0.33, 0.66]) x.drawImage(sp.wall, 0, -t * 2.2 * S);
  x.drawImage(sp.cabin, 0, -2.2 * S);
  const url = c.toDataURL("image/png");
  previewCache.set(def.id, url);
  return url;
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, cam: Camera) {
  const sp = spritesFor(car.def);
  const spec = SHAPES[car.def.shape];
  const hw = SW / 2, hh = SH / 2;

  // drop shadow, fixed direction on screen
  const sh = screenToWorld(cam.yaw, 5, 8);
  ctx.save();
  ctx.translate(car.x + sh.x, car.y + sh.y);
  ctx.rotate(-car.heading);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(sp.shadow, -hw, -hh, SW, SH);
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(-car.heading);

  // wheels (front pair steers)
  for (const sd of [-1, 1]) {
    for (const wy of [spec.front, spec.rear]) {
      ctx.save();
      ctx.translate(sd * spec.track, wy);
      if (wy === spec.front) ctx.rotate(-car.steer * 0.5);
      ctx.fillStyle = "#08090b";
      ctx.fillRect(-spec.wheelW / 2, -spec.wheelL / 2, spec.wheelW, spec.wheelL);
      ctx.fillStyle = "#2a2d33";
      ctx.fillRect(-spec.wheelW / 2 + 0.6, -spec.wheelL / 2 + 0.8, 0.9, spec.wheelL - 1.6);
      ctx.restore();
    }
  }

  ctx.drawImage(sp.body, -hw, -hh, SW, SH);

  // brake / reverse lights + boost flame
  const fx = -Math.sin(car.heading), fy = -Math.cos(car.heading);
  const spdF = car.vx * fx + car.vy * fy;
  const tail = spec.prof[spec.prof.length - 1][0];
  if (car.brake > 0.2 && spdF > 6) {
    const g = ctx.createRadialGradient(0, tail, 0, 0, tail, 15);
    g.addColorStop(0, "rgba(255,50,40,0.85)");
    g.addColorStop(1, "rgba(255,50,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-16, tail - 12, 32, 26);
  } else if (spdF < -6) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(-9, tail - 1.4, 5, 1.2);
    ctx.fillRect(4, tail - 1.4, 5, 1.2);
  }
  if (car.boost > 0) {
    const len = 12 + Math.random() * 9;
    const g = ctx.createLinearGradient(0, tail, 0, tail + len);
    g.addColorStop(0, "rgba(120,200,255,0.95)");
    g.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = g;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 7 - 2, tail);
      ctx.lineTo(sd * 7, tail + len);
      ctx.lineTo(sd * 7 + 2, tail);
      ctx.fill();
    }
  }

  // roof: solid block that leans away from the camera focus
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const up = screenToWorld(cam.yaw, 0, -2.5);
  const wx = (car.x - cam.x) * spec.roofH * LEAN + up.x;
  const wy = (car.y - cam.y) * spec.roofH * LEAN + up.y;
  const lx = wx * c - wy * s;
  const ly = wx * s + wy * c;
  for (const t of [0.34, 0.67]) ctx.drawImage(sp.wall, -hw + lx * t, -hh + ly * t, SW, SH);
  ctx.drawImage(sp.cabin, -hw + lx, -hh + ly, SW, SH);
  ctx.restore();
}

// ───────────────────────────── props ─────────────────────────────

function lift(p: { x: number; y: number }, cam: Camera, h: number) {
  return { x: p.x + (p.x - cam.x) * h * LEAN, y: p.y + (p.y - cam.y) * h * LEAN };
}

function corners(p: Prop): { x: number; y: number }[] {
  const c = Math.cos(p.ang), s = Math.sin(p.ang);
  const hw = p.w / 2, hd = p.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: p.x + x * c - y * s, y: p.y + x * s + y * c }));
}

function polygon(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function blobPts(p: Prop, cx: number, cy: number, r: number): { x: number; y: number }[] {
  const pts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + p.t * 6;
    const rr = r * (0.78 + 0.3 * Math.abs(Math.sin(i * 2.3 + p.t * 17)));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

function drawProps(ctx: CanvasRenderingContext2D, race: RaceState, cam: Camera, w: number, h: number) {
  const props = race.track.props;
  if (!props.length) return;
  const reach = (Math.hypot(w, h) / 2) / cam.zoom + 160;
  const r2 = reach * reach;
  const vis: { p: Prop; d: number }[] = [];
  for (const p of props) {
    const dx = p.x - cam.x, dy = p.y - cam.y;
    const d = dx * dx + dy * dy;
    if (d < r2) vis.push({ p, d });
  }
  vis.sort((a, b) => b.d - a.d);

  // shadows first
  for (const { p } of vis) {
    const k = clamp(p.h / 28, 0.3, 2.6);
    const sh = screenToWorld(cam.yaw, 5 * k, 8 * k);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    if (p.k === "box") {
      const pts = corners(p);
      for (const t of [0.4, 0.7, 1]) {
        ctx.globalAlpha = 0.14;
        polygon(ctx, pts.map((q) => ({ x: q.x + sh.x * t, y: q.y + sh.y * t })));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.ellipse(p.x + sh.x, p.y + sh.y, p.r * 1.15, p.r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const { p } of vis) {
    switch (p.k) {
      case "tree": {
        const t0 = lift(p, cam, p.h * 0.5);
        const t1 = lift(p, cam, p.h);
        ctx.strokeStyle = "#3b2a1a";
        ctx.lineWidth = Math.max(2, p.r * 0.28);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t0.x, t0.y); ctx.stroke();
        ctx.fillStyle = p.c1;
        ctx.beginPath(); ctx.arc(t0.x, t0.y, p.r * 1.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.c2;
        ctx.beginPath(); ctx.arc(t1.x, t1.y, p.r * 1.05, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.beginPath(); ctx.arc(t1.x - p.r * 0.3, t1.y - p.r * 0.3, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "pine": {
        const steps = [0.35, 0.6, 0.85];
        steps.forEach((f, i) => {
          const q = lift(p, cam, p.h * f);
          ctx.fillStyle = i === steps.length - 1 ? p.c2 : p.c1;
          ctx.beginPath(); ctx.arc(q.x, q.y, p.r * (1.3 - i * 0.28), 0, Math.PI * 2); ctx.fill();
          if (i === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.beginPath(); ctx.arc(q.x - p.r * 0.3, q.y - p.r * 0.3, p.r * 0.55, 0, Math.PI * 2); ctx.fill();
          }
        });
        break;
      }
      case "cactus": {
        const top = lift(p, cam, p.h);
        const mid = lift(p, cam, p.h * 0.55);
        ctx.lineCap = "round";
        ctx.strokeStyle = p.c1;
        ctx.lineWidth = p.r * 1.7;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.lineWidth = p.r * 0.9;
        ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(mid.x + p.r * 1.8, mid.y - p.r * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(mid.x - p.r * 1.6, mid.y + p.r * 0.2); ctx.stroke();
        ctx.strokeStyle = p.c2;
        ctx.lineWidth = p.r * 0.5;
        ctx.beginPath(); ctx.moveTo(p.x - p.r * 0.3, p.y); ctx.lineTo(top.x - p.r * 0.3, top.y); ctx.stroke();
        ctx.lineCap = "butt";
        break;
      }
      case "rock": {
        for (const f of [0, 0.35, 0.7]) {
          const q = lift(p, cam, p.h * f);
          polygon(ctx, blobPts(p, q.x, q.y, p.r));
          ctx.fillStyle = shade(p.c1, 0.8 + f * 0.4);
          ctx.fill();
        }
        const q = lift(p, cam, p.h);
        polygon(ctx, blobPts(p, q.x, q.y, p.r * 0.86));
        ctx.fillStyle = p.c2;
        ctx.fill();
        break;
      }
      case "lamp": {
        const top = lift(p, cam, p.h);
        ctx.strokeStyle = p.c1;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.fillStyle = p.c2;
        ctx.beginPath(); ctx.arc(top.x, top.y, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.glow ?? "#fff";
        ctx.beginPath(); ctx.arc(top.x, top.y, 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "box": {
        const base = corners(p);
        const roof = base.map((q) => lift(q, cam, p.h));
        const L = screenToWorld(cam.yaw, -0.55, -0.83);
        for (let i = 0; i < 4; i++) {
          const a = base[i], b = base[(i + 1) % 4];
          const ex = b.x - a.x, ey = b.y - a.y;
          const el = Math.hypot(ex, ey) || 1;
          let nx = ey / el, ny = -ex / el;
          const mx = (a.x + b.x) / 2 - p.x, my = (a.y + b.y) / 2 - p.y;
          if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
          if (nx * ((a.x + b.x) / 2 - cam.x) + ny * ((a.y + b.y) / 2 - cam.y) > 0) continue;
          const lit = clamp(nx * L.x + ny * L.y, -1, 1);
          polygon(ctx, [a, b, roof[(i + 1) % 4], roof[i]]);
          ctx.fillStyle = shade(p.c1, 0.55 + 0.3 * (lit + 1) / 2 * 1.4);
          ctx.fill();
          if (p.c2 !== "crowd" && p.c2 !== "#ffffff" && p.h > 40) {
            // lit window strip
            ctx.strokeStyle = p.c2;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1.2;
            for (const f of [0.3, 0.55, 0.8]) {
              const a2 = lift(a, cam, p.h * f), b2 = lift(b, cam, p.h * f);
              ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
        }
        polygon(ctx, roof);
        ctx.fillStyle = shade(p.c1, 1.18);
        ctx.fill();
        if (p.c2 === "crowd") {
          const cx = roof.reduce((a, q) => a + q.x, 0) / 4, cy = roof.reduce((a, q) => a + q.y, 0) / 4;
          const c = Math.cos(p.ang), s = Math.sin(p.ang);
          const cols = ["#d8452c", "#e0b020", "#2c7ad8", "#f0f0f0", "#3aa860"];
          for (let i = 0; i < 46; i++) {
            const u = ((i * 37) % 100) / 100 - 0.5, v = ((i * 61) % 100) / 100 - 0.5;
            const px = cx + (u * (p.w - 12)) * c - (v * (p.d - 8)) * s;
            const py = cy + (u * (p.w - 12)) * s + (v * (p.d - 8)) * c;
            ctx.fillStyle = cols[i % cols.length];
            ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
          }
        } else if (p.c2 === "#ffffff") {
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.lineWidth = 0.8;
          const c = Math.cos(p.ang), s = Math.sin(p.ang);
          const cx = roof.reduce((a, q) => a + q.x, 0) / 4, cy = roof.reduce((a, q) => a + q.y, 0) / 4;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 8 * c + p.d * 0.5 * s, cy + i * 8 * s - p.d * 0.5 * c);
            ctx.lineTo(cx + i * 8 * c - p.d * 0.5 * s, cy + i * 8 * s + p.d * 0.5 * c);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = p.c2;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 1.6;
          polygon(ctx, roof);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          const r0 = roof[0], r2 = roof[2];
          ctx.fillRect(Math.min(r0.x, r2.x) + 4, Math.min(r0.y, r2.y) + 4, 8, 6);
        }
        break;
      }
    }
  }
}

// ───────────────────────────── world ─────────────────────────────

export function renderWorld(
  ctx: CanvasRenderingContext2D, race: RaceState, cam: Camera, w: number, h: number,
) {
  ctx.fillStyle = "#07101c";
  ctx.fillRect(0, 0, w, h);
  const enter = () => {
    ctx.save();
    ctx.translate(w / 2 + cam.shakeX, h / 2 + cam.shakeY);
    ctx.rotate(cam.yaw);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  };
  enter();
  const t = race.track;
  const R = Math.hypot(w, h) / cam.zoom;
  ctx.fillStyle = themeGround(t.def.theme);
  ctx.fillRect(cam.x - R, cam.y - R, R * 2, R * 2);
  if (t.canvas) ctx.drawImage(t.canvas, t.originX, t.originY, t.worldW, t.worldH);

  ctx.lineCap = "round";
  for (const s of race.skids) {
    ctx.strokeStyle = `rgba(14,12,10,${s.a})`;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }
  for (const p of race.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // far cars first so nearer ones overlap them
  const cars = [...race.cars].sort(
    (a, b) => Math.hypot(b.x - cam.x, b.y - cam.y) - Math.hypot(a.x - cam.x, a.y - cam.y),
  );
  for (const car of cars) drawCar(ctx, car, cam);
  drawProps(ctx, race, cam, w, h);
  ctx.restore();

  if (themeIsDark(t.def.theme)) {
    ctx.fillStyle = "rgba(3,7,22,0.44)";
    ctx.fillRect(0, 0, w, h);
    enter();
    ctx.globalCompositeOperation = "lighter";
    for (const car of race.cars) {
      const fx = -Math.sin(car.heading), fy = -Math.cos(car.heading);
      const nx = car.x + fx * 26, ny = car.y + fy * 26;
      const g = ctx.createRadialGradient(nx + fx * 50, ny + fy * 50, 2, nx + fx * 50, ny + fy * 50, 95);
      g.addColorStop(0, "rgba(255,246,222,0.2)");
      g.addColorStop(1, "rgba(255,246,222,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(nx + fx * 50, ny + fy * 50, 95, 0, Math.PI * 2);
      ctx.fill();
    }
    const reach = (Math.hypot(w, h) / 2) / cam.zoom + 160;
    for (const p of t.props) {
      if (p.k !== "lamp") continue;
      if (Math.hypot(p.x - cam.x, p.y - cam.y) > reach) continue;
      const q = lift(p, cam, p.h);
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 110);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(0.15, p.glow ?? "#fff");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q.x, q.y, 110, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ───────────────────────────── HUD ─────────────────────────────

function ord(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = "#e82127") {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(22,26,34,0.86)");
  g.addColorStop(1, "rgba(8,10,14,0.86)");
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, y + 8, 3, h - 16);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  ctx.stroke();
}

export function renderHud(
  ctx: CanvasRenderingContext2D, race: RaceState, w: number, h: number, bestLap: number | undefined,
) {
  const p = race.player;
  const kph = Math.round(Math.hypot(p.vx, p.vy) * 0.85);
  ctx.save();
  ctx.textBaseline = "top";

  panel(ctx, 14, 14, 156, 84);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px Rajdhani, sans-serif";
  ctx.fillText(ord(p.place), 28, 16);
  ctx.fillStyle = "#8a96a8";
  ctx.font = "600 15px Rajdhani, sans-serif";
  ctx.fillText(`OF ${race.cars.length}`, 98, 36);
  ctx.font = "400 14px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#c9d2de";
  ctx.fillText(`LAP ${Math.min(p.lap + 1, race.laps)}/${race.laps}`, 28, 66);

  panel(ctx, w - 190, 14, 176, 84);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Rajdhani, sans-serif";
  ctx.fillText(String(kph), w - 70, 12);
  ctx.fillStyle = "#8a96a8";
  ctx.font = "600 14px Rajdhani, sans-serif";
  ctx.fillText("KPH", w - 28, 30);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(w - 176, 52, 148, 4);
  ctx.fillStyle = kph > 240 ? "#e82127" : "#3aa0e0";
  ctx.fillRect(w - 176, 52, 148 * clamp(kph / 300, 0, 1), 4);
  ctx.font = "400 13px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#e8ecf2";
  ctx.fillText(formatTime(p.lapTime), w - 28, 62);
  ctx.fillStyle = "#8a96a8";
  ctx.fillText(`BEST ${formatTime(p.bestLap || bestLap || 0)}`, w - 28, 79);
  ctx.textAlign = "left";

  if (p.boostCharge > 0.05 || p.boost > 0) {
    const bw = 170;
    const x = (w - bw) / 2;
    const y = 70;
    ctx.fillStyle = "rgba(8,10,14,0.75)";
    roundRect(ctx, x - 2, y - 2, bw + 4, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.boost > 0 ? "#7fd0ff" : "#3aa0e0";
    ctx.fillRect(x, y, bw * Math.min(1, p.boost > 0 ? p.boost / 1.2 : p.boostCharge / 1.4), 6);
  }

  if (p.wrongWay && race.go) {
    ctx.textAlign = "center";
    ctx.font = "700 36px Rajdhani, sans-serif";
    ctx.fillStyle = "#e82127";
    ctx.fillText("WRONG WAY", w / 2, 96);
    ctx.textAlign = "left";
  }

  if (!race.go && race.countdown > 0) {
    const on = Math.min(3, 4 - Math.ceil(race.countdown));
    const x0 = w / 2 - 66;
    ctx.fillStyle = "rgba(8,10,14,0.8)";
    roundRect(ctx, x0 - 10, h * 0.2, 152, 54, 10);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < on ? "#ff2a2a" : "#2a1212";
      if (i < on) { ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 14; }
      ctx.beginPath();
      ctx.arc(x0 + i * 44 + 22, h * 0.2 + 27, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else if (race.go && race.clock < 1) {
    ctx.fillStyle = "#3ddc84";
    ctx.font = "700 76px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText("GO!", w / 2, h * 0.2);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }

  drawMinimap(ctx, race, 14, 106);
  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, race: RaceState, x: number, y: number) {
  const mw = 140;
  const mh = 96;
  panel(ctx, x, y, mw, mh, "#3aa0e0");
  const t = race.track;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of t.samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  const sc = Math.min((mw - 26) / (maxX - minX), (mh - 20) / (maxY - minY));
  const ox = x + mw / 2 + 3 - ((minX + maxX) / 2) * sc;
  const oy = y + mh / 2 - ((minY + maxY) / 2) * sc;
  ctx.lineJoin = "round";
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(t.samples[0].x * sc + ox, t.samples[0].y * sc + oy);
    for (const s of t.samples) ctx.lineTo(s.x * sc + ox, s.y * sc + oy);
    ctx.closePath();
  };
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 5;
  trace(); ctx.stroke();
  ctx.strokeStyle = "#aab4c2";
  ctx.lineWidth = 2.5;
  trace(); ctx.stroke();
  const st = t.samples[0];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(st.x * sc + ox - 2, st.y * sc + oy - 2, 4, 4);
  for (const car of race.cars) {
    const cx = car.x * sc + ox, cy = car.y * sc + oy;
    ctx.beginPath();
    ctx.arc(cx, cy, car.isPlayer ? 4.2 : 3.2, 0, Math.PI * 2);
    ctx.fillStyle = car.isPlayer ? "#ffffff" : car.def.color;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = car.isPlayer ? "#e82127" : "rgba(255,255,255,0.8)";
    ctx.stroke();
  }
}

export function renderAttractScrim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(7,16,28,0.30)";
  ctx.fillRect(0, 0, w, h);
}
