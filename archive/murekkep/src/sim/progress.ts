/** Persistent progress rules (pure). The shape is stored by src/save.ts. */
import { BLOT_UNLOCK_AFTER, CAMPAIGN, matchSeconds, starsFor, type MatchOutcome } from './campaign';

export interface SaveData {
  /** Best stars per campaign sheet (0..3). */
  stars: number[];
  /** Best winning time per sheet, whole game seconds (0 = never won). */
  bestSeconds: number[];
  matches: number;
  wins: number;
  /** Daily sheet: the date last played and the best winning time that day (0 = none). */
  dailyDate: string;
  dailyBest: number;
  /** Consecutive days with a daily win, and the last such day. */
  streak: number;
  lastDailyWin: string;
  /** Speed toggle kept between matches (the commit slider resets every match). */
  speed: number;
  /** One-time tips already shown. */
  tips: string[];
}

export function freshSave(): SaveData {
  return {
    stars: CAMPAIGN.map(() => 0),
    bestSeconds: CAMPAIGN.map(() => 0),
    matches: 0,
    wins: 0,
    dailyDate: '',
    dailyBest: 0,
    streak: 0,
    lastDailyWin: '',
    speed: 1,
    tips: [],
  };
}

/** Pad/truncate per-sheet arrays to the current campaign and clamp stars to 0..3. Mutates d. */
export function normalizeSave(d: SaveData): void {
  const fit = (a: number[], f: (v: number) => number): number[] => CAMPAIGN.map((_, i) => f(a[i] ?? 0));
  d.stars = fit(d.stars, (v) => Math.max(0, Math.min(3, Math.floor(v))));
  d.bestSeconds = fit(d.bestSeconds, (v) => Math.max(0, v));
  d.tips = d.tips.filter((t) => typeof t === 'string');
}

export function isUnlocked(d: SaveData, index: number): boolean {
  return index === 0 || (d.stars[index - 1] ?? 0) > 0;
}

export function blotUnlocked(d: SaveData): boolean {
  return (d.stars[BLOT_UNLOCK_AFTER] ?? 0) > 0;
}

export function totalStars(d: SaveData): number {
  return d.stars.reduce((a, b) => a + b, 0);
}

export interface CampaignRecord {
  stars: number;
  bestStars: number;
  newBest: boolean;
  bestSeconds: number;
}

/** Record a finished campaign match. Mutates d. */
export function applyCampaignResult(d: SaveData, index: number, o: MatchOutcome): CampaignRecord {
  const def = CAMPAIGN[index]!;
  const stars = starsFor(o, def.parSeconds);
  d.matches += 1;
  if (o.won) d.wins += 1;
  const prev = d.stars[index] ?? 0;
  const newBest = stars > prev;
  if (newBest) d.stars[index] = stars;
  if (o.won) {
    const secs = Math.round(matchSeconds(o.ticks));
    const best = d.bestSeconds[index] ?? 0;
    if (best === 0 || secs < best) d.bestSeconds[index] = secs;
  }
  return { stars, bestStars: d.stars[index]!, newBest, bestSeconds: d.bestSeconds[index] ?? 0 };
}

export interface DailyRecord {
  won: boolean;
  bestSeconds: number;
  newBest: boolean;
  streak: number;
}

/** Previous calendar day of a YYYY-MM-DD key (UTC arithmetic on the key itself). */
export function previousDay(date: string): string {
  const [y, m, day] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, day) - 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Record a finished daily match on `date`. Mutates d. */
export function applyDailyResult(d: SaveData, date: string, o: MatchOutcome): DailyRecord {
  d.matches += 1;
  if (d.dailyDate !== date) {
    d.dailyDate = date;
    d.dailyBest = 0;
  }
  let newBest = false;
  if (o.won) {
    d.wins += 1;
    const secs = Math.round(matchSeconds(o.ticks));
    if (d.dailyBest === 0 || secs < d.dailyBest) {
      d.dailyBest = secs;
      newBest = true;
    }
    if (d.lastDailyWin !== date) {
      d.streak = d.lastDailyWin === previousDay(date) ? d.streak + 1 : 1;
      d.lastDailyWin = date;
    }
  }
  return { won: o.won, bestSeconds: d.dailyBest, newBest, streak: d.streak };
}

/** Streak as shown today: it is broken if neither today nor yesterday had a win. */
export function liveStreak(d: SaveData, today: string): number {
  return d.lastDailyWin === today || d.lastDailyWin === previousDay(today) ? d.streak : 0;
}
