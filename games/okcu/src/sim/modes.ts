/**
 * The Events tab's two modes (pure): Blitz and Boss Rush. Both are played on their own arena
 * (theme index `MODE_THEME`, in no chapter) with the run's own rules, the selected weapon at its
 * level and the permanent upgrades; `createWorld({ mode })` builds them and world.ts runs them.
 * This file holds their numbers, what unlocks them and what a mode run may write to the save.
 *
 * Blitz: BLITZ.time seconds, plain archers dropping in on the arena's five mesas, no waves, cards
 * or bosses. Two to four are on the field: BLITZ.field stand at the start, the next one drops at
 * once whenever fewer than BLITZ.field are on the field (a new one drops as one falls), and one
 * more joins every `blitzEvery` seconds up to BLITZ.cap. Score = knockouts, a knockout by a head
 * hit counts double. The player cannot be knocked out: a hit costs BLITZ.hitCost seconds of the
 * clock instead of health.
 * No bullet sponges: in Blitz a head hit is always a knockout, at every weapon level and with
 * every weapon (world.ts `hitEnemy`), and the archers' health (`blitzHp`) only says how many body
 * hits one takes: three with a new weapon, two from level 4, one from level 10 (the health is the
 * same at every level; the weapon grows). The sling is the exception, because its head hit is
 * worth a chest hit by its own rule: a sling's archers fall to BLITZ.slingHits hits, head or
 * body, at every level. Their aim and timing are `blitzLevel`'s, made wild and unhurried
 * (BLITZ.wild, BLITZ.rest) because several shoot at once and every hit costs three seconds.
 * Measured bands: tests/unit/modes.test.ts pins them (CAREFUL and STARTER, hard, NO_META but the
 * bow's level, seeds 1 … 8, at levels 1, 10 and 20).
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
 * run's rule (3 + level / 2, +2 for a head, × the run's coin share; in Blitz, where knockouts come
 * fast, BLITZ.coinShare of that) and nothing else: no boss or elite loot, nothing for wave clears,
 * objectives or headshot chains. A wooden run chest when it ends having shot at least once (none
 * on quit), for the first MODE_CHESTS_PER_DAY mode runs of a day only (the shop's clock rule: a
 * clock set back a day or two starts no new count, `modeChestsLeft`). Nothing else: it is not
 * counted as a run, raises no best wave, chapter, record, boss count, achievement, rank or daily
 * streak, and unlocks no weapon. Its personal best goes to `arsenal.modes`.
 */
import { DAY_FORMAT, type ChestKind, type ModeSave } from './arsenal';
import { CHAPTERS, levelOf, STAGES, type LedgeDef } from './chapters';
import type { RunBank, SaveData } from './meta';
import { grantRunChest } from './rewards';
import { storedDayHolds } from './shop';
import type { Difficulty } from './waves';
import { ENEMY_DAMAGE } from './combat';
import { weaponDamage, WEAPONS, type WeaponId } from './weapons';
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
  /**
   * the fewest on the field (standing, or on their way down): they stand at the start, and the
   * next archer drops at once whenever there are fewer; and the most on the field at once
   */
  field: 2,
  cap: 4,
  /**
   * seconds until one more archer joins a field that already has `field` (up to `cap`), at
   * weapon level 1; a stronger weapon brings them sooner (÷ damage^pace)
   */
  every: 12,
  pace: 0.5,
  /** seconds a freshly landed archer waits before its first draw (plus up to `graceJitter`) */
  grace: 1,
  graceJitter: 0.6,
  /**
   * archer health against the bow, the same at every weapon level (× the weapon's own damage
   * share, so every weapon needs the bow's count): a body hit (40 × the weapon's damage) takes
   * three with a new weapon, two from level 4, one from level 10. A head hit is always a knockout.
   */
  hp: 110,
  /** the sling (its head hit is worth a chest hit): hits, head or body, a Blitz archer takes at every level */
  slingHits: 2,
  /** share of a knockout's coins a Blitz knockout pays (there are many of them in the minute) */
  coinShare: 0.4,
  /** difficulty levels (aim, timing, weight, coins) gained per weapon level */
  levelStep: 0.15,
  /** extra aim error of a Blitz archer, rad (up to four shoot at once and every hit costs 3 s) */
  wild: 0.45,
  /** extra seconds a Blitz archer rests between two shots */
  rest: 1.5,
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

/**
 * Health of a Blitz archer against `weapon`, whose arrows hit `dmgMul` times as hard as a new bow's
 * (the run's `stats.dmgMul`: the weapon's share, its level, a starting card). It only decides
 * the body hits: BLITZ.hp against the bow at every level (× the weapon's own share, so a spear or
 * a boomerang needs the bow's count), and for the sling just under BLITZ.slingHits of its hits.
 */
export function blitzHp(weapon: WeaponId, dmgMul: number): number {
  if (weapon === 'sling') return Math.round(BLITZ.slingHits * ENEMY_DAMAGE.body * dmgMul * 0.98);
  return Math.round(BLITZ.hp * WEAPONS[weapon].dmgMul);
}

/** Whether a head hit with `weapon` is a knockout in Blitz: with every weapon but the sling. */
export function blitzHeadKo(weapon: WeaponId): boolean {
  return WEAPONS[weapon].headMul >= 1;
}

/** Seconds until one more archer joins a field that is not short of archers, for a weapon level. */
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

/**
 * Blitz opens with the first run (a run is counted when its first arrow flies); Boss Rush once the
 * first chapter's boss has been beaten.
 */
export function modeUnlocked(save: SaveData, mode: Mode): boolean {
  return mode === 'blitz' ? save.runs >= 1 : (save.bosses[0] ?? 0) > 0;
}

/**
 * The mode a run may be started in: `mode` if it is a mode and open on this save, else null (a run
 * of chapters). `testRun`: the app's URL test runs, which leave the save alone, may open either.
 */
export function allowedMode(save: SaveData, mode: Mode | null | undefined, testRun = false): Mode | null {
  if (!mode || !MODES.includes(mode)) return null;
  return testRun || modeUnlocked(save, mode) ? mode : null;
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

/**
 * Mode run chests still to be had on day `dayKey` ('YYYY-MM-DD'), by the shop's clock rule
 * (shop.ts `storedDayHolds`, ruling P): the stored day's count stands on that day and when the
 * device clock is a day or two behind it (going back does not start a new count); any other day
 * starts a new one (a later day, or a stored day more than DAY_SKEW_TOLERANCE days ahead: a clock
 * once set far ahead cannot lock the chests out). A key that is not a day gives none.
 */
export function modeChestsLeft(save: SaveData, dayKey: string): number {
  if (!DAY_FORMAT.test(dayKey)) return 0;
  const m = save.arsenal.modes;
  return Math.max(0, MODE_CHESTS_PER_DAY - (storedDayHolds(m.chestDay, dayKey) ? m.chestsUsed : 0));
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
    // (the stored day's count goes on while it holds, shop.ts `storedDayHolds`; else a new day starts)
    if (!storedDayHolds(m.chestDay, dayKey)) {
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
