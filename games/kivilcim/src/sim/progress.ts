/** Persistent progress rules (pure). The shape is stored by src/save.ts. */
import { LEVEL_COUNT } from './levels';
import { SHAPES, TRAILS } from './skins';

export interface LevelRecord {
  /** Best percentage reached (0..100). */
  best: number;
  attempts: number;
  /** Gems ever collected on this level (bit per gem). */
  gemMask: number;
  done: boolean;
}

export interface SaveData {
  /** Highest unlocked level (1..10). */
  unlocked: number;
  levels: LevelRecord[];
  /** Gem wallet. */
  gems: number;
  skin: { shape: number; trail: number; ownedShapes: number; ownedTrails: number };
  /** Best endless height (m). */
  endlessBest: number;
  daily: { date: string; best: number; streak: number; lastDate: string };
  /** Levels finished in total (interstitial pacing). */
  finishes: number;
  /** Has the player ever started a run (first-time hints). */
  played: boolean;
}

export function defaults(): SaveData {
  return {
    unlocked: 1,
    levels: Array.from({ length: LEVEL_COUNT }, () => ({ best: 0, attempts: 0, gemMask: 0, done: false })),
    gems: 0,
    skin: { shape: 0, trail: 0, ownedShapes: 1, ownedTrails: 1 },
    endlessBest: 0,
    daily: { date: '', best: 0, streak: 0, lastDate: '' },
    finishes: 0,
    played: false,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a loaded save, repairing nested fields an older v2 save may lack (core fills only
 * top-level defaults). Returns false for data that cannot be trusted.
 */
export function normalize(d: unknown): d is SaveData {
  if (typeof d !== 'object' || d === null) return false;
  const s = d as SaveData;
  if (!isNum(s.unlocked) || !isNum(s.gems) || !Array.isArray(s.levels)) return false;
  const def = defaults();
  s.unlocked = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(s.unlocked)));
  s.levels = def.levels.map((l, i) => ({ ...l, ...(s.levels[i] ?? {}) }));
  s.skin = { ...def.skin, ...(s.skin ?? {}) };
  s.daily = { ...def.daily, ...(s.daily ?? {}) };
  return s.levels.every((l) => isNum(l.best) && isNum(l.attempts) && isNum(l.gemMask));
}

/** The level the title screen starts: the last unlocked one. */
export function levelToPlay(d: SaveData): number {
  return d.unlocked;
}

export function endlessUnlocked(d: SaveData): boolean {
  return d.levels[2]?.done === true;
}

const bits = (n: number): number => {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
};

export interface LevelRun {
  percent: number;
  gemMask: number;
  finished: boolean;
}

/** Record one attempt. Mutates d. */
export function recordLevelRun(d: SaveData, id: number, run: LevelRun): { newBest: boolean; gemsGained: number; unlocked: number } {
  const rec = d.levels[id - 1]!;
  rec.attempts += 1;
  const pct = run.finished ? 100 : Math.min(99, Math.floor(run.percent));
  const newBest = pct > rec.best;
  if (newBest) rec.best = pct;
  const fresh = run.gemMask & ~rec.gemMask;
  const gemsGained = bits(fresh);
  rec.gemMask |= run.gemMask;
  d.gems += gemsGained;
  if (run.finished) {
    rec.done = true;
    d.finishes += 1;
    if (id === d.unlocked && id < LEVEL_COUNT) d.unlocked = id + 1;
  }
  return { newBest, gemsGained, unlocked: d.unlocked };
}

export function recordEndless(d: SaveData, height: number, gems: number): { newBest: boolean } {
  d.gems += gems;
  const newBest = height > d.endlessBest;
  if (newBest) d.endlessBest = Math.floor(height);
  return { newBest };
}

function dayNumber(key: string): number {
  const [y = 0, m = 1, day = 1] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

/** Record a daily-shaft run for date key YYYY-MM-DD. */
export function recordDaily(d: SaveData, key: string, height: number): { best: number; streak: number; newBest: boolean } {
  const daily = d.daily;
  if (daily.date !== key) {
    const gap = daily.lastDate ? dayNumber(key) - dayNumber(daily.lastDate) : Infinity;
    daily.streak = gap === 1 ? daily.streak + 1 : gap === 0 ? daily.streak : 1;
    daily.date = key;
    daily.best = 0;
    daily.lastDate = key;
  }
  const newBest = height > daily.best;
  if (newBest) daily.best = Math.floor(height);
  return { best: daily.best, streak: daily.streak, newBest };
}

export type SkinKind = 'shape' | 'trail';

export function buySkin(d: SaveData, kind: SkinKind, i: number): 'bought' | 'owned' | 'poor' {
  const list = kind === 'shape' ? SHAPES : TRAILS;
  const ownedKey = kind === 'shape' ? 'ownedShapes' : 'ownedTrails';
  if (d.skin[ownedKey] & (1 << i)) return 'owned';
  const price = list[i]!.price;
  if (d.gems < price) return 'poor';
  d.gems -= price;
  d.skin[ownedKey] |= 1 << i;
  d.skin[kind] = i;
  return 'bought';
}

export function equipSkin(d: SaveData, kind: SkinKind, i: number): boolean {
  const ownedKey = kind === 'shape' ? 'ownedShapes' : 'ownedTrails';
  if (!(d.skin[ownedKey] & (1 << i))) return false;
  d.skin[kind] = i;
  return true;
}

/** Interstitial after the n-th finished level: at most once every three, never on deaths. */
export function shouldShowInterstitial(finishes: number): boolean {
  return finishes > 0 && finishes % 3 === 0;
}
