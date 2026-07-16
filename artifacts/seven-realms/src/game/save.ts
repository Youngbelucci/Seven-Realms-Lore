import type { Item, Stats } from './types';

// The Player's stats object is typed as `Stats` in types.ts. The task refers to
// this shape as `PlayerStats`, so we alias it here (types.ts is not modified).
export type PlayerStats = Stats;

const RUN_KEY = 'seven-realms:run:v1';
const BEST_KEY = 'seven-realms:best:v1';
const RUN_VERSION = 1;

export interface RunSnapshot {
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  stats: PlayerStats;
  equippedWeapon: Item | null;
  equippedArmor: Item | null;
}

export interface BestRecord {
  bestLevel: number;
  bestKills: number;
  bestTimeSeconds: number;
  runs: number;
}

interface StoredRun {
  version: number;
  snapshot: RunSnapshot;
}

/** True when a usable localStorage is present (browser + not blocked). */
export function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    const probe = '__seven-realms-probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidStats(s: unknown): s is PlayerStats {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    isNum(o.hp) &&
    isNum(o.maxHp) &&
    isNum(o.energy) &&
    isNum(o.maxEnergy) &&
    isNum(o.damage) &&
    isNum(o.defense) &&
    isNum(o.speed) &&
    isNum(o.critChance)
  );
}

function isValidItem(v: unknown): v is Item {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.slot === 'string';
}

function isValidSnapshot(v: unknown): v is RunSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isNum(o.level) &&
    isNum(o.xp) &&
    isNum(o.xpToNext) &&
    isNum(o.kills) &&
    isValidStats(o.stats) &&
    isValidItem(o.equippedWeapon) &&
    isValidItem(o.equippedArmor)
  );
}

/** Persist the current run snapshot. Never throws. */
export function saveRun(snap: RunSnapshot): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    const payload: StoredRun = { version: RUN_VERSION, snapshot: snap };
    window.localStorage.setItem(RUN_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable or over quota — ignore.
  }
}

/** Load the saved run, or null on missing/corrupt/version-mismatched data. */
export function loadRun(): RunSnapshot | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    const raw = window.localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const store = parsed as Record<string, unknown>;
    if (store.version !== RUN_VERSION) return null;
    if (!isValidSnapshot(store.snapshot)) return null;
    return store.snapshot;
  } catch {
    return null;
  }
}

/** Remove the saved run. Never throws. */
export function clearRun(): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    window.localStorage.removeItem(RUN_KEY);
  } catch {
    // ignore
  }
}

/** True when a valid saved run exists. */
export function hasRun(): boolean {
  return loadRun() !== null;
}

function defaultBest(): BestRecord {
  return { bestLevel: 0, bestKills: 0, bestTimeSeconds: 0, runs: 0 };
}

/** Load the best-run record, or a zeroed default. Never throws. */
export function loadBest(): BestRecord {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return defaultBest();
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return defaultBest();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultBest();
    const o = parsed as Record<string, unknown>;
    return {
      bestLevel: isNum(o.bestLevel) ? o.bestLevel : 0,
      bestKills: isNum(o.bestKills) ? o.bestKills : 0,
      bestTimeSeconds: isNum(o.bestTimeSeconds) ? o.bestTimeSeconds : 0,
      runs: isNum(o.runs) ? o.runs : 0,
    };
  } catch {
    return defaultBest();
  }
}

/**
 * Merge a finished run into the best record (max of each field), increment the
 * run counter, persist, and return the updated record. Never throws; still
 * returns a sensible merged record even if persistence fails.
 */
export function recordResult(finalLevel: number, kills: number, timeSeconds: number): BestRecord {
  const prev = loadBest();
  const updated: BestRecord = {
    bestLevel: Math.max(prev.bestLevel, isNum(finalLevel) ? finalLevel : 0),
    bestKills: Math.max(prev.bestKills, isNum(kills) ? kills : 0),
    bestTimeSeconds: Math.max(prev.bestTimeSeconds, isNum(timeSeconds) ? timeSeconds : 0),
    runs: prev.runs + 1,
  };
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore persistence failure; still return the merged record
  }
  return updated;
}
