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
  daily: { date: string; best: number; streak: number; lastDate: string; gems: number[] };
  /** Levels finished in total (interstitial pacing). */
  finishes: number;
  /** Has the player ever started a run (first-time hints). */
  played: boolean;
  /** The one-time "let go!" / "hold!" cues have been shown. */
  tutorial: boolean;
}

export function defaults(): SaveData {
  return {
    unlocked: 1,
    levels: Array.from({ length: LEVEL_COUNT }, () => ({ best: 0, attempts: 0, gemMask: 0, done: false })),
    gems: 0,
    skin: { shape: 0, trail: 0, ownedShapes: 1, ownedTrails: 1 },
    endlessBest: 0,
    daily: { date: '', best: 0, streak: 0, lastDate: '', gems: [] },
    finishes: 0,
    played: false,
    tutorial: false,
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
  const int = (v: unknown, lo: number, hi: number, fallback: number): number => (isNum(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback);
  s.unlocked = int(s.unlocked, 1, LEVEL_COUNT, 1);
  s.gems = int(s.gems, 0, 1e9, 0);
  s.levels = def.levels.map((l, i) => {
    const r = { ...l, ...((s.levels[i] ?? {}) as Partial<LevelRecord>) };
    return { best: int(r.best, 0, 100, 0), attempts: int(r.attempts, 0, 1e9, 0), gemMask: int(r.gemMask, 0, 7, 0), done: r.done === true };
  });
  const sk = { ...def.skin, ...(s.skin ?? {}) };
  s.skin = {
    shape: int(sk.shape, 0, SHAPES.length - 1, 0),
    trail: int(sk.trail, 0, TRAILS.length - 1, 0),
    ownedShapes: (int(sk.ownedShapes, 0, 255, 1) | 1) & 255,
    ownedTrails: (int(sk.ownedTrails, 0, 255, 1) | 1) & 255,
  };
  if (!(s.skin.ownedShapes & (1 << s.skin.shape))) s.skin.shape = 0;
  if (!(s.skin.ownedTrails & (1 << s.skin.trail))) s.skin.trail = 0;
  const dl = { ...def.daily, ...(s.daily ?? {}) };
  s.daily = {
    date: typeof dl.date === 'string' ? dl.date : '',
    lastDate: typeof dl.lastDate === 'string' ? dl.lastDate : '',
    best: int(dl.best, 0, 1e9, 0),
    streak: int(dl.streak, 0, 1e6, 0),
    gems: Array.isArray(dl.gems) ? dl.gems.filter((g) => isNum(g) && g >= 0).map((g) => Math.floor(g)) : [],
  };
  s.endlessBest = int(s.endlessBest, 0, 1e9, 0);
  s.finishes = int(s.finishes, 0, 1e9, 0);
  s.played = s.played === true;
  s.tutorial = s.tutorial === true;
  return true;
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

/**
 * Record a daily-shaft run for date key YYYY-MM-DD. `gems` are the indices of the gems taken in
 * this run; each gem of the day's shaft pays once per date, however often it is retried.
 */
export function recordDaily(d: SaveData, key: string, height: number, gems: readonly number[] = []): { best: number; streak: number; newBest: boolean; gemsGained: number } {
  const daily = d.daily;
  if (daily.date !== key) {
    const gap = daily.lastDate ? dayNumber(key) - dayNumber(daily.lastDate) : Infinity;
    daily.streak = gap === 1 ? daily.streak + 1 : gap === 0 ? daily.streak : 1;
    daily.date = key;
    daily.best = 0;
    daily.lastDate = key;
    daily.gems = [];
  }
  let gemsGained = 0;
  for (const g of gems) {
    if (daily.gems.includes(g)) continue;
    daily.gems.push(g);
    gemsGained++;
  }
  d.gems += gemsGained;
  const newBest = height > daily.best;
  if (newBest) daily.best = Math.floor(height);
  return { best: daily.best, streak: daily.streak, newBest, gemsGained };
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
