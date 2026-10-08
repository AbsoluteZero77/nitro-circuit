const KEY = "nitro-circuit-save-v1";
const VERSION = 1;

export type SaveData = {
  version: number;
  bestLap: Record<string, number>;
  bestRace: Record<string, number>;
  muted: boolean;
  shake: boolean;
  lastCar: number;
  lastTrack: number;
};

const defaults = (): SaveData => ({
  version: VERSION,
  bestLap: {},
  bestRace: {},
  muted: false,
  shake: true,
  lastCar: 0,
  lastTrack: 0,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...defaults(),
      ...parsed,
      version: VERSION,
      bestLap: { ...parsed.bestLap },
      bestRace: { ...parsed.bestRace },
    };
  } catch {
    return defaults();
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function recordTimes(save: SaveData, trackId: string, lap: number, race: number): SaveData {
  const next = {
    ...save,
    bestLap: { ...save.bestLap },
    bestRace: { ...save.bestRace },
  };
  if (lap > 0 && (next.bestLap[trackId] == null || lap < next.bestLap[trackId])) {
    next.bestLap[trackId] = lap;
  }
  if (race > 0 && (next.bestRace[trackId] == null || race < next.bestRace[trackId])) {
    next.bestRace[trackId] = race;
  }
  writeSave(next);
  return next;
}
