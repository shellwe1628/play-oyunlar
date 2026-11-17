/**
 * Meta progression (pure, deterministic): stars, the progress score and rank ladder,
 * achievements and earned trails. Everything is a function of the save; nothing here is random,
 * nothing reads the clock, and there are no other players (a personal ladder, not a leaderboard).
 */
import { LEVEL_COUNT, WORLD_SIZE } from './levels';
import type { SaveData } from './progress';
import { TRAILS } from './skins';

/** Star bits per level: finished, all three gems in one finished run, finished with no near miss. */
export const STAR_FINISH = 1;
export const STAR_GEMS = 2;
export const STAR_CLEAN = 4;
export const STARS_PER_LEVEL = 3;

export const bits = (n: number): number => {
  let c = 0;
  for (let v = n >>> 0; v; v &= v - 1) c++;
  return c;
};

export function totalStars(d: SaveData): number {
  let s = 0;
  for (const l of d.levels) s += bits(l.stars & 7);
  return s;
}

export function worldStars(d: SaveData, world: number): number {
  let s = 0;
  for (let i = (world - 1) * WORLD_SIZE; i < world * WORLD_SIZE; i++) s += bits((d.levels[i]?.stars ?? 0) & 7);
  return s;
}

/** Total stars needed to enter world k (index k-1). */
export const WORLD_STAR_REQ = [0, 15, 36, 60] as const;

/** Gems for each newly earned star, and for clearing a world's boss the first time. */
export const GEMS_PER_STAR = 2;
export const WORLD_CLEAR_GEMS = [20, 30, 40, 50] as const;
/** Gems per 250 m milestone passed in an endless run. */
export const ENDLESS_MILESTONE_GEMS = 1;
/** Daily streak reward ladder (day 1, 2, ... 7); day 8 on pays the last-but-one value. */
export const STREAK_LADDER = [5, 6, 7, 8, 10, 12, 20] as const;
export const streakReward = (streak: number): number =>
  streak <= 0 ? 0 : streak <= STREAK_LADDER.length ? STREAK_LADDER[streak - 1]! : STREAK_LADDER[STREAK_LADDER.length - 2]!;

// ── Progress score and ranks ──────────────────────────────────────────────

export interface ScoreParts {
  stars: number;
  levels: number;
  endless: number;
  daily: number;
  collection: number;
  achievements: number;
}

export const SCORE_RULES = {
  perStar: 10,
  perLevel: 15,
  /** Endless best (m) / 10, capped. */
  endlessDiv: 10,
  endlessCap: 400,
  perStreakDay: 10,
  streakCap: 30,
  perDailyDay: 4,
  dailyDaysCap: 100,
  perTrail: 10,
  perShape: 5,
  perAchievement: 15,
} as const;

export function scoreParts(d: SaveData): ScoreParts {
  const R = SCORE_RULES;
  const done = d.levels.filter((l) => l.done).length;
  return {
    stars: R.perStar * totalStars(d),
    levels: R.perLevel * done,
    endless: Math.min(R.endlessCap, Math.floor(d.endlessBest / R.endlessDiv)),
    daily: R.perStreakDay * Math.min(R.streakCap, d.daily.bestStreak) + R.perDailyDay * Math.min(R.dailyDaysCap, d.daily.days),
    collection: R.perTrail * (bits(d.skin.ownedTrails) - 1) + R.perShape * (bits(d.skin.ownedShapes) - 1),
    achievements: R.perAchievement * bits(d.achievements),
  };
}

export function progressScore(d: SaveData): number {
  const p = scoreParts(d);
  return p.stars + p.levels + p.endless + p.daily + p.collection + p.achievements;
}

export interface Rank {
  id: string;
  /** Score needed. */
  min: number;
  color: number;
}

/** The ladder: twelve ranks, each with its own badge (drawn in src/render/badges.ts). */
export const RANKS: readonly Rank[] = [
  { id: 'ember', min: 0, color: 0xff7a45 },
  { id: 'flicker', min: 60, color: 0xffa94d },
  { id: 'spark', min: 150, color: 0xffd84d },
  { id: 'glow', min: 280, color: 0xd8ff4d },
  { id: 'flare', min: 450, color: 0x6dff8a },
  { id: 'blaze', min: 650, color: 0x2ef0c8 },
  { id: 'torch', min: 900, color: 0x3db8ff },
  { id: 'beacon', min: 1200, color: 0x5b7dff },
  { id: 'comet', min: 1550, color: 0x9b5bff },
  { id: 'nova', min: 1950, color: 0xd84dff },
  { id: 'pulsar', min: 2400, color: 0xff4da6 },
  { id: 'supernova', min: 2900, color: 0xffffff },
];

export function rankOf(score: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i]!.min) r = i;
  return r;
}

/** What the next rank needs (null at the top). */
export function nextRank(score: number): { rank: number; need: number } | null {
  const r = rankOf(score);
  if (r >= RANKS.length - 1) return null;
  return { rank: r + 1, need: RANKS[r + 1]!.min - score };
}

// ── Achievements ──────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  gems: number;
  check: (d: SaveData) => boolean;
}

const doneUpTo = (d: SaveData, id: number): boolean => d.levels[id - 1]?.done === true;
const cleanCount = (d: SaveData): number => d.levels.filter((l) => l.stars & STAR_CLEAN).length;

/** Indices are stable forever (saves store a bit mask): append, never reorder. At most 30. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', gems: 5, check: (d) => d.levels.some((l) => l.done) },
  { id: 'world1', gems: 15, check: (d) => doneUpTo(d, 10) },
  { id: 'world2', gems: 25, check: (d) => doneUpTo(d, 20) },
  { id: 'world3', gems: 35, check: (d) => doneUpTo(d, 30) },
  { id: 'world4', gems: 50, check: (d) => doneUpTo(d, 40) },
  { id: 'stars30', gems: 15, check: (d) => totalStars(d) >= 30 },
  { id: 'stars60', gems: 25, check: (d) => totalStars(d) >= 60 },
  { id: 'stars100', gems: 40, check: (d) => totalStars(d) >= 100 },
  { id: 'clean5', gems: 15, check: (d) => cleanCount(d) >= 5 },
  { id: 'gems1', gems: 20, check: (d) => d.levels.slice(0, WORLD_SIZE).every((l) => l.stars & STAR_GEMS) },
  { id: 'endless500', gems: 10, check: (d) => d.endlessBest >= 500 },
  { id: 'endless1500', gems: 25, check: (d) => d.endlessBest >= 1500 },
  { id: 'endless3000', gems: 40, check: (d) => d.endlessBest >= 3000 },
  { id: 'daily3', gems: 10, check: (d) => d.daily.bestStreak >= 3 },
  { id: 'daily7', gems: 25, check: (d) => d.daily.bestStreak >= 7 },
  { id: 'edge5', gems: 10, check: (d) => d.stats.bestEdge >= 5 },
  { id: 'flow', gems: 15, check: (d) => d.stats.bestFlow >= FLOW_MAX },
  { id: 'collector', gems: 15, check: (d) => bits(d.skin.ownedTrails) >= 8 },
  { id: 'blaze', gems: 20, check: (d) => rankOf(progressScore(d)) >= 5 },
  { id: 'stubborn', gems: 10, check: (d) => d.stats.attempts >= 100 },
];

/** Flow meter levels (presentation; the best reached is saved for an achievement). */
export const FLOW_MAX = 5;

export interface MetaGain {
  achievements: number[];
  gems: number;
  trails: number[];
  rankFrom: number;
  rankTo: number;
}

/**
 * Award everything the save now qualifies for: achievements (with gems) and earned trails.
 * Call after every change to the save, with the rank before the change. Mutates d.
 * Iterates because an achievement's gems/score can unlock a rank achievement in turn.
 */
export function settle(d: SaveData, rankBefore = d.rankSeen): MetaGain {
  const gain: MetaGain = { achievements: [], gems: 0, trails: [], rankFrom: rankBefore, rankTo: rankBefore };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    ACHIEVEMENTS.forEach((a, i) => {
      if (d.achievements & (1 << i) || !a.check(d)) return;
      d.achievements |= 1 << i;
      d.gems += a.gems;
      gain.gems += a.gems;
      gain.achievements.push(i);
      changed = true;
    });
    const rank = rankOf(progressScore(d));
    TRAILS.forEach((t, i) => {
      if (!t.unlock || d.skin.ownedTrails & (1 << i)) return;
      const u = t.unlock;
      const ok = 'rank' in u ? rank >= u.rank : ACHIEVEMENTS.findIndex((a) => a.id === u.achievement) >= 0 && (d.achievements & (1 << ACHIEVEMENTS.findIndex((a) => a.id === u.achievement))) !== 0;
      if (!ok) return;
      d.skin.ownedTrails |= 1 << i;
      gain.trails.push(i);
      changed = true;
    });
    if (!changed) break;
  }
  gain.rankTo = rankOf(progressScore(d));
  if (gain.rankTo > d.rankSeen) d.rankSeen = gain.rankTo;
  return gain;
}

/** Levels 1..LEVEL_COUNT (re-exported for screens). */
export const ALL_LEVELS = LEVEL_COUNT;
