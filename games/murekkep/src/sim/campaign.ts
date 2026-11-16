/**
 * Campaign sheets, the daily sheet and star rules (pure).
 */
import { createRng, hashSeed } from '@oyun/core/pure';
import { generateMap, type GameMap, type MapSize } from './mapgen';
import { PERSONALITIES, type ColonySpec, type Personality } from './match';
import { RULES } from './rules';

export interface BotDef {
  personality: Personality;
  difficulty: number;
}

export interface LevelDef {
  /** 'c1'..'c8' or 'daily-YYYY-MM-DD'. */
  id: string;
  /** Campaign index 0..7, or -1 for the daily sheet. */
  index: number;
  seed: number;
  size: MapSize;
  bots: BotDef[];
  /** Par time for the second star, game seconds. */
  parSeconds: number;
  /** The player gets the start with the most room (early sheets: no worst-corner starts). */
  fairStart?: boolean;
}

const T = (difficulty: number): BotDef => ({ personality: 'turtle', difficulty });
const R = (difficulty: number): BotDef => ({ personality: 'rusher', difficulty });
const O = (difficulty: number): BotDef => ({ personality: 'opportunist', difficulty });

/** Full sheet (aspect matched to the portrait play area; see GAME.md "Built"). */
export const FULL_SIZE: MapSize = { width: 48, height: 66 };

export const CAMPAIGN: readonly LevelDef[] = [
  { id: 'c1', index: 0, seed: 1101, size: { width: 30, height: 41 }, bots: [T(0)], parSeconds: 150, fairStart: true },
  { id: 'c2', index: 1, seed: 2203, size: { width: 32, height: 44 }, bots: [T(0), O(0)], parSeconds: 150, fairStart: true },
  { id: 'c3', index: 2, seed: 3301, size: { width: 36, height: 50 }, bots: [T(0), O(0), T(1)], parSeconds: 170, fairStart: true },
  { id: 'c4', index: 3, seed: 4409, size: { width: 38, height: 52 }, bots: [R(1), O(0), T(1)], parSeconds: 180 },
  { id: 'c5', index: 4, seed: 5501, size: { width: 40, height: 55 }, bots: [T(1), R(1), O(0), R(0)], parSeconds: 190 },
  { id: 'c6', index: 5, seed: 6607, size: { width: 44, height: 60 }, bots: [O(1), T(1), R(1), O(2)], parSeconds: 200 },
  { id: 'c7', index: 6, seed: 7703, size: { width: 46, height: 63 }, bots: [O(2), T(2), R(2), T(1), O(1)], parSeconds: 210 },
  { id: 'c8', index: 7, seed: 8807, size: FULL_SIZE, bots: [T(3), O(3), R(2), T(3), O(2)], parSeconds: 220 },
];

/** Campaign map index from which the Blot power is available (unlocked by winning map 3). */
export const BLOT_UNLOCK_AFTER = 2;

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: { getFullYear(): number; getMonth(): number; getDate(): number }): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The daily sheet: full size, 3–4 medium bots, everything seeded by the date. */
export function dailyLevel(date: string): LevelDef {
  const seed = hashSeed(`murekkep-daily-${date}`);
  const rng = createRng(seed);
  const count = rng.int(3, 4);
  const bots: BotDef[] = [];
  for (let i = 0; i < count; i++) bots.push({ personality: rng.pick(PERSONALITIES), difficulty: rng.int(1, 2) });
  return { id: `daily-${date}`, index: -1, seed, size: FULL_SIZE, bots, parSeconds: 200 };
}

const maps = new Map<string, GameMap>();

/** The level's sheet (cached; generation is deterministic). */
export function levelMap(def: LevelDef): GameMap {
  let m = maps.get(def.id);
  if (!m) {
    m = generateMap(def.seed, def.size, def.bots.length + 1, def.id);
    maps.set(def.id, m);
  }
  return m;
}

/** Match options for a sheet (Blot is decided by the scene from the save). */
export function levelOptions(def: LevelDef, blot = false): { fairStart: boolean; blot: boolean } {
  return { fairStart: def.fairStart ?? false, blot };
}

/** Colony specs: the player is colony 0, bots follow. */
export function levelSpecs(def: LevelDef, player: ColonySpec = { kind: 'player' }): ColonySpec[] {
  return [player, ...def.bots.map((b): ColonySpec => ({ kind: 'bot', personality: b.personality, difficulty: b.difficulty }))];
}

export interface MatchOutcome {
  won: boolean;
  ticks: number;
  droppedBelowHalfPeak: boolean;
}

export function matchSeconds(ticks: number): number {
  return ticks / RULES.tickHz;
}

/** 0..3: win; win under par; win without ever dropping below half of the peak territory. */
export function starsFor(o: MatchOutcome, parSeconds: number): number {
  if (!o.won) return 0;
  let s = 1;
  if (matchSeconds(o.ticks) <= parSeconds) s++;
  if (!o.droppedBelowHalfPeak) s++;
  return s;
}

/** Per-star breakdown for the result screen. */
export function starFlags(o: MatchOutcome, parSeconds: number): [boolean, boolean, boolean] {
  return [o.won, o.won && matchSeconds(o.ticks) <= parSeconds, o.won && !o.droppedBelowHalfPeak];
}
