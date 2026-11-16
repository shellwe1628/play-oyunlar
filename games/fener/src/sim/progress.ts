/** Persistent progress rules (pure). The shape is stored by src/save.ts. */
import { hashSeed } from '@oyun/core/pure';
import { SHIFT } from './night';
import { logbookKeys } from './station';

export interface DailyRecord {
  /** Day the best below belongs to (YYYY-MM-DD), '' if never played. */
  date: string;
  best: number;
  /** Consecutive days with at least one daily shift, ending at `last`. */
  streak: number;
  /** Last day a daily shift was finished. */
  last: string;
}

export interface SaveData {
  /** Highest campaign night that can be played (1..7). */
  unlocked: number;
  /** Best score per night (index 0 = night 1). */
  nightBest: number[];
  /** Logbook keys `camera:object:type` reported correctly at least once. */
  log: string[];
  shifts: number;
  daily: DailyRecord;
}

export function freshSave(): SaveData {
  return {
    unlocked: 1,
    nightBest: Array.from({ length: SHIFT.nights }, () => 0),
    log: [],
    shifts: 0,
    daily: { date: '', best: 0, streak: 0, last: '' },
  };
}

/** Record a finished campaign night. */
export function applyNightResult(d: SaveData, night: number, score: number, won: boolean): { best: number; newBest: boolean; unlocked: boolean } {
  d.shifts += 1;
  const i = night - 1;
  const newBest = score > (d.nightBest[i] ?? 0);
  if (newBest) d.nightBest[i] = score;
  let unlocked = false;
  if (won && night === d.unlocked && night < SHIFT.nights) {
    d.unlocked = night + 1;
    unlocked = true;
  }
  return { best: d.nightBest[i] ?? 0, newBest, unlocked };
}

let validKeys: Set<string> | null = null;

/** Add logbook keys; returns the ones that were new. */
export function applyLog(d: SaveData, keys: readonly string[]): string[] {
  validKeys ??= new Set(logbookKeys());
  const have = new Set(d.log);
  const added: string[] = [];
  for (const k of keys) {
    if (!validKeys.has(k) || have.has(k)) continue;
    have.add(k);
    d.log.push(k);
    added.push(k);
  }
  return added;
}

export function logbookProgress(d: SaveData): { found: number; total: number; percent: number } {
  const all = logbookKeys();
  const have = new Set(d.log);
  const found = all.filter((k) => have.has(k)).length;
  return { found, total: all.length, percent: Math.floor((found / all.length) * 100) };
}

/** YYYY-MM-DD ± n days (calendar maths in UTC, so no DST surprises). */
export function addDays(day: string, n: number): string {
  const [y, m, dd] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Same seed for everyone on the same calendar day. */
export function dailySeed(day: string): number {
  return hashSeed(`fener-daily-${day}`);
}

/** The streak as it stands today: alive if the last daily was today or yesterday. */
export function dailyStreak(d: SaveData, today: string): number {
  const last = d.daily.last;
  return last === today || last === addDays(today, -1) ? d.daily.streak : 0;
}

export function applyDailyResult(d: SaveData, today: string, score: number): { best: number; newBest: boolean; streak: number } {
  d.shifts += 1;
  const r = d.daily;
  if (r.date !== today) {
    r.date = today;
    r.best = 0;
  }
  if (r.last !== today) r.streak = r.last === addDays(today, -1) ? r.streak + 1 : 1;
  r.last = today;
  const newBest = score > r.best;
  if (newBest) r.best = score;
  return { best: r.best, newBest, streak: r.streak };
}
