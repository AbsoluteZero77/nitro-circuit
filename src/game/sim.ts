import { CARS, locate, type CarDef, type Track } from "./tracks.ts";
import { angleDelta, angleWrap, clamp, wrapLoop } from "./math.ts";
import type { Actions } from "./input.ts";

export const CAR_RADIUS = 16;

export type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string;
  /** Size growth per second (smoke puffs expand). */
  grow: number;
};
export type Skid = { x0: number; y0: number; x1: number; y1: number; a: number };

export type Car = {
  x: number; y: number;
  heading: number; // forward = (-sin h, -cos h); +steer turns left
  vx: number; vy: number;
  def: CarDef;
  isPlayer: boolean;
  name: string;
  throttle: number; steer: number; brake: number; handbrake: boolean;
  boost: number; boostCharge: number;
  lap: number; // completed laps
  lapTime: number; bestLap: number; raceTime: number;
  finished: boolean; finishTime: number;
  place: number;
  idx: number; // nearest centre-line segment
  sPrev: number;
  trackPos: number; // continuous distance from the start line (negative on the grid)
  maxPos: number;
  dist: number; // distance from centre line
  lat: number; // signed offset from centre line
  wrongWay: boolean;
  radius: number;
  // AI
  lane: number; skill: number; stuckT: number; reverseT: number;
  lastSkidX: number; lastSkidY: number;
};

export type RaceState = {
  track: Track;
  cars: Car[];
  player: Car;
  hasPlayer: boolean;
  particles: Particle[];
  skids: Skid[];
  countdown: number;
  go: boolean;
  finished: boolean;
  clock: number;
  laps: number;
  trauma: number;
  finishCount: number;
  playerFinishedAt: number;
};

export const AI_NAMES = ["AGNUS", "PAULA", "DENISE", "GARY", "LISA"];
const AI_SKILL = [0.93, 0.96, 0.99, 0.91, 0.95];
const AI_LANE = [-0.3, 0.35, -0.05, 0.22, -0.18];
export const GRID_SIZE = 6;

export function headingFromTangent(tx: number, ty: number): number {
  return Math.atan2(-tx, -ty);
}

export function spawnRace(track: Track, playerCarIndex: number, attract: boolean): RaceState {
  const S = track.samples;
  const N = S.length;
  const others = CARS.map((_, i) => i).filter((i) => i !== playerCarIndex);
  // Grid slots: [distance behind line, side]. The player's car takes the 3rd slot.
  const slots: [number, number][] = [[45, -26], [45, 26], [115, -26], [115, 26], [185, -26], [185, 26]];
  const playerSlot = 3;
  const cars: Car[] = [];
  let aiNo = 0;
  let otherNo = 0;
  for (let slot = 0; slot < GRID_SIZE; slot++) {
    const isPlayer = !attract && slot === playerSlot;
    const defIdx = slot === playerSlot ? playerCarIndex : others[otherNo++];
    const [dd, side] = slots[slot];
    const idx = (N - Math.round(dd / track.spacing) + N) % N;
    const s = S[idx];
    const x = s.x + s.nx * side;
    const y = s.y + s.ny * side;
    const loc = locate(track, x, y);
    const n = isPlayer ? 0 : aiNo++;
    cars.push({
      x, y,
      heading: headingFromTangent(s.tx, s.ty),
      vx: 0, vy: 0,
      def: CARS[defIdx],
      isPlayer,
      name: isPlayer ? "YOU" : AI_NAMES[n % AI_NAMES.length],
      throttle: 0, steer: 0, brake: 0, handbrake: false,
      boost: 0, boostCharge: 0,
      lap: 0, lapTime: 0, bestLap: 0, raceTime: 0,
      finished: false, finishTime: 0,
      place: slot + 1,
      idx: loc.i, sPrev: loc.s,
      trackPos: loc.s > track.length / 2 ? loc.s - track.length : loc.s,
      maxPos: -Infinity,
      dist: loc.d, lat: loc.lat,
      wrongWay: false,
      radius: CAR_RADIUS,
      lane: AI_LANE[n % AI_LANE.length], skill: AI_SKILL[n % AI_SKILL.length], stuckT: 0, reverseT: 0,
      lastSkidX: x, lastSkidY: y,
    });
  }
  for (const c of cars) c.maxPos = c.trackPos;
  const player = cars.find((c) => c.isPlayer) ?? cars[0];
  return {
    track, cars, player, hasPlayer: !attract,
    particles: [], skids: [],
    countdown: attract ? 0 : 3.1,
    go: attract,
    finished: false, clock: 0,
    laps: attract ? 9999 : track.def.laps,
    trauma: 0, finishCount: 0, playerFinishedAt: 0,
  };
}

function emit(
  race: RaceState, x: number, y: number, vx: number, vy: number, color: string, n = 6,
  size = 2, grow = 0, life = 0.65,
) {
  for (let i = 0; i < n; i++) {
    const l = life * (0.5 + Math.random() * 0.5);
    race.particles.push({
      x, y, vx: vx + (Math.random() - 0.5) * 70, vy: vy + (Math.random() - 0.5) * 70,
      life: l, max: l, size: size * (0.7 + Math.random() * 0.6), color, grow,
    });
    if (race.particles.length > 260) race.particles.shift();
  }
}

// ───────────────────────────── physics ─────────────────────────────

function carLimits(def: CarDef) {
  return { maxSpeed: 310 * def.top, accel: 265 * def.accel, brakePow: 340,
    gripBase: 11.5 * def.grip, turnRate: 2.55 * def.turn };
}

function stepCar(race: RaceState, car: Car, dt: number) {
  const track = race.track;
  const { maxSpeed, accel, brakePow, gripBase, turnRate } = carLimits(car.def);

  if (car.finished) {
    car.throttle = 0;
    car.brake = 0.5;
    car.handbrake = false;
  }

  const fx = -Math.sin(car.heading);
  const fy = -Math.cos(car.heading);
  const rx = -fy;
  const ry = fx;
  let spdF = car.vx * fx + car.vy * fy;
  let spdL = car.vx * rx + car.vy * ry;

  const onRoad = car.dist < track.def.roadHalf - 2;
  const onSand = !onRoad && car.dist < track.def.roadHalf + track.def.runoff * 0.6;
  const surfaceGrip = onRoad ? 1 : onSand ? 0.5 : 0.32;
  const surfaceDrag = onRoad ? 0.42 : onSand ? 1.5 : 2.2;

  if (car.boost > 0) {
    car.boost -= dt;
    spdF += 420 * dt;
  }
  if (car.throttle > 0) spdF += accel * car.throttle * dt;
  if (car.brake > 0) {
    if (spdF > 8) spdF -= brakePow * car.brake * dt;
    else spdF -= accel * 0.45 * car.brake * dt;
  }

  const reverse = spdF >= 0 ? 1 : -1;
  const speedAbs = Math.abs(spdF);
  const speedFactor = clamp(speedAbs / 70, 0, 1) * (1 - 0.38 * clamp(speedAbs / maxSpeed, 0, 1));
  const turnMul = 0.18 + 0.82 * speedFactor;
  car.heading = angleWrap(car.heading + car.steer * turnRate * turnMul * reverse * dt);

  const hb = car.handbrake && speedAbs > 40;
  const grip = gripBase * surfaceGrip * (hb ? 0.22 : 1);
  spdL *= Math.exp(-grip * dt);
  spdF *= Math.exp(-(surfaceDrag + (car.throttle < 0.15 ? 0.55 : 0) + (hb ? 0.8 : 0)) * dt);
  spdF = clamp(spdF, -maxSpeed * 0.38, maxSpeed + (car.boost > 0 ? 70 : 0));

  const slip = Math.abs(spdL);
  if (hb && slip > 18 && speedAbs > 90) {
    car.boostCharge = Math.min(1.4, car.boostCharge + dt * 0.85);
  } else if (!car.handbrake && car.boostCharge > 0.35) {
    car.boost = Math.max(car.boost, 0.35 + car.boostCharge * 0.7);
    car.boostCharge = 0;
  } else {
    car.boostCharge = Math.max(0, car.boostCharge - dt * 0.5);
  }

  const nfx = -Math.sin(car.heading);
  const nfy = -Math.cos(car.heading);
  car.vx = nfx * spdF + -nfy * spdL;
  car.vy = nfy * spdF + nfx * spdL;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Boundary: a distance field around the centre line (no folding walls on tight corners).
  let loc = locate(track, car.x, car.y, car.idx);
  const lim = track.wallR - car.radius;
  if (loc.d > lim) {
    const ox = (car.x - loc.px) / loc.d;
    const oy = (car.y - loc.py) / loc.d;
    car.x = loc.px + ox * lim;
    car.y = loc.py + oy * lim;
    const vn = car.vx * ox + car.vy * oy;
    if (vn > 0) {
      car.vx -= ox * vn * 1.35;
      car.vy -= oy * vn * 1.35;
      if (car.isPlayer && vn > 80) {
        race.trauma = Math.min(1, race.trauma + 0.35);
        emit(race, car.x, car.y, -ox * 40, -oy * 40, "#ffd070", 8, 1.6, 0, 0.35);
      }
    }
    // scraping the barrier scrubs speed
    car.vx *= 1 - 1.2 * dt;
    car.vy *= 1 - 1.2 * dt;
    loc = locate(track, car.x, car.y, car.idx);
  }

  // Progress along the track (continuous, so laps can't be skipped or double counted).
  car.idx = loc.i;
  car.dist = loc.d;
  car.lat = loc.lat;
  car.trackPos += wrapLoop(loc.s - car.sPrev, track.length);
  car.sPrev = loc.s;
  if (car.trackPos > car.maxPos) car.maxPos = car.trackPos;

  const lapsDone = Math.max(0, Math.floor(car.maxPos / track.length));
  if (lapsDone > car.lap && !car.finished) {
    car.lap = lapsDone;
    if (car.bestLap <= 0 || car.lapTime < car.bestLap) car.bestLap = car.lapTime;
    car.lapTime = 0;
    if (car.lap >= race.laps) {
      car.finished = true;
      car.finishTime = car.raceTime;
      car.place = ++race.finishCount;
      if (car.isPlayer) race.playerFinishedAt = race.clock;
    }
  }

  const tan = track.samples[car.idx];
  car.wrongWay = nfx * tan.tx + nfy * tan.ty < -0.25 && Math.abs(spdF) > 40;

  // Skid marks & dust
  if ((hb || slip > 28) && Math.abs(spdF) > 50) {
    const dx = car.x - car.lastSkidX;
    const dy = car.y - car.lastSkidY;
    if (dx * dx + dy * dy > 64) {
      race.skids.push({ x0: car.lastSkidX, y0: car.lastSkidY, x1: car.x, y1: car.y, a: 0.45 });
      if (race.skids.length > 420) race.skids.shift();
      car.lastSkidX = car.x;
      car.lastSkidY = car.y;
      emit(race, car.x - nfx * 18, car.y - nfy * 18, -nfx * 10, -nfy * 10, "rgba(235,235,240,0.55)", 1, 6, 16, 0.9);
    }
  } else {
    car.lastSkidX = car.x;
    car.lastSkidY = car.y;
  }
  if (!onRoad && Math.abs(spdF) > 40) {
    emit(race, car.x, car.y, -car.vx * 0.05, -car.vy * 0.05, onSand ? "rgba(196,160,90,0.5)" : "rgba(60,110,50,0.5)", 1, 4, 10, 0.6);
  }
}

// ─────────────────────────────── AI ───────────────────────────────

/** Speed the AI is willing to carry given the road ahead (kinematic corner limit + braking distance). */
export function aiTargetSpeed(track: Track, car: Car, vMax: number): number {
  const N = track.samples.length;
  const step = 3;
  const ahead = Math.min(N / 2, Math.ceil(700 / track.spacing));
  const decel = 250;
  let target = vMax;
  for (let k = 0; k <= ahead; k += step) {
    const j = (car.idx + k) % N;
    const vLim = Math.max(95, 1.65 * track.radius[j]);
    const dist = k * track.spacing;
    target = Math.min(target, Math.sqrt(vLim * vLim + 2 * decel * dist));
  }
  return Math.max(target, 80);
}

function driveAI(race: RaceState, car: Car, dt: number) {
  const track = race.track;
  const S = track.samples;
  const N = S.length;
  const { maxSpeed } = carLimits(car.def);
  const fx = -Math.sin(car.heading);
  const fy = -Math.cos(car.heading);
  const spdF = car.vx * fx + car.vy * fy;
  const spd = Math.hypot(car.vx, car.vy);

  // Light rubber-banding against the human player.
  let skill = car.skill;
  if (race.hasPlayer && !race.player.finished) {
    const gap = race.player.trackPos - car.trackPos;
    skill *= clamp(1 + gap / 9000, 0.94, 1.06);
  }

  // Steering: pure pursuit toward a point ahead on the road, offset to this car's lane.
  const look = clamp(40 + spd * 0.32, 55, 180);
  const k = Math.max(2, Math.round(look / track.spacing));
  const tp = S[(car.idx + k) % N];
  let lane = car.lane * track.def.roadHalf * 0.5;
  // Move over for a slower car directly ahead.
  for (const o of race.cars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const fwd = dx * fx + dy * fy;
    if (fwd > 8 && fwd < 120 && Math.abs(o.lat - car.lat) < 36) {
      lane = clamp(car.lat + (car.lat >= o.lat ? 1 : -1) * 46, -track.def.roadHalf + 26, track.def.roadHalf - 26);
      break;
    }
  }
  const tx = tp.x + tp.nx * lane - car.x;
  const ty = tp.y + tp.ny * lane - car.y;
  const want = Math.atan2(-tx, -ty);
  const err = angleDelta(car.heading, want);

  // Recover when wedged against something.
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    car.throttle = 0;
    car.brake = 1;
    car.handbrake = false;
    car.steer = clamp(-err * 2.4, -1, 1);
    return;
  }
  if (race.go && !car.finished && Math.abs(spdF) < 14) car.stuckT += dt;
  else car.stuckT = Math.max(0, car.stuckT - dt * 2);
  if (car.stuckT > 1.2) {
    car.stuckT = 0;
    car.reverseT = 1.0;
  }

  car.steer = clamp(err * 2.4, -1, 1);
  car.handbrake = false;
  const target = aiTargetSpeed(track, car, maxSpeed * skill);
  if (spdF < target - 4) {
    car.throttle = clamp((target - spdF) / 40, 0.35, 1);
    car.brake = 0;
  } else if (spdF > target + 6) {
    car.throttle = 0;
    car.brake = clamp((spdF - target) / 50, 0.15, 1);
  } else {
    car.throttle = 0.25;
    car.brake = 0;
  }
}

export function applyPlayerInput(car: Car, a: Actions, dt: number) {
  car.throttle = a.throttle;
  car.brake = a.brake;
  car.handbrake = a.handbrake;
  // Smooth the steering so digital keys/buttons don't snap the wheel.
  const target = a.steer;
  const rate = Math.abs(target) > Math.abs(car.steer) && Math.sign(target) === Math.sign(car.steer || target) ? 6 : 10;
  const diff = target - car.steer;
  car.steer += clamp(diff, -rate * dt, rate * dt);
}

// ─────────────────────────────── cars vs cars ───────────────────────────────

function resolveCars(race: RaceState) {
  const list = race.cars;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = a.radius + b.radius;
      if (d2 > min * min || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = min - d;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const imp = vn * 0.55;
        a.vx += nx * imp; a.vy += ny * imp;
        b.vx -= nx * imp; b.vy -= ny * imp;
        if (a.isPlayer || b.isPlayer) race.trauma = Math.min(1, race.trauma + 0.18);
      }
    }
  }
}

// ─────────────────────────────── main step ───────────────────────────────

export function stepRace(race: RaceState, dt: number, playerActions: Actions | null) {
  if (race.countdown > 0) {
    race.countdown -= dt;
    if (race.countdown <= 0) {
      race.countdown = 0;
      race.go = true;
    }
  }
  if (race.go && !race.finished) race.clock += dt;

  if (race.go) {
    if (playerActions && race.player.isPlayer && !race.player.finished) {
      applyPlayerInput(race.player, playerActions, dt);
    }
    for (const car of race.cars) {
      if (!car.isPlayer) driveAI(race, car, dt);
      if (!car.finished) {
        car.lapTime += dt;
        car.raceTime += dt;
      }
      stepCar(race, car, dt);
    }
    resolveCars(race);
  } else if (playerActions && race.player.isPlayer) {
    // Grid: let the player rev (throttle only), nobody moves.
    race.player.throttle = playerActions.throttle;
  }

  const order = [...race.cars].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.place - b.place;
    return b.trackPos - a.trackPos;
  });
  order.forEach((c, i) => {
    if (!c.finished) c.place = i + 1;
  });

  if (race.hasPlayer && race.player.finished && !race.finished) {
    const allDone = race.cars.every((c) => c.finished);
    if (allDone || race.clock > race.playerFinishedAt + 15) race.finished = true;
  }

  for (const p of race.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size += p.grow * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  race.particles = race.particles.filter((p) => p.life > 0);
  for (const s of race.skids) s.a -= dt * 0.12;
  race.skids = race.skids.filter((s) => s.a > 0.04);
  race.trauma = Math.max(0, race.trauma - dt * 1.6);
}
