/** Persistent progress rules (pure). The shape is stored by src/save.ts. */
import { LEVEL_COUNT, WORLD_COUNT, worldOf } from './levels';
import {
  bits,
  ENDLESS_MILESTONE_GEMS,
  GEMS_PER_STAR,
  STAR_CLEAN,
  STAR_FINISH,
  STAR_GEMS,
  streakReward,
  totalStars,
  WORLD_CLEAR_GEMS,
  WORLD_STAR_REQ,
} from './meta';
import { SHAPES, TRAILS } from './skins';

export interface LevelRecord {
  /** Best percentage reached (0..100). */
  best: number;
  attempts: number;
  /** Gems ever collected on this level (bit per gem). */
  gemMask: number;
  done: boolean;
  /** Star bits (meta.ts STAR_*). */
  stars: number;
  /** Local date (YYYY-MM-DD) of the best, '' if none. */
  bestDate: string;
}

export interface DailyDay {
  date: string;
  best: number;
}

export interface SaveData {
  /** Highest level reached by finishing the one before it (1..40). Worlds also need stars. */
  unlocked: number;
  levels: LevelRecord[];
  /** Gem wallet. */
  gems: number;
  skin: { shape: number; trail: number; ownedShapes: number; ownedTrails: number };
  /** Best endless height (m) and the date it was flown. */
  endlessBest: number;
  endlessDate: string;
  daily: {
    date: string;
    best: number;
    streak: number;
    lastDate: string;
    gems: number[];
    bestStreak: number;
    /** Days a daily shaft was flown. */
    days: number;
    /** Date whose streak reward was paid. */
    paid: string;
    /** Last 30 days flown, newest last. */
    history: DailyDay[];
  };
  /** Levels finished in total (interstitial pacing). */
  finishes: number;
  /** Has the player ever started a run (first-time hints). */
  played: boolean;
  /** The one-time "let go!" / "hold!" cues have been shown. */
  tutorial: boolean;
  /** Achievement bits (meta.ts ACHIEVEMENTS). */
  achievements: number;
  /** Highest rank already celebrated. */
  rankSeen: number;
  /** Mechanic cues already shown (bit per patterns.ts MECHANICS index). */
  cues: number;
  stats: { attempts: number; bestEdge: number; bestFlow: number };
}

const blankLevel = (): LevelRecord => ({ best: 0, attempts: 0, gemMask: 0, done: false, stars: 0, bestDate: '' });

export function defaults(): SaveData {
  return {
    unlocked: 1,
    levels: Array.from({ length: LEVEL_COUNT }, blankLevel),
    gems: 0,
    skin: { shape: 0, trail: 0, ownedShapes: 1, ownedTrails: 1 },
    endlessBest: 0,
    endlessDate: '',
    daily: { date: '', best: 0, streak: 0, lastDate: '', gems: [], bestStreak: 0, days: 0, paid: '', history: [] },
    finishes: 0,
    played: false,
    tutorial: false,
    achievements: 0,
    rankSeen: 0,
    cues: 0,
    stats: { attempts: 0, bestEdge: 0, bestFlow: 0 },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const TRAIL_MASK = (2 ** TRAILS.length - 1) >>> 0;
const SHAPE_MASK = 2 ** SHAPES.length - 1;

/**
 * Validate a loaded save, repairing nested fields an older save may lack (core fills only
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
    const done = r.done === true;
    // A star can only be held on a finished level.
    const stars = done ? int(r.stars, 0, 7, 0) | STAR_FINISH : 0;
    return { best: int(r.best, 0, 100, 0), attempts: int(r.attempts, 0, 1e9, 0), gemMask: int(r.gemMask, 0, 7, 0), done, stars, bestDate: isDate(r.bestDate) ? r.bestDate : '' };
  });
  const sk = { ...def.skin, ...(s.skin ?? {}) };
  s.skin = {
    shape: int(sk.shape, 0, SHAPES.length - 1, 0),
    trail: int(sk.trail, 0, TRAILS.length - 1, 0),
    ownedShapes: (int(sk.ownedShapes, 0, SHAPE_MASK, 1) | 1) & SHAPE_MASK,
    ownedTrails: ((int(sk.ownedTrails, 0, TRAIL_MASK, 1) | 1) & TRAIL_MASK) >>> 0,
  };
  if (!(s.skin.ownedShapes & (1 << s.skin.shape))) s.skin.shape = 0;
  if (!(s.skin.ownedTrails & (1 << s.skin.trail))) s.skin.trail = 0;
  const dl = { ...def.daily, ...(s.daily ?? {}) };
  const streak = int(dl.streak, 0, 1e6, 0);
  const history = Array.isArray(dl.history)
    ? dl.history.filter((h): h is DailyDay => typeof h === 'object' && h !== null && isDate((h).date) && isNum((h).best)).slice(-30).map((h) => ({ date: h.date, best: Math.max(0, Math.floor(h.best)) }))
    : [];
  s.daily = {
    date: typeof dl.date === 'string' ? dl.date : '',
    lastDate: typeof dl.lastDate === 'string' ? dl.lastDate : '',
    best: int(dl.best, 0, 1e9, 0),
    streak,
    gems: Array.isArray(dl.gems) ? dl.gems.filter((g) => isNum(g) && g >= 0).map((g) => Math.floor(g)) : [],
    bestStreak: Math.max(streak, int(dl.bestStreak, 0, 1e6, 0)),
    days: int(dl.days, 0, 1e6, 0),
    paid: isDate(dl.paid) ? dl.paid : '',
    history,
  };
  s.endlessBest = int(s.endlessBest, 0, 1e9, 0);
  s.endlessDate = isDate(s.endlessDate) ? s.endlessDate : '';
  s.finishes = int(s.finishes, 0, 1e9, 0);
  s.played = s.played === true;
  s.tutorial = s.tutorial === true;
  s.achievements = int(s.achievements, 0, 2 ** 30 - 1, 0);
  s.rankSeen = int(s.rankSeen, 0, 64, 0);
  s.cues = int(s.cues, 0, 2 ** 16 - 1, 0);
  const st = { ...def.stats, ...(s.stats ?? {}) };
  s.stats = { attempts: int(st.attempts, 0, 1e9, 0), bestEdge: int(st.bestEdge, 0, 1e6, 0), bestFlow: int(st.bestFlow, 0, 100, 0) };
  return true;
}

/**
 * v2 → v3 (worlds 2-4, stars, ranks): levels 1-10, gems, skins and records are kept as they
 * are. Finished levels get the finish star, and the all-gems star when all three gems were
 * found; the clean star is never guessed. The daily streak becomes the best streak.
 */
export function migrateV2(old: unknown): unknown {
  if (typeof old !== 'object' || old === null) return old;
  const o = old as Record<string, unknown> & { levels?: Partial<LevelRecord>[]; daily?: Record<string, unknown> };
  const levels = Array.isArray(o.levels)
    ? o.levels.map((l) => ({ ...l, stars: l?.done === true ? STAR_FINISH | (l.gemMask === 7 ? STAR_GEMS : 0) : 0, bestDate: '' }))
    : o.levels;
  const daily = o.daily && typeof o.daily === 'object' ? { ...o.daily, bestStreak: o.daily.streak ?? 0, days: o.daily.date ? 1 : 0, paid: o.daily.date ?? '', history: isDate(o.daily.date) ? [{ date: o.daily.date, best: Number(o.daily.best) || 0 }] : [] } : o.daily;
  // Unlocked stays: an old player who finished level 10 sees world 2 as soon as its star gate is met.
  return { ...o, levels, daily, achievements: 0, rankSeen: 0, cues: 0, stats: { attempts: o.levels ? (o.levels as LevelRecord[]).reduce((a, l) => a + (Number(l?.attempts) || 0), 0) : 0, bestEdge: 0, bestFlow: 0 } };
}

export function worldUnlocked(d: SaveData, world: number): boolean {
  if (world <= 1) return true;
  return d.levels[(world - 1) * 10 - 1]?.done === true && totalStars(d) >= WORLD_STAR_REQ[world - 1]!;
}

/** A level can be played: reached, and its world is open. */
export function levelOpen(d: SaveData, id: number): boolean {
  return id <= d.unlocked && worldUnlocked(d, worldOf(id));
}

/** The level the title screen starts: the last open one. */
export function levelToPlay(d: SaveData): number {
  for (let id = d.unlocked; id > 1; id--) if (levelOpen(d, id)) return id;
  return 1;
}

export function endlessUnlocked(d: SaveData): boolean {
  return d.levels[2]?.done === true;
}

export interface LevelRun {
  percent: number;
  gemMask: number;
  finished: boolean;
  /** Near misses in this run (clean star = finished with none). */
  nearMisses?: number;
  /** Local date YYYY-MM-DD. */
  date?: string;
}

export interface LevelResult {
  newBest: boolean;
  /** Previous best (%), for the size of the fanfare. */
  prevBest: number;
  gemsGained: number;
  unlocked: number;
  /** Star bits earned for the first time in this run. */
  newStars: number;
  starGems: number;
  /** Gems for clearing a world's boss the first time. */
  worldGems: number;
}

/** Record one attempt. Mutates d. */
export function recordLevelRun(d: SaveData, id: number, run: LevelRun): LevelResult {
  const rec = d.levels[id - 1]!;
  rec.attempts += 1;
  d.stats.attempts += 1;
  const pct = run.finished ? 100 : Math.min(99, Math.floor(run.percent));
  const prevBest = rec.best;
  const newBest = pct > rec.best;
  if (newBest) {
    rec.best = pct;
    rec.bestDate = run.date ?? rec.bestDate;
  }
  const fresh = run.gemMask & ~rec.gemMask;
  const gemsGained = bits(fresh);
  rec.gemMask |= run.gemMask;
  d.gems += gemsGained;
  let newStars = 0;
  let worldGems = 0;
  if (run.finished) {
    const firstClear = !rec.done;
    rec.done = true;
    d.finishes += 1;
    const earned = STAR_FINISH | ((run.gemMask & 7) === 7 ? STAR_GEMS : 0) | (run.nearMisses === 0 ? STAR_CLEAN : 0);
    newStars = earned & ~rec.stars;
    rec.stars |= earned;
    if (id === d.unlocked && id < LEVEL_COUNT) d.unlocked = id + 1;
    if (firstClear && id % 10 === 0) worldGems = WORLD_CLEAR_GEMS[worldOf(id) - 1] ?? 0;
  }
  const starGems = GEMS_PER_STAR * bits(newStars);
  d.gems += starGems + worldGems;
  return { newBest, prevBest, gemsGained, unlocked: d.unlocked, newStars, starGems, worldGems };
}

export function recordEndless(d: SaveData, height: number, gems: number, date = ''): { newBest: boolean; prevBest: number; milestoneGems: number } {
  const prevBest = d.endlessBest;
  const milestoneGems = ENDLESS_MILESTONE_GEMS * Math.floor(height / 250);
  d.gems += gems + milestoneGems;
  d.stats.attempts += 1;
  const newBest = height > d.endlessBest;
  if (newBest) {
    d.endlessBest = Math.floor(height);
    d.endlessDate = date || d.endlessDate;
  }
  return { newBest, prevBest, milestoneGems };
}

function dayNumber(key: string): number {
  const [y = 0, m = 1, day = 1] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

/**
 * Record a daily-shaft run for date key YYYY-MM-DD. `gems` are the indices of the gems taken in
 * this run; each gem of the day's shaft pays once per date, however often it is retried. The
 * first run of each date pays the streak reward (meta.ts STREAK_LADDER).
 */
export function recordDaily(
  d: SaveData,
  key: string,
  height: number,
  gems: readonly number[] = [],
): { best: number; streak: number; newBest: boolean; prevBest: number; gemsGained: number; streakGems: number } {
  const daily = d.daily;
  if (daily.date !== key) {
    const gap = daily.lastDate ? dayNumber(key) - dayNumber(daily.lastDate) : Infinity;
    daily.streak = gap === 1 ? daily.streak + 1 : gap === 0 ? daily.streak : 1;
    daily.date = key;
    daily.best = 0;
    daily.lastDate = key;
    daily.gems = [];
    daily.days += 1;
    daily.bestStreak = Math.max(daily.bestStreak, daily.streak);
  }
  d.stats.attempts += 1;
  let streakGems = 0;
  if (daily.paid !== key) {
    daily.paid = key;
    streakGems = streakReward(daily.streak);
  }
  let gemsGained = 0;
  for (const g of gems) {
    if (daily.gems.includes(g)) continue;
    daily.gems.push(g);
    gemsGained++;
  }
  d.gems += gemsGained + streakGems;
  const prevBest = daily.best;
  const newBest = height > daily.best;
  if (newBest) daily.best = Math.floor(height);
  const h = daily.history;
  const last = h[h.length - 1];
  if (last?.date === key) last.best = daily.best;
  else {
    h.push({ date: key, best: daily.best });
    if (h.length > 30) h.splice(0, h.length - 30);
  }
  return { best: daily.best, streak: daily.streak, newBest, prevBest, gemsGained, streakGems };
}

/** Save the run stats that achievements read. */
export function recordStats(d: SaveData, edge: number, flow: number): void {
  if (edge > d.stats.bestEdge) d.stats.bestEdge = edge;
  if (flow > d.stats.bestFlow) d.stats.bestFlow = flow;
}

export type SkinKind = 'shape' | 'trail';

export function buySkin(d: SaveData, kind: SkinKind, i: number): 'bought' | 'owned' | 'poor' | 'earned' {
  const ownedKey = kind === 'shape' ? 'ownedShapes' : 'ownedTrails';
  if (d.skin[ownedKey] & (1 << i)) return 'owned';
  if (kind === 'trail' && TRAILS[i]?.unlock) return 'earned';
  const price = (kind === 'shape' ? SHAPES : TRAILS)[i]!.price;
  if (d.gems < price) return 'poor';
  d.gems -= price;
  d.skin[ownedKey] = (d.skin[ownedKey] | (1 << i)) >>> 0;
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

export { STAR_CLEAN, STAR_FINISH, STAR_GEMS, WORLD_COUNT };
