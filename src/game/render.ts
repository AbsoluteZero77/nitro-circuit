import { formatTime } from "./math.ts";
import type { Car, RaceState } from "./sim.ts";

export type Camera = { x: number; y: number; yaw: number; zoom: number; shakeX: number; shakeY: number };

export function createCamera(): Camera {
  return { x: 0, y: 0, yaw: 0, zoom: 1, shakeX: 0, shakeY: 0 };
}

export function updateCamera(cam: Camera, car: Car, dt: number, speed: number) {
  const fx = -Math.sin(car.heading);
  const fy = -Math.cos(car.heading);
  const look = 48 + speed * 0.18;
  const k = 1 - Math.exp(-9 * dt);
  cam.x += (car.x + fx * look - cam.x) * k;
  cam.y += (car.y + fy * look - cam.y) * k;
  cam.yaw += Math.atan2(Math.sin(car.heading - cam.yaw), Math.cos(car.heading - cam.yaw)) * (1 - Math.exp(-10 * dt));
  const zTarget = 1.08 - Math.min(0.32, speed / 980);
  cam.zoom += (zTarget - cam.zoom) * (1 - Math.exp(-3 * dt));
}

export function snapCamera(cam: Camera, car: Car) {
  cam.x = car.x;
  cam.y = car.y;
  cam.yaw = car.heading;
  cam.zoom = 1;
}

const CAR_W = 36;
const CAR_H = 54;

function drawCar(ctx: CanvasRenderingContext2D, car: Car, img: HTMLImageElement | undefined) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(-car.heading);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(2, 4, 13, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
  } else {
    ctx.fillStyle = car.def.color;
    ctx.fillRect(-12, -24, 24, 48);
    ctx.fillStyle = "#111820";
    ctx.fillRect(-9, -14, 18, 12);
  }
  if (car.boost > 0) {
    ctx.fillStyle = "rgba(224,122,26,0.75)";
    ctx.beginPath();
    ctx.moveTo(-6, CAR_H / 2 - 2);
    ctx.lineTo(0, CAR_H / 2 + 12 + Math.random() * 8);
    ctx.lineTo(6, CAR_H / 2 - 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderWorld(
  ctx: CanvasRenderingContext2D, race: RaceState, cam: Camera,
  images: Map<string, HTMLImageElement>, w: number, h: number,
) {
  ctx.fillStyle = "#07101c";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + cam.shakeX, h / 2 + cam.shakeY);
  ctx.rotate(cam.yaw);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  const t = race.track;
  if (t.canvas) ctx.drawImage(t.canvas, t.originX, t.originY, t.worldW, t.worldH);

  ctx.lineCap = "round";
  for (const s of race.skids) {
    ctx.strokeStyle = `rgba(20,16,12,${s.a})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }
  for (const p of race.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const car of race.cars) drawCar(ctx, car, images.get(car.def.src));
  ctx.restore();
}

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

export function renderHud(
  ctx: CanvasRenderingContext2D, race: RaceState, w: number, h: number, bestLap: number | undefined,
) {
  const p = race.player;
  ctx.save();
  ctx.textBaseline = "top";

  // position + lap
  ctx.fillStyle = "rgba(7,16,28,0.72)";
  roundRect(ctx, 16, 16, 150, 82, 8);
  ctx.fill();
  ctx.fillStyle = "#e07a1a";
  ctx.font = "700 40px Rajdhani, sans-serif";
  ctx.fillText(ord(p.place), 28, 20);
  ctx.fillStyle = "#8a9bb0";
  ctx.font = "400 14px 'Share Tech Mono', monospace";
  ctx.fillText(`LAP ${Math.min(p.lap + 1, race.laps)}/${race.laps}`, 28, 66);

  // times + speed
  ctx.fillStyle = "rgba(7,16,28,0.72)";
  roundRect(ctx, w - 186, 16, 170, 82, 8);
  ctx.fill();
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8e4d8";
  ctx.font = "400 18px 'Share Tech Mono', monospace";
  ctx.fillText(formatTime(p.lapTime), w - 28, 24);
  ctx.fillStyle = "#8a9bb0";
  ctx.font = "400 13px 'Share Tech Mono', monospace";
  ctx.fillText(`BEST ${formatTime(p.bestLap || bestLap || 0)}`, w - 28, 48);
  ctx.fillStyle = "#3aa0c8";
  ctx.font = "700 20px 'Share Tech Mono', monospace";
  ctx.fillText(`${Math.round(Math.hypot(p.vx, p.vy) * 0.85)} KPH`, w - 28, 68);
  ctx.textAlign = "left";

  // drift boost bar
  if (p.boostCharge > 0.05 || p.boost > 0) {
    const bw = 160;
    const x = (w - bw) / 2;
    const y = 64;
    ctx.fillStyle = "rgba(7,16,28,0.7)";
    ctx.fillRect(x, y, bw, 8);
    ctx.fillStyle = p.boost > 0 ? "#e07a1a" : "#3aa0c8";
    ctx.fillRect(x, y, bw * Math.min(1, p.boost > 0 ? p.boost / 1.2 : p.boostCharge / 1.4), 8);
  }

  if (p.wrongWay && race.go) {
    ctx.textAlign = "center";
    ctx.font = "700 36px Rajdhani, sans-serif";
    ctx.fillStyle = "#c43028";
    ctx.fillText("WRONG WAY", w / 2, 90);
    ctx.textAlign = "left";
  }

  // start lights / GO
  if (!race.go && race.countdown > 0) {
    const on = Math.min(3, 4 - Math.ceil(race.countdown));
    const x0 = w / 2 - 54;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < on ? "#c43028" : "#2a1010";
      ctx.beginPath();
      ctx.arc(x0 + i * 36 + 18, h * 0.26, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (race.go && race.clock < 1) {
    ctx.fillStyle = "#3d9a4a";
    ctx.font = "700 72px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GO!", w / 2, h * 0.22);
    ctx.textAlign = "left";
  }

  drawMinimap(ctx, race, 16, 108);
  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, race: RaceState, x: number, y: number) {
  const mw = 130;
  const mh = 90;
  ctx.fillStyle = "rgba(7,16,28,0.72)";
  roundRect(ctx, x, y, mw, mh, 8);
  ctx.fill();
  const t = race.track;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of t.samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
  }
  const sc = Math.min((mw - 16) / (maxX - minX), (mh - 16) / (maxY - minY));
  const ox = x + mw / 2 - ((minX + maxX) / 2) * sc;
  const oy = y + mh / 2 - ((minY + maxY) / 2) * sc;
  ctx.strokeStyle = "#8a9bb0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(t.samples[0].x * sc + ox, t.samples[0].y * sc + oy);
  for (const s of t.samples) ctx.lineTo(s.x * sc + ox, s.y * sc + oy);
  ctx.closePath();
  ctx.stroke();
  for (const car of race.cars) {
    ctx.fillStyle = car.isPlayer ? "#e07a1a" : car.def.color;
    ctx.beginPath();
    ctx.arc(car.x * sc + ox, car.y * sc + oy, car.isPlayer ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderAttractScrim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(7,16,28,0.28)";
  ctx.fillRect(0, 0, w, h);
}
