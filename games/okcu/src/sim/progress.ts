/**
 * Progress (pure): the progress score and its rank ladder, the records board, achievements
 * and the daily challenge. Everything here is a function of the save (and of a finished or
 * running run's summary), so it is deterministic and tested. No other players exist: the
 * ladder is personal and the records are the player's own bests.
 */
import { createRng, hashSeed } from '@oyun/core/pure';
import { BOW_MAX } from './bow';
import { CHAPTERS, STAGES } from './chapters';
import type { DatedRecord, RunBank, SaveData } from './meta';

// ------------------------------------------------------------------ score

/** Points per thing (the breakdown screen prints these). */
export const SCORE = {
  /** each chapter whose boss has been beaten at least once */
  chapter: 600,
  /** each boss knockout ever (counted up to 50) */
  boss: 40,
  bossCap: 50,
  /** each bow level */
  bow: 80,
  /** each wave of the best wave (counted up to 100) */
  wave: 15,
  waveCap: 100,
  /** each achievement */
  feat: 100,
} as const;

export interface ScoreBreakdown {
  chapters: number;
  bosses: number;
  bow: number;
  wave: number;
  feats: number;
  total: number;
}

export function chaptersCleared(save: SaveData): number {
  let n = 0;
  for (let c = 0; c < CHAPTERS; c++) if ((save.bosses[c] ?? 0) > 0) n += 1;
  return n;
}

export function progressScore(save: SaveData): ScoreBreakdown {
  const kills = save.bosses.reduce((a, b) => a + b, 0);
  const chapters = chaptersCleared(save) * SCORE.chapter;
  const bosses = Math.min(SCORE.bossCap, kills) * SCORE.boss;
  const bow = Math.min(BOW_MAX, save.bow.level) * SCORE.bow;
  const wave = Math.min(SCORE.waveCap, save.best) * SCORE.wave;
  const feats = save.feats.length * SCORE.feat;
  return { chapters, bosses, bow, wave, feats, total: chapters + bosses + bow + wave + feats };
}

export const RANKS = [
  { id: 'recruit', at: 0 },
  { id: 'fletchling', at: 200 },
  { id: 'bowhand', at: 500 },
  { id: 'archer', at: 900 },
  { id: 'marksman', at: 1400 },
  { id: 'sharpshooter', at: 2000 },
  { id: 'ranger', at: 2800 },
  { id: 'hawkeye', at: 3700 },
  { id: 'warden', at: 4800 },
  { id: 'champion', at: 6000 },
  { id: 'legend', at: 7400 },
  { id: 'mythic', at: 9000 },
  // chapters 5 and 6 raised the most a save can score from 9 400 to 11 700
  { id: 'paragon', at: 10200 },
  { id: 'eternal', at: 11400 },
] as const;
export type RankId = (typeof RANKS)[number]['id'];

export function rankOf(score: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i]!.at) r = i;
  return r;
}

/** Points still needed for the next rank (null at the top). */
export function toNextRank(score: number): number | null {
  const r = rankOf(score);
  return r >= RANKS.length - 1 ? null : RANKS[r + 1]!.at - score;
}

/** What a platform `submitScore` call would send (see GAME.md: candidate for core). */
export function scoreSubmission(save: SaveData): { board: string; value: number; rank: RankId; meta: Record<string, number> } {
  const s = progressScore(save);
  return { board: 'okcu-progress', value: s.total, rank: RANKS[rankOf(s.total)]!.id, meta: { best: save.best, bow: save.bow.level, chapters: chaptersCleared(save) } };
}

// ------------------------------------------------------------------ a run's summary

/** What a run did (built by the world; also what the records and achievements read). */
export interface RunSummary {
  reached: number;
  kos: number;
  headChain: number;
  streak: number;
  multi: number;
  focusUses: number;
  /** boss knockouts this run, in order: chapter kind (0 … CHAPTERS − 1) and seconds from wave start */
  bossKills: { kind: number; time: number }[];
  /** furthest stage reached in each chapter this run (8 = cleared) */
  chapterStage: number[];
  /** bonus rounds finished with gold */
  bonusGold: number;
  /** most enemies knocked out by one barrel */
  barrelBest: number;
  /** enemies dropped by cutting a rope */
  ropeDrops: number;
  /** endless waves reached (0 = not in endless) */
  endless: number;
  /** a daily run (records and the ladder still count) */
  daily: boolean;
}

// ------------------------------------------------------------------ achievements

export interface Feat {
  id: string;
  coins: number;
  test: (s: SaveData, r: RunSummary | null) => boolean;
}

export const FEATS: readonly Feat[] = [
  { id: 'firstKo', coins: 20, test: (_s, r) => (r?.kos ?? 0) >= 1 },
  { id: 'chain3', coins: 40, test: (_s, r) => (r?.headChain ?? 0) >= 3 },
  { id: 'chain6', coins: 120, test: (_s, r) => (r?.headChain ?? 0) >= 6 },
  { id: 'double', coins: 30, test: (_s, r) => (r?.multi ?? 0) >= 2 },
  { id: 'triple', coins: 80, test: (_s, r) => (r?.multi ?? 0) >= 3 },
  { id: 'streak10', coins: 100, test: (_s, r) => (r?.streak ?? 0) >= 10 },
  { id: 'boss1', coins: 100, test: (s) => (s.bosses[0] ?? 0) > 0 },
  { id: 'boss2', coins: 150, test: (s) => (s.bosses[1] ?? 0) > 0 },
  { id: 'boss3', coins: 200, test: (s) => (s.bosses[2] ?? 0) > 0 },
  { id: 'boss4', coins: 300, test: (s) => (s.bosses[3] ?? 0) > 0 },
  { id: 'boss5', coins: 400, test: (s) => (s.bosses[4] ?? 0) > 0 },
  { id: 'boss6', coins: 500, test: (s) => (s.bosses[5] ?? 0) > 0 },
  { id: 'allBosses', coins: 600, test: (s) => chaptersCleared(s) >= CHAPTERS },
  { id: 'forge5', coins: 50, test: (s) => s.bow.level >= 5 },
  { id: 'forge10', coins: 150, test: (s) => s.bow.level >= 10 },
  { id: 'forge15', coins: 400, test: (s) => s.bow.level >= 15 },
  { id: 'forge20', coins: 600, test: (s) => s.bow.level >= 20 },
  { id: 'forge25', coins: 1000, test: (s) => s.bow.level >= 25 },
  { id: 'chain10', coins: 250, test: (_s, r) => (r?.headChain ?? 0) >= 10 },
  { id: 'streak20', coins: 250, test: (_s, r) => (r?.streak ?? 0) >= 20 },
  { id: 'gold', coins: 80, test: (_s, r) => (r?.bonusGold ?? 0) > 0 },
  { id: 'focus5', coins: 60, test: (_s, r) => (r?.focusUses ?? 0) >= 5 },
  { id: 'barrel2', coins: 60, test: (_s, r) => (r?.barrelBest ?? 0) >= 2 },
  { id: 'rope', coins: 40, test: (_s, r) => (r?.ropeDrops ?? 0) >= 1 },
  { id: 'daily3', coins: 100, test: (s) => s.dailyStreak >= 3 },
  { id: 'endless', coins: 300, test: (s) => s.chapter >= CHAPTERS },
];

/** Unlock every achievement now earned; their coins are added to the save. Returns the new ids. */
export function unlockFeats(save: SaveData, run: RunSummary | null, bank?: RunBank): string[] {
  const out: string[] = [];
  for (const f of FEATS) {
    if (save.feats.includes(f.id) || !f.test(save, run)) continue;
    save.feats.push(f.id);
    save.coins += f.coins;
    out.push(f.id);
    bank?.feats.push(f.id);
  }
  return out;
}

// ------------------------------------------------------------------ records and chapter progress

function better(r: DatedRecord, n: number, date: string, lowerIsBetter = false): boolean {
  const beat = lowerIsBetter ? n > 0 && (r.n === 0 || n < r.n) : n > r.n;
  if (beat) {
    r.n = n;
    r.date = date;
  }
  return beat;
}

/**
 * Write a run's progress into the save: furthest chapter, boss knockouts (as a delta from what
 * this run already banked), the records board. Returns the record names that were beaten.
 */
export function bankRecords(save: SaveData, bank: RunBank, r: RunSummary, date: string): string[] {
  const beaten: string[] = [];
  const reachedChapter = Math.min(CHAPTERS, Math.floor((r.reached - 1) / STAGES));
  if (!r.daily && reachedChapter > save.chapter) save.chapter = reachedChapter;
  for (let i = bank.bosses; i < r.bossKills.length; i++) {
    const k = r.bossKills[i]!;
    save.bosses[k.kind] = (save.bosses[k.kind] ?? 0) + 1;
    if (better(save.records.bossTime[k.kind]!, Math.round(k.time * 10) / 10, date, true)) beaten.push(`bossTime${k.kind}`);
  }
  bank.bosses = r.bossKills.length;
  r.chapterStage.forEach((st, c) => {
    if (c < CHAPTERS && better(save.records.chapter[c]!, st, date)) beaten.push(`chapter${c}`);
  });
  if (better(save.records.headChain, r.headChain, date)) beaten.push('headChain');
  if (better(save.records.streak, r.streak, date)) beaten.push('streak');
  if (better(save.records.runKos, r.kos, date)) beaten.push('runKos');
  if (better(save.records.endless, r.endless, date)) beaten.push('endless');
  return beaten;
}

// ------------------------------------------------------------------ daily challenge

export type DailyMod = 'wind' | 'fire' | 'giants' | 'heads';
export const DAILY_MODS: readonly DailyMod[] = ['wind', 'fire', 'giants', 'heads'];

export interface DailyChallenge {
  mod: DailyMod;
  /** reach this wave to complete the day */
  goal: number;
}

export function dailyChallenge(dateKey: string): DailyChallenge {
  const r = createRng(hashSeed(`okcu-challenge-${dateKey}`));
  return { mod: DAILY_MODS[r.int(0, DAILY_MODS.length - 1)]!, goal: r.int(5, 8) };
}

/** The calendar day before a 'YYYY-MM-DD' key. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Coins for completing the day's challenge with a streak of `streak` days. */
export function dailyReward(streak: number): number {
  return 25 + 10 * Math.min(7, Math.max(1, streak));
}

/**
 * The daily's best and its challenge: the first time today's goal is met, the streak grows
 * (or restarts at 1 after a missed day) and the reward is paid. Returns the reward (0 if none).
 */
export function bankDailyChallenge(save: SaveData, key: string, reached: number): number {
  if (save.dailyDate !== key) {
    save.dailyDate = key;
    save.dailyBest = 0;
  }
  save.dailyBest = Math.max(save.dailyBest, reached);
  const ch = dailyChallenge(key);
  if (save.dailyDone === key || reached < ch.goal) return 0;
  save.dailyStreak = save.dailyDone === previousDay(key) ? save.dailyStreak + 1 : 1;
  save.dailyDone = key;
  const coins = dailyReward(save.dailyStreak);
  save.coins += coins;
  return coins;
}

/** The streak as it stands today (a missed day shows 0 until the goal is met again). */
export function liveStreak(save: SaveData, today: string): number {
  return save.dailyDone === today || save.dailyDone === previousDay(today) ? save.dailyStreak : 0;
}
