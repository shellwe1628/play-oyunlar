/**
 * The Events tab's two modes (pure): Blitz and Boss Rush. Both are played on their own arena
 * (theme index `MODE_THEME`, in no chapter) with the run's own rules, the selected weapon at its
 * level and the permanent upgrades; `createWorld({ mode })` builds them and world.ts runs them.
 * This file holds their numbers, what unlocks them and what a mode run may write to the save.
 *
 * Blitz: BLITZ.time seconds, plain archers dropping in on the arena's five mesas (BLITZ.field at
 * the start, then one `blitzEvery` seconds after the one before while fewer than BLITZ.cap stand;
 * with the field full the next one drops as one falls), no waves, cards or bosses. Score =
 * knockouts, a knockout by a head hit counts double. The player cannot be knocked out: a hit
 * costs BLITZ.hitCost seconds of the clock instead of health. The archers follow the weapon:
 * their health is BLITZ.hp × the weapon's power (`weaponDamage`: a head hit drops one at every
 * level; body hits: three with a new weapon, two from level 6 on, the hard rules' damage growing
 * a little faster than power), their aim and timing are `blitzLevel`'s, and a stronger weapon
 * brings them sooner (`blitzEvery`): a better weapon means more archers and more knockouts in the
 * minute. Measured with the balance tests' player (CAREFUL, NO_META but the bow's level, 8
 * seeds): 12 to 13 knockouts at level 1 (every archer that came), 18 to 20 at level 10, 24 to 28
 * at level 20; a new player's profile (STARTER) gets about 9 at any level.
 *
 * Boss Rush: the six chapter bosses in chapter order, each on its own boss stage (its ledges, wind
 * and movers) at its chapter's field size, health back to full before each and one card pick (of
 * four) after each. The power rule of the chapters applies with each boss's own chapter
 * (world.ts `underPower`, `bossHurtMul`, rage): the wave number of a rush boss is its chapter's
 * boss wave. The archers' level (aim, timing, damage) is `rushLevel`: gentler than the chapter's,
 * because a rush arrives with at most five cards instead of a chapter's whole hand. Score = bosses
 * beaten, ties broken by the summed fight time (lower is better). Ends on the player's knockout
 * or after the sixth boss.
 *
 * What a mode run earns (the guards, tests/unit/modes.test.ts): a mode run is short and can be
 * started again at once, so it pays little and on purpose. Coins: each knockout's own coins by the
 * run's rule (3 + level / 2, +2 for a head, × the run's coin share) and nothing else: no boss or
 * elite loot, nothing for wave clears, objectives or headshot chains. A wooden run chest when it
 * ends having shot at least once (none on quit), for the first MODE_CHESTS_PER_DAY mode runs of a
 * day only. Nothing else: it is not counted as a run, raises no best wave, chapter, record, boss
 * count, achievement, rank or daily streak, and unlocks no weapon. Its personal best goes to
 * `arsenal.modes`.
 */
import type { ChestKind, ModeSave } from './arsenal';
import { CHAPTERS, levelOf, STAGES, type LedgeDef } from './chapters';
import type { RunBank, SaveData } from './meta';
import { grantRunChest } from './rewards';
import type { Difficulty } from './waves';
import { weaponDamage } from './weapons';
import type { World } from './world';

export type Mode = 'blitz' | 'bossrush';
export const MODES: readonly Mode[] = ['blitz', 'bossrush'];

/** theme index of the modes' arena (Sunset Canyon): one past the chapters' worlds */
export const MODE_THEME = CHAPTERS;

// ---------------------------------------------------------------- blitz

export const BLITZ = {
  /** seconds on the clock */
  time: 60,
  /** seconds a hit on the player takes off the clock */
  hitCost: 3,
  /** archers standing at the start, and the most on the field at once */
  field: 2,
  cap: 4,
  /**
   * seconds between two archers dropping in at weapon level 1; a stronger weapon brings them
   * sooner (÷ damage^pace). With the field full the next one waits and drops as one falls.
   */
  every: 5.2,
  pace: 0.7,
  /** seconds a freshly landed archer waits before its first draw (plus up to `graceJitter`) */
  grace: 1,
  graceJitter: 0.6,
  /** archer health at weapon level 1 (× the weapon's power, `weaponDamage`, at its level) */
  hp: 100,
  /** difficulty levels (aim, timing, weight, coins) gained per weapon level */
  levelStep: 0.15,
  /** extra aim error of a Blitz archer, rad (up to four shoot at once and every hit costs 3 s) */
  wild: 0.3,
} as const;

/**
 * Blitz's field: a little wider than the frame (the renderers pull back to show it, as for the
 * later chapters), so its five mesas stand in three columns with nothing over anyone's head.
 */
export const BLITZ_SPAN = 1.1;

/**
 * The canyon's mesas: five places for archers. Every head and chest is in a straight line of
 * sight from the bow (a boomerang and a rocket fly straight), no mesa is in the way of a shot at
 * another, and an archer that stands in the line to a farther one is simply hit first.
 */
export const BLITZ_LEDGES: readonly LedgeDef[] = [
  { x: 310, y: 845, w: 130 },
  { x: 636, y: 835, w: 130 },
  { x: 462, y: 630, w: 130 },
  { x: 636, y: 380, w: 130 },
  { x: 310, y: 400, w: 130 },
];

/** Difficulty level of Blitz's archers for a weapon level (1 at level 1 … 3.85 at level 20). */
export function blitzLevel(wlevel: number): number {
  return 1 + BLITZ.levelStep * (Math.max(1, wlevel) - 1);
}

/** Health of a Blitz archer for a weapon level. */
export function blitzHp(wlevel: number): number {
  return Math.round(BLITZ.hp * weaponDamage(wlevel));
}

/** Seconds between two archers dropping in, for a weapon level. */
export function blitzEvery(wlevel: number): number {
  return BLITZ.every / weaponDamage(wlevel) ** BLITZ.pace;
}

// ---------------------------------------------------------------- boss rush

/** bosses in a rush (one per chapter, in chapter order) */
export const RUSH_BOSSES = CHAPTERS;

/** The wave a rush boss is played as: its chapter's boss stage (so the chapter's power rule applies). */
export function rushWave(boss: number): number {
  return (Math.max(0, Math.min(RUSH_BOSSES - 1, Math.floor(boss))) + 1) * STAGES;
}

/**
 * hard: how much of the way from the first boss's level to its chapter's own a rush boss's archers
 * are (aim, draw time, damage): levels 3.5, 5.3, 7.4, 9.3, 10.4, 12 instead of 3.5 … 31.8. Measured
 * with the balance tests' player (CAREFUL, NO_META but the bow's level, 16 seeds): at the giant's
 * recommended level 4 the rush got past it in 10 runs at a share of 1, 12 at 0.45 and 15 at 0.3.
 */
export const RUSH_LEVEL_SHARE = 0.3;

/** Difficulty level of rush boss `boss`'s stage (its bow, its summons): see RUSH_LEVEL_SHARE. */
export function rushLevel(boss: number, d: Difficulty = 'classic'): number {
  const own = levelOf(rushWave(boss), d);
  if (d !== 'hard') return own;
  const first = levelOf(rushWave(0), d);
  return first + (own - first) * RUSH_LEVEL_SHARE;
}

// ---------------------------------------------------------------- the save

/** Blitz opens once a run has been played; Boss Rush once the first chapter's boss has been beaten. */
export function modeUnlocked(save: SaveData, mode: Mode): boolean {
  return mode === 'blitz' ? save.runs >= 1 : (save.bosses[0] ?? 0) > 0;
}

export interface ModeResult {
  mode: Mode;
  /** Blitz: knockouts, a head knockout counting double; Boss Rush: bosses beaten */
  score: number;
  /** Boss Rush: summed fight time of the bosses beaten, seconds (0 in Blitz) */
  time: number;
  /** the mode ran to its end (Blitz: the clock; Boss Rush: the player's knockout or the sixth boss) */
  over: boolean;
}

/** A mode world's result so far; null for an ordinary run. */
export function modeResult(w: World): ModeResult | null {
  if (w.blitz) return { mode: 'blitz', score: w.blitz.score, time: 0, over: w.phase === 'over' };
  if (w.rush) return { mode: 'bossrush', score: w.rush.beaten, time: Math.round(w.rush.times.reduce((a, b) => a + b, 0) * 10) / 10, over: w.phase === 'over' };
  return null;
}

/** Whether `r` beats the stored best of its mode (a score of 0 never does). */
export function beatsBest(bests: ModeSave, r: ModeResult): boolean {
  if (r.score <= 0) return false;
  if (r.mode === 'blitz') return r.score > bests.blitz;
  return r.score > bests.rush || (r.score === bests.rush && r.time < bests.rushTime);
}

/**
 * Banks a mode run's coins as a delta (call as the run goes, on pause, on hide and at the end):
 * the only thing a mode run in progress writes. Never counts a run, a wave, a boss or a record.
 */
export function bankMode(save: SaveData, bank: RunBank, w: World): void {
  if (!w.mode) return;
  const delta = w.run.coins - bank.coins;
  if (delta <= 0) return;
  save.coins += delta;
  bank.coins = w.run.coins;
}

/** run chests the modes give in one day (both modes together) */
export const MODE_CHESTS_PER_DAY = 3;

/** Mode run chests still to be had on day `dayKey` ('YYYY-MM-DD'). */
export function modeChestsLeft(save: SaveData, dayKey: string): number {
  const m = save.arsenal.modes;
  return Math.max(0, MODE_CHESTS_PER_DAY - (m.chestDay === dayKey ? m.chestsUsed : 0));
}

export interface ModeOutcome {
  result: ModeResult;
  /** the mode's best after this run (Boss Rush: with its time) */
  best: number;
  bestTime: number;
  newBest: boolean;
  /** the run chest this run queued, null for none */
  chest: ChestKind | null;
}

/**
 * A mode run ended by its own rules (never call it for a quit): banks its coins, queues the run
 * chest once (a wooden one: the least the run rule gives, whatever the score; none for a run that
 * never shot, none once the day's MODE_CHESTS_PER_DAY are taken) and stores a new personal best.
 * Returns null for an ordinary run or one not over.
 */
export function finishMode(save: SaveData, bank: RunBank, w: World, dayKey: string): ModeOutcome | null {
  const result = modeResult(w);
  if (!result || !result.over) return null;
  bankMode(save, bank, w);
  const m = save.arsenal.modes;
  if (w.run.shots > 0 && bank.chest === null && modeChestsLeft(save, dayKey) > 0) {
    if (m.chestDay !== dayKey) {
      m.chestDay = dayKey;
      m.chestsUsed = 0;
    }
    m.chestsUsed += 1;
    grantRunChest(save, bank, 1);
  }
  const newBest = beatsBest(m, result);
  if (newBest) {
    if (result.mode === 'blitz') m.blitz = result.score;
    else {
      m.rush = result.score;
      m.rushTime = result.time;
    }
  }
  return { result, best: result.mode === 'blitz' ? m.blitz : m.rush, bestTime: result.mode === 'blitz' ? 0 : m.rushTime, newBest, chest: bank.chest };
}
