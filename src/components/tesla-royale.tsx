import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { createEngine, type Engine, type UiState } from "../game/engine";
import { CARS, TRACKS } from "../game/tracks";
import { formatTime } from "../game/math";
import { carPreview } from "../game/render";


const initialUi: UiState = {
  screen: "title",
  champ: null,
  selectedCar: 0,
  selectedTrack: 0,
  save: {
    version: 1,
    bestLap: {},
    bestRace: {},
    muted: false,
    shake: true,
    lastCar: 0,
    lastTrack: 0,
  },
  results: null,
};

export function TeslaRoyale() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [ui, setUi] = useState<UiState>(initialUi);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createEngine(canvas, setUi);
    engineRef.current = engine;

    let removeBack: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener("backButton", () => {
        if (!engine.back()) void CapApp.exitApp();
      }).then((h) => {
        removeBack = () => void h.remove();
      });
    }
    return () => {
      removeBack?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const e = () => engineRef.current;
  const screen = ui.screen;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg text-fg font-sans">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onContextMenu={(ev) => ev.preventDefault()}
      />
      <div className="scanlines absolute inset-0 z-10" />
      <div className="crt-vignette absolute inset-0 z-10" />

      {screen === "title" && <Title ui={ui} engine={e} />}
      {screen === "garage" && <Garage ui={ui} engine={e} />}
      {screen === "pause" && <Pause ui={ui} engine={e} />}
      {screen === "results" && <Results ui={ui} engine={e} />}
      {screen === "standings" && <Standings ui={ui} engine={e} />}
      {screen === "race" && <RaceChrome engine={e} />}
    </main>
  );
}

function Title({
  ui,
  engine,
}: {
  ui: UiState;
  engine: () => Engine | null;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      <div className="copper-bars h-2.5 w-full" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6">
        <p className="mb-2 text-center text-xs tracking-[0.35em] text-accent-2">
          6 CARS · 7 CIRCUITS
        </p>
        <h1 className="font-display text-6xl font-bold leading-none tracking-tight text-fg sm:text-7xl">
          TESLA
        </h1>
        <h1 className="mb-2 font-display text-6xl font-bold leading-none tracking-tight text-accent sm:text-7xl">
          ROYALE
        </h1>
        <p className="mb-8 font-mono text-sm text-muted">TOP-DOWN RACING</p>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <MenuBtn primary onClick={() => engine()?.startRace()}>
            Start
          </MenuBtn>
          <MenuBtn onClick={() => engine()?.startChampionship()}>Championship</MenuBtn>
          <MenuBtn onClick={() => engine()?.garage()}>Garage</MenuBtn>
        </div>
        <p className="mt-8 max-w-md text-center font-mono text-[11px] leading-relaxed text-muted">
          W ACCEL · S BRAKE · A/D STEER · SPACE DRIFT · P PAUSE
        </p>
        {ui.save.bestLap.oval != null && (
          <p className="mt-2 font-mono text-[11px] text-accent-2">
            OVAL BEST {formatTime(ui.save.bestLap.oval)}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <p className="font-mono text-[10px] tracking-widest text-muted">TESLA ROYALE</p>
        <button
          type="button"
          className="font-mono text-[10px] tracking-widest text-muted"
          onClick={() => engine()?.setMuted(!ui.save.muted)}
        >
          {ui.save.muted ? "AUDIO OFF" : "AUDIO ON"}
        </button>
      </div>
      <div className="copper-bars h-2.5 w-full" />
    </div>
  );
}

function Garage({
  ui,
  engine,
}: {
  ui: UiState;
  engine: () => Engine | null;
}) {
  const car = CARS[ui.selectedCar];
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-bg/85 px-4 py-4 backdrop-blur-[2px] sm:px-8">
      <div className="copper-bars mb-3 h-1 w-full shrink-0" />
      <div className="mb-3 flex shrink-0 items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.25em] text-accent-2">GARAGE</p>
          <h2 className="font-display text-3xl font-semibold leading-none">Choose your Tesla</h2>
        </div>
        <button type="button" className="font-mono text-xs text-muted" onClick={() => engine()?.title()}>
          BACK
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {CARS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => engine()?.selectCar(i)}
                className={`amiga-bevel bg-surface p-2 text-left transition-colors ${
                  i === ui.selectedCar ? "ring-2 ring-accent" : ""
                }`}
              >
                <img src={carPreview(c)} alt="" className="mx-auto h-24 w-auto object-contain" />
                <p className="mt-1 font-display text-sm font-semibold leading-none">{c.name}</p>
                <p className="font-mono text-[9px] text-muted">{c.paint}</p>
              </button>
            ))}
          </div>
          <div className="mt-3 amiga-bevel bg-surface p-3">
            <p className="font-display text-xl font-semibold text-accent">{car.name}</p>
            <p className="mb-2 text-sm text-muted">{car.blurb}</p>
            <Stat label="ACCEL" value={car.accel} />
            <Stat label="TOP" value={car.top / 1.1} />
            <Stat label="GRIP" value={car.grip / 1.12} />
            <Stat label="TURN" value={car.turn / 1.12} />
          </div>
        </div>
        <div>
          <p className="mb-2 font-mono text-[11px] tracking-[0.25em] text-accent-2">CIRCUIT</p>
          <div className="grid grid-cols-2 gap-2">
            {TRACKS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => engine()?.selectTrack(i)}
                className={`amiga-bevel bg-surface-2 px-3 py-2 text-left ${
                  i === ui.selectedTrack ? "ring-2 ring-accent-2" : ""
                }`}
              >
                <p className="font-display text-base font-semibold leading-tight">{t.name}</p>
                <p className="font-mono text-[10px] text-muted">{t.subtitle}</p>
                {ui.save.bestLap[t.id] != null && (
                  <p className="font-mono text-[10px] text-accent-2">{formatTime(ui.save.bestLap[t.id])}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <MenuBtn primary className="mt-4 shrink-0" onClick={() => engine()?.startRace()}>
        Race
      </MenuBtn>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-3">
      <span className="w-12 font-mono text-[10px] text-muted">{label}</span>
      <div className="h-2 flex-1 bg-bg amiga-bevel-in">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
    </div>
  );
}

function Pause({
  ui,
  engine,
}: {
  ui: UiState;
  engine: () => Engine | null;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/60 px-4">
      <div className="amiga-bevel m-auto w-full max-w-sm bg-surface p-5">
        <h2 className="mb-4 font-display text-3xl font-semibold">Paused</h2>
        <div className="flex flex-col gap-3">
          <MenuBtn primary onClick={() => engine()?.resume()}>
            Resume
          </MenuBtn>
          <MenuBtn onClick={() => engine()?.setMuted(!ui.save.muted)}>
            {ui.save.muted ? "Audio off" : "Audio on"}
          </MenuBtn>
          <MenuBtn onClick={() => engine()?.setShake(!ui.save.shake)}>
            {ui.save.shake ? "Shake on" : "Shake off"}
          </MenuBtn>
          <MenuBtn onClick={() => engine()?.title()}>Quit to title</MenuBtn>
        </div>
      </div>
    </div>
  );
}

function Results({
  ui,
  engine,
}: {
  ui: UiState;
  engine: () => Engine | null;
}) {
  const rows = ui.results ?? [];
  const you = rows.find((r) => r.name === "YOU");
  return (
    <div className="absolute inset-0 z-20 flex overflow-y-auto bg-bg/70 px-4 py-3">
      <div className="amiga-bevel m-auto w-full max-w-md bg-surface p-5">
        <p className="font-mono text-[11px] tracking-[0.25em] text-accent-2">CHEQUERED FLAG</p>
        <h2 className="mb-4 font-display text-3xl font-semibold">
          {you?.place === 1 ? "You win" : `P${you?.place ?? "-"}`}
        </h2>
        <ol className="mb-4 space-y-1">
          {rows.map((r) => (
            <li
              key={r.name}
              className="flex items-baseline justify-between gap-3 font-mono text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block size-2" style={{ background: r.color }} />
                <span className={r.name === "YOU" ? "text-accent" : "text-fg"}>
                  {r.place}. {r.name}
                </span>
              </span>
              <span className="text-muted">{r.finished ? formatTime(r.time) : "DNF"}</span>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-3">
          {ui.champ && ui.champ.round < TRACKS.length - 1 && (
            <MenuBtn primary onClick={() => engine()?.nextChampionshipRace()}>
              Next race
            </MenuBtn>
          )}
          {ui.champ && ui.champ.round >= TRACKS.length - 1 && (
            <MenuBtn primary onClick={() => engine()?.showStandings()}>
              Standings
            </MenuBtn>
          )}
          {!ui.champ && (
            <MenuBtn primary onClick={() => engine()?.startRace()}>
              Race again
            </MenuBtn>
          )}
          <MenuBtn onClick={() => engine()?.title()}>Title</MenuBtn>
        </div>
      </div>
    </div>
  );
}

function Standings({
  ui,
  engine,
}: {
  ui: UiState;
  engine: () => Engine | null;
}) {
  const champ = ui.champ;
  if (!champ) return null;
  const ranked = champ.names
    .map((n, i) => ({ n, p: champ.points[i] }))
    .sort((a, b) => b.p - a.p);
  return (
    <div className="absolute inset-0 z-20 flex overflow-y-auto bg-bg/70 px-4 py-3">
      <div className="amiga-bevel m-auto w-full max-w-md bg-surface p-5">
        <p className="font-mono text-[11px] tracking-[0.25em] text-accent-2">CHAMPIONSHIP</p>
        <h2 className="mb-4 font-display text-3xl font-semibold">Standings</h2>
        <ol className="mb-4 space-y-1">
          {ranked.map((r, i) => (
            <li key={r.n} className="flex justify-between font-mono text-sm">
              <span className={r.n === "YOU" ? "text-accent" : ""}>
                {i + 1}. {r.n}
              </span>
              <span>{r.p} PTS</span>
            </li>
          ))}
        </ol>
        <MenuBtn primary onClick={() => engine()?.title()}>
          Title
        </MenuBtn>
      </div>
    </div>
  );
}

function RaceChrome({ engine }: { engine: () => Engine | null }) {
  const [touch] = useState(
    () => typeof window !== "undefined" && (Capacitor.isNativePlatform() || window.matchMedia("(pointer: coarse)").matches),
  );
  const set = (v: Parameters<Engine["setVirtual"]>[0]) => engine()?.setVirtual(v);

  return (
    <>
      <button
        type="button"
        className="absolute top-4 left-1/2 z-20 -translate-x-1/2 amiga-bevel bg-surface/80 px-4 py-2 font-mono text-xs tracking-widest text-fg"
        style={{ marginTop: "var(--safe-t)" }}
        onClick={() => engine()?.pause()}
      >
        PAUSE
      </button>
      {touch && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between"
          style={{
            paddingLeft: "calc(1rem + var(--safe-l))",
            paddingRight: "calc(1rem + var(--safe-r))",
            paddingBottom: "calc(0.9rem + var(--safe-b))",
          }}
        >
          <div className="pointer-events-auto flex h-24 overflow-hidden rounded-full" style={GLASS}>
            <HoldBtn
              label="Steer left"
              onHold={(on) => set({ left: on })}
              className="flex h-full w-[6.5rem] items-center justify-center"
            >
              <Chevron dir="left" />
            </HoldBtn>
            <div className="my-4 w-px bg-white/15" />
            <HoldBtn
              label="Steer right"
              onHold={(on) => set({ right: on })}
              className="flex h-full w-[6.5rem] items-center justify-center"
            >
              <Chevron dir="right" />
            </HoldBtn>
          </div>

          <div className="pointer-events-auto flex items-end gap-3">
            <HoldBtn
              label="Drift"
              onHold={(on) => set({ handbrake: on })}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl"
              glass
            >
              <DriftIcon />
              <span className="font-mono text-[10px] tracking-[0.18em] text-white/85">DRIFT</span>
            </HoldBtn>
            <HoldBtn
              label="Accelerator"
              onHold={(on) => set({ throttle: on })}
              className="flex h-32 w-24 flex-col items-center justify-center gap-2 rounded-3xl"
              tone="red"
            >
              <PedalIcon tall />
              <span className="font-mono text-[11px] tracking-[0.2em] text-white">GAS</span>
            </HoldBtn>
            <HoldBtn
              label="Brake"
              onHold={(on) => set({ brake: on })}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-3xl"
              glass
            >
              <PedalIcon />
              <span className="font-mono text-[10px] tracking-[0.18em] text-white/85">BRAKE</span>
            </HoldBtn>
          </div>
        </div>
      )}
    </>
  );
}

const GLASS: CSSProperties = {
  background: "linear-gradient(180deg, rgba(48,54,66,0.55), rgba(10,12,16,0.65))",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 8px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.16)",
  backdropFilter: "blur(6px)",
};

function HoldBtn({
  onHold,
  children,
  className,
  label,
  tone,
  glass,
}: {
  onHold: (on: boolean) => void;
  children: ReactNode;
  className: string;
  label: string;
  tone?: "red";
  glass?: boolean;
}) {
  const [down, setDown] = useState(false);
  const press = (on: boolean) => {
    setDown(on);
    onHold(on);
  };
  let style: CSSProperties = {};
  if (tone === "red") {
    style = {
      background: down
        ? "linear-gradient(180deg, #ff5a60, #c4161c)"
        : "linear-gradient(180deg, rgba(232,33,39,0.88), rgba(140,12,18,0.92))",
      border: "1px solid rgba(255,255,255,0.28)",
      boxShadow: down
        ? "0 2px 8px rgba(232,33,39,0.5), inset 0 1px 0 rgba(255,255,255,0.3)"
        : "0 8px 22px rgba(0,0,0,0.5), 0 0 18px rgba(232,33,39,0.28), inset 0 1px 0 rgba(255,255,255,0.3)",
    };
  } else if (glass) {
    style = {
      ...GLASS,
      ...(down
        ? { background: "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.12))" }
        : {}),
    };
  } else if (down) {
    style = { background: "rgba(255,255,255,0.18)" };
  }
  return (
    <button
      type="button"
      aria-label={label}
      className={`touch-none select-none transition-transform duration-75 ${className}`}
      style={{ ...style, transform: down ? "scale(0.94)" : "scale(1)" }}
      onPointerDown={(ev) => {
        ev.preventDefault();
        ev.currentTarget.setPointerCapture(ev.pointerId);
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      {children}
    </button>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function DriftIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 21c0-6 5-6 5-12" />
      <path d="M13 21c0-6 5-6 5-12" />
      <path d="M9.5 11.5L12 8l2.5 3.5" />
    </svg>
  );
}

function PedalIcon({ tall }: { tall?: boolean }) {
  return tall ? (
    <svg width="32" height="44" viewBox="0 0 24 34" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="5" y="2" width="14" height="30" rx="3.5" />
      <path d="M8.5 10h7M8.5 16h7M8.5 22h7" />
    </svg>
  ) : (
    <svg width="38" height="30" viewBox="0 0 30 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="24" height="18" rx="4" />
      <path d="M10 8v8M15 8v8M20 8v8" />
    </svg>
  );
}

function MenuBtn({
  children,
  onClick,
  primary,
  className = "",
}: {
  children: string;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`amiga-bevel min-h-12 w-full px-4 font-display text-xl font-semibold tracking-wide ${
        primary ? "bg-accent text-bg" : "bg-surface-2 text-fg"
      } ${className}`}
    >
      {children}
    </button>
  );
}
