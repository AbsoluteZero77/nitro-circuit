import test from "node:test";
import assert from "node:assert/strict";
import { TRACKS, buildTrack, CARS } from "../src/game/tracks.ts";
import { spawnRace, stepRace } from "../src/game/sim.ts";

const DT = 1 / 60;

for (const def of TRACKS) {
  test(`${def.id}: AI field completes the race, laps counted, positions sane`, () => {
    const track = buildTrack(def);
    const race = spawnRace(track, 0, false);
    // Player slot is driven by the same logic as the AI would be: use a scripted bot.
    const bot = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    let t = 0;
    const offRoad: Record<string, number> = {};
    const recoveries: Record<string, number> = {};
    const wasRev: Record<string, boolean> = {};
    let frames = 0;
    while (!race.finished && t < 60 * 5) {
      // simple pure-pursuit bot for the player's car
      const p = race.player;
      const S = track.samples;
      const tp = S[(p.idx + 14) % S.length];
      const want = Math.atan2(-(tp.x - p.x), -(tp.y - p.y));
      let err = want - p.heading;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      bot.steer = Math.max(-1, Math.min(1, err * 2.2));
      const spd = Math.hypot(p.vx, p.vy);
      const lim = Math.max(90, 1.5 * track.radius[(p.idx + 8) % S.length]);
      bot.throttle = spd < lim ? 1 : 0;
      bot.brake = spd > lim * 1.1 ? 0.7 : 0;
      stepRace(race, DT, bot);
      t += DT;
      frames++;
      for (const c of race.cars) {
        offRoad[c.name] = (offRoad[c.name] ?? 0) + (c.dist > def.roadHalf ? 1 : 0);
        recoveries[c.name] = recoveries[c.name] ?? 0;
        if (c.reverseT > 0 && !wasRev[c.name]) recoveries[c.name]++;
        wasRev[c.name] = c.reverseT > 0;
      }
    }
    const summary = race.cars
      .map((c) => `${c.name}(${c.def.id}) L${c.lap} fin=${c.finished} ${c.finishTime.toFixed(1)}s best=${c.bestLap.toFixed(1)}`)
      .join(" | ");
    console.log(def.id, `t=${t.toFixed(0)}s`, summary, JSON.stringify(Object.fromEntries(Object.entries(offRoad).map(([k, v]) => [k, +(100 * v / frames).toFixed(1)]))), JSON.stringify(recoveries));
    for (const c of race.cars.filter((c) => !c.isPlayer)) {
      assert.ok(c.lap >= def.laps - 1, `${c.name} should be racing on ${def.id} (lap ${c.lap}, pos ${c.trackPos.toFixed(0)})`);
      assert.ok(c.bestLap > 8 && c.bestLap < 90, `${c.name} lap time sane: ${c.bestLap}`);
      assert.ok(offRoad[c.name] / frames < 0.12, `${c.name} off-road ${(100 * offRoad[c.name] / frames).toFixed(1)}% of the time`);
      assert.ok(recoveries[c.name] <= 2, `${c.name} needed ${recoveries[c.name]} reverse recoveries`);
    }
    assert.equal(race.player.lap, def.laps, "player lap count");
    const places = race.cars.map((c) => c.place).sort();
    assert.deepEqual(places, [1, 2, 3, 4, 5, 6], "unique places");
  });
}

test("cars stay motionless until GO", () => {
  const race = spawnRace(buildTrack(TRACKS[0]), 1, false);
  const before = race.cars.map((c) => [c.x, c.y]);
  for (let i = 0; i < 120; i++) stepRace(race, DT, { throttle: 1, brake: 0, steer: 0, handbrake: false });
  race.cars.forEach((c, i) => {
    assert.equal(c.x, before[i][0]);
    assert.equal(c.y, before[i][1]);
  });
  assert.equal(race.go, false);
});

test("start grid sits behind the line and every car faces along the track", () => {
  for (const def of TRACKS) {
    const track = buildTrack(def);
    const race = spawnRace(track, 2, false);
    for (const c of race.cars) {
      assert.ok(c.trackPos < 0 && c.trackPos > -260, `grid pos ${c.trackPos}`);
      const s = track.samples[c.idx];
      const dot = -Math.sin(c.heading) * s.tx + -Math.cos(c.heading) * s.ty;
      assert.ok(dot > 0.99, "facing forward");
      assert.ok(c.dist < def.roadHalf, "on the road");
    }
    assert.equal(race.player.def.id, CARS[2].id);
    assert.equal(new Set(race.cars.map((c) => c.def.id)).size, 6, "six distinct cars");
  }
});

test("track geometry: corners wider than the road, sections don't touch", () => {
  for (const def of TRACKS) {
    const t = buildTrack(def);
    const minR = Math.min(...t.radius);
    assert.ok(minR > def.roadHalf * 1.1, `${def.id} min radius ${minR.toFixed(0)}`);
    // Far-apart sections must not touch each other.
    let minD = Infinity;
    const S = t.samples;
    for (let i = 0; i < S.length; i += 2) {
      for (let j = i + 1; j < S.length; j += 2) {
        const arc = Math.min(Math.abs(S[j].s - S[i].s), t.length - Math.abs(S[j].s - S[i].s));
        if (arc < 500) continue;
        minD = Math.min(minD, Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y));
      }
    }
    assert.ok(minD > def.roadHalf * 2 + 40, `${def.id} sections ${minD.toFixed(0)} apart`);
  }
});

test("attract mode never ends the race", () => {
  const race = spawnRace(buildTrack(TRACKS[1]), 0, true);
  for (let i = 0; i < 60 * 150; i++) stepRace(race, DT, null);
  assert.equal(race.finished, false);
  assert.ok(race.cars.every((c) => !c.finished));
  assert.ok(Math.max(...race.cars.map((c) => c.lap)) >= 1, "AI laps in attract");
});
