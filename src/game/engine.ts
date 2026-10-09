import { Input } from "./input.ts";
import { GameAudio } from "./audio.ts";
import { loadSave, recordTimes, writeSave, type SaveData } from "./save.ts";
import { TRACKS, bakeTrack, type Track } from "./tracks.ts";
import { spawnRace, stepRace, type RaceState } from "./sim.ts";
import {
  createCamera, renderAttractScrim, renderHud, renderWorld, snapCamera, updateCamera, viewScale, type Camera,
} from "./render.ts";

export type Screen = "title" | "garage" | "race" | "pause" | "results" | "standings";

export type Champ = { round: number; points: number[]; names: string[] } | null;

export type ResultRow = {
  name: string; place: number; time: number; bestLap: number; color: string; finished: boolean;
};

export type UiState = {
  screen: Screen;
  champ: Champ;
  selectedCar: number;
  selectedTrack: number;
  save: SaveData;
  results: ResultRow[] | null;
};

const STEP = 1 / 60;
const POINTS = [10, 8, 6, 4, 3, 2];

export function createEngine(canvas: HTMLCanvasElement, onUi: (s: UiState) => void) {
  const raw = canvas.getContext("2d");
  if (!raw) throw new Error("2d context unavailable");
  const ctx: CanvasRenderingContext2D = raw;
  const input = new Input();
  const audio = new GameAudio();
  const baked = new Map<string, Track>();
  let save = loadSave();
  let screen: Screen = "title";
  let selectedCar = save.lastCar;
  let selectedTrack = save.lastTrack;
  let champ: Champ = null;
  let race: RaceState | null = null;
  const cam: Camera = createCamera();
  let attract = true;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;
  let viewW = 1;
  let viewH = 1;
  let crashCool = 0;
  let lastTrauma = 0;
  let lastBeep = 4;
  let prevBoost = 0;
  let prevLap = 0;
  let results: ResultRow[] | null = null;
  audio.setMuted(save.muted);

  const ui = (): UiState => ({ screen, champ, selectedCar, selectedTrack, save, results });
  const pushUi = () => onUi(ui());

  function getTrack(id = TRACKS[selectedTrack].id): Track {
    let t = baked.get(id);
    if (!t) {
      t = bakeTrack(TRACKS.find((x) => x.id === id) ?? TRACKS[0]);
      baked.set(id, t);
    }
    return t;
  }

  function bootAttract() {
    attract = true;
    race = spawnRace(getTrack(), selectedCar, true);
    snapCamera(cam, race.cars[0], viewScale(viewW, viewH));
  }

  function startRace(opts?: { championship?: boolean; nextRound?: boolean }) {
    audio.unlock();
    attract = false;
    if (opts?.championship && !opts.nextRound) {
      champ = { round: 0, points: [0, 0, 0, 0, 0, 0], names: ["YOU", "AGNUS", "PAULA", "DENISE", "GARY", "LISA"] };
      selectedTrack = 0;
    }
    if (champ && opts?.nextRound) {
      champ = { ...champ, round: champ.round + 1 };
      selectedTrack = champ.round;
    }
    race = spawnRace(getTrack(TRACKS[selectedTrack].id), selectedCar, false);
    snapCamera(cam, race.player, viewScale(viewW, viewH));
    screen = "race";
    results = null;
    lastBeep = 4;
    prevBoost = 0;
    prevLap = 0;
    crashCool = 0;
    lastTrauma = 0;
    acc = 0;
    save = { ...save, lastCar: selectedCar, lastTrack: selectedTrack };
    writeSave(save);
    pushUi();
  }

  function finishRace() {
    if (!race) return;
    const rows = [...race.cars].sort((a, b) => a.place - b.place);
    results = rows.map((c) => ({
      name: c.name, place: c.place, time: c.finishTime, bestLap: c.bestLap, color: c.def.color, finished: c.finished,
    }));
    save = recordTimes(save, race.track.def.id, race.player.bestLap, race.player.finished ? race.player.finishTime : 0);
    if (champ) {
      const pts = [...champ.points];
      for (const c of race.cars) {
        const idx = champ.names.indexOf(c.name);
        if (idx >= 0) pts[idx] += POINTS[c.place - 1] ?? 0;
      }
      champ = { ...champ, points: pts };
    }
    screen = "results";
    pushUi();
  }

  function resize() {
    const parent = canvas.parentElement ?? canvas;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    viewW = Math.max(1, w);
    viewH = Math.max(1, h);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setPaused(p: boolean) {
    if (p && screen === "race") {
      screen = "pause";
      input.virtual = { left: false, right: false, throttle: false, brake: false, handbrake: false };
      pushUi();
    } else if (!p && screen === "pause") {
      screen = "race";
      last = performance.now();
      acc = 0;
      pushUi();
    }
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    const actions = input.sample();

    if (input.pausePressed) {
      if (screen === "race") setPaused(true);
      else if (screen === "pause") setPaused(false);
    }

    const active = !!race && (screen === "race" || screen === "title" || screen === "garage");
    const steps = Math.min(6, Math.floor(acc / STEP));
    for (let i = 0; i < steps; i++) {
      acc -= STEP;
      if (!race || !active) continue;
      const prevCd = Math.ceil(race.countdown);
      stepRace(race, STEP, screen === "race" ? actions : null);
      if (screen === "race" && race.countdown > 0 && Math.ceil(race.countdown) !== prevCd) {
        audio.beep(880, 0.1, 0.1);
      }
      if (screen === "race" && race.go && lastBeep !== 0) {
        audio.beep(1560, 0.2, 0.14);
        lastBeep = 0;
      }
    }
    if (screen === "pause" || screen === "results" || screen === "standings") acc = 0;

    if (race && (screen === "race" || screen === "title" || screen === "garage")) {
      const focus = screen === "race" ? race.player : race.cars.reduce((a, b) => (a.trackPos > b.trackPos ? a : b));
      const spd = Math.hypot(focus.vx, focus.vy);
      updateCamera(cam, focus, dt, spd, viewScale(viewW, viewH));
      if (save.shake && screen === "race") {
        const sh = race.trauma * race.trauma * 14;
        cam.shakeX = (Math.random() - 0.5) * sh;
        cam.shakeY = (Math.random() - 0.5) * sh;
      } else {
        cam.shakeX = 0;
        cam.shakeY = 0;
      }
      if (screen === "race") {
        const p = race.player;
        audio.engine(spd, p.throttle, dt, p.brake, p.dist > race.track.def.roadHalf);
        if (p.boost > 0 && prevBoost <= 0) audio.boost();
        prevBoost = p.boost;
        if (p.lap > prevLap) audio.lapChime();
        prevLap = p.lap;
        const slip = Math.abs(p.vx * Math.cos(p.heading) - p.vy * Math.sin(p.heading));
        audio.skid(p.handbrake || slip > 28 ? Math.min(1, spd / 180) : 0);
        crashCool = Math.max(0, crashCool - dt);
        if (race.trauma > lastTrauma + 0.12 && crashCool <= 0) {
          audio.crash();
          crashCool = 0.25;
        }
        lastTrauma = race.trauma;
      } else {
        audio.engine(40, 0.2, dt);
        audio.skid(0);
      }
    }

    if (race) {
      renderWorld(ctx, race, cam, viewW, viewH);
      if (screen === "race" || screen === "pause") renderHud(ctx, race, viewW, viewH, save.bestLap[race.track.def.id]);
      else if (screen === "title" || screen === "garage") renderAttractScrim(ctx, viewW, viewH);
    } else {
      ctx.fillStyle = "#07101c";
      ctx.fillRect(0, 0, viewW, viewH);
    }

    if (race && race.finished && screen === "race") finishRace();
  }

  // Canvas text doesn't trigger web-font loading by itself.
  void Promise.all([
    document.fonts?.load("700 40px Rajdhani"),
    document.fonts?.load("400 16px 'Share Tech Mono'"),
    document.fonts?.load("700 20px 'Share Tech Mono'"),
  ]).catch(() => undefined);

  const onVisibility = () => {
    if (document.hidden) setPaused(true);
  };
  document.addEventListener("visibilitychange", onVisibility);

  input.attach();
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement ?? canvas);
  window.addEventListener("resize", resize);
  bootAttract();
  pushUi();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      input.detach();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    },
    startRace: () => startRace(),
    startChampionship: () => startRace({ championship: true }),
    garage() {
      screen = "garage";
      pushUi();
    },
    title() {
      champ = null;
      screen = "title";
      bootAttract();
      pushUi();
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    /** Android back button / Escape-style navigation. Returns false when there is nothing left to go back to. */
    back(): boolean {
      if (screen === "race") { setPaused(true); return true; }
      if (screen === "pause") { setPaused(false); return true; }
      if (screen === "title") return false;
      this.title();
      return true;
    },
    selectCar(i: number) {
      selectedCar = i;
      save = { ...save, lastCar: i };
      writeSave(save);
      bootAttract();
      pushUi();
    },
    selectTrack(i: number) {
      selectedTrack = i;
      save = { ...save, lastTrack: i };
      writeSave(save);
      bootAttract();
      pushUi();
    },
    nextChampionshipRace() {
      if (!champ) return;
      if (champ.round >= TRACKS.length - 1) {
        screen = "standings";
        pushUi();
        return;
      }
      startRace({ nextRound: true });
    },
    showStandings() {
      screen = "standings";
      pushUi();
    },
    setMuted(muted: boolean) {
      save = { ...save, muted };
      writeSave(save);
      audio.setMuted(muted);
      pushUi();
    },
    setShake(shake: boolean) {
      save = { ...save, shake };
      writeSave(save);
      pushUi();
    },
    setVirtual(v: Partial<Input["virtual"]>) {
      Object.assign(input.virtual, v);
    },
    unlockAudio: () => audio.unlock(),
    getUi: () => ui(),
  };
}

export type Engine = ReturnType<typeof createEngine>;
