/**
 * Run structure (pure): six chapters of seven stages, each in its own themed world, then
 * endless. Stage 4 brings the chapter's elite, stage 7 its boss; a bonus round follows every
 * chapter. Every stage lists its enemies, ledges (some slide, swing on a rope or bob on lava)
 * and props. Chapter 5 (Ember Caldera) adds ledges that rise and sink on the lava; chapter 6
 * (Sky Citadel) adds gusts that turn the wind around mid-stage.
 *
 * New enemy classes join as the run goes: the volley archer (high arcs of three arrows) from
 * chapter 3, the wizard (a homing hex orb, and it blinks to another ledge when hit) from
 * chapter 4. The field grows (see `fieldSpan`; classic from chapter 4, hard from chapter 2):
 * the islands spread wider and higher, a fifth island appears where there is room, and both
 * renderers pull the camera back to show it all.
 *
 * hard (the 3D build) plays some stages in its own version (`StageDef.hard`): stage features that
 * favour each weapon, placed by design. Plate-armoured archers from chapter 2 (the spear and the
 * rocket go through their armour), archers lined up behind a cover wall (the boomerang and the
 * sling), healers in pairs on close islands (the rocket's burst) and one or two stages a chapter
 * with a modifier (`StageMod`). Every one of them stays clearable with the bow.
 */
import type { Rng } from '@oyun/core/pure';
import type { EnemyType } from './combat';
import type { Difficulty } from './waves';

export const STAGES = 7;
export const CHAPTERS = 6;
/** first wave of endless mode */
export const ENDLESS_WAVE = CHAPTERS * STAGES + 1;

export type BossKind = 'shields' | 'giant' | 'summoner' | 'warden' | 'magma' | 'tempest';
export type BonusKind = 'gallery' | 'apples' | 'defend';
export type ObjectiveKind = 'noHit' | 'fast' | 'heads' | 'multi';

export interface LedgeDef {
  x: number;
  y: number;
  w: number;
  h?: number;
  /** slides left and right: amplitude px, angular speed rad/s */
  slide?: { amp: number; speed: number };
  /** hangs on a rope from the top of the sky and swings: amplitude px, angular speed rad/s */
  swing?: { amp: number; speed: number };
  /** rises and sinks (floats on the lava): amplitude px, angular speed rad/s */
  bob?: { amp: number; speed: number };
}

export type PropDef = { kind: 'barrel'; on: number } | { kind: 'rock'; above: number };

/**
 * Stage modifiers (hard only): a rock ceiling that stops every projectile above it (no high
 * lobs), fog that hides the far archers for a while (world.ts FOG), and the player's own ledge
 * sliding to and fro.
 */
export type StageMod = 'lowCeiling' | 'fog' | 'movingBase';

export interface StageDef {
  enemies: EnemyType[];
  ledges: readonly LedgeDef[];
  props?: readonly PropDef[];
  /** wind strength in px/s² (sign is seeded per run) */
  wind?: number;
  /** gusts: the wind turns around every this many seconds of play (needs wind) */
  gust?: number;
  boss?: BossKind;
  elite?: boolean;
  mod?: StageMod;
  /** hard (the 3D build): what this stage changes there (see `stageDef`) */
  hard?: Partial<Omit<StageDef, 'hard' | 'boss' | 'elite'>>;
}

export interface ChapterDef {
  id: 'meadow' | 'snow' | 'desert' | 'night' | 'volcano' | 'sky';
  theme: number;
  boss: BossKind;
  bonus: BonusKind;
  stages: readonly StageDef[];
}

const A = [
  { x: 430, y: 860, w: 170 },
  { x: 520, y: 640, w: 180 },
  { x: 318, y: 488, w: 150 },
  { x: 528, y: 360, w: 170 },
] as const;
const B = [
  { x: 392, y: 800, w: 160 },
  { x: 560, y: 590, w: 150 },
  { x: 396, y: 420, w: 150 },
  { x: 566, y: 944, w: 140 },
] as const;
const C = [
  { x: 474, y: 900, w: 160 },
  { x: 326, y: 668, w: 150 },
  { x: 540, y: 500, w: 160 },
  { x: 372, y: 352, w: 150 },
] as const;
/** the boss arena: one wide ledge and two small ones (+ a third for summons) */
const BOSS = [
  { x: 410, y: 770, w: 290, h: 72 },
  { x: 322, y: 470, w: 140 },
  { x: 560, y: 410, w: 140 },
  { x: 330, y: 300, w: 130 },
] as const;

/** the caldera: basalt pillars standing out of the lava, stepped up toward the back */
const D = [
  { x: 448, y: 880, w: 150 },
  { x: 560, y: 690, w: 140 },
  { x: 340, y: 560, w: 140 },
  { x: 520, y: 400, w: 150 },
] as const;
/** the citadel: cloud islands in a zig-zag, two of them close to the top of the sky */
const E = [
  { x: 360, y: 840, w: 150 },
  { x: 556, y: 760, w: 140 },
  { x: 440, y: 560, w: 150 },
  { x: 340, y: 380, w: 140 },
] as const;

/** a cave: low islands only, under a ceiling (lowCeiling stages) */
const CAVE = [
  { x: 470, y: 900, w: 160 },
  { x: 330, y: 720, w: 140 },
  { x: 560, y: 660, w: 150 },
  { x: 420, y: 560, w: 140 },
] as const;
/**
 * three islands in a row, the near one low behind its cover wall, the other two a step up and
 * in line behind it (the boomerang, the sling and the spear take them together), and a high one.
 * A flat bolt still clears the wall to the second and third (it passes 25 px over its top).
 */
const ROW = [
  { x: 320, y: 860, w: 120 },
  { x: 470, y: 730, w: 120 },
  { x: 610, y: 700, w: 110 },
  { x: 440, y: 430, w: 150 },
] as const;
/** two pairs of close islands: a rocket's burst between them catches both (healer pairs) */
const PAIRS = [
  { x: 420, y: 830, w: 110 },
  { x: 560, y: 810, w: 110 },
  { x: 390, y: 480, w: 110 },
  { x: 530, y: 460, w: 110 },
] as const;

const slide = (l: LedgeDef, amp = 60, speed = 0.9): LedgeDef => ({ ...l, w: Math.min(l.w, 150), slide: { amp, speed } });
const swing = (l: LedgeDef, amp = 55, speed = 1.1): LedgeDef => ({ ...l, w: Math.min(l.w, 140), swing: { amp, speed } });
const bob = (l: LedgeDef, amp = 42, speed = 1): LedgeDef => ({ ...l, bob: { amp, speed } });
const with_ = (base: readonly LedgeDef[], i: number, f: (l: LedgeDef) => LedgeDef): LedgeDef[] => base.map((l, k) => (k === i ? f(l) : { ...l }));

export const CHAPTER_DEFS: readonly ChapterDef[] = [
  {
    id: 'meadow',
    theme: 0,
    boss: 'shields',
    bonus: 'gallery',
    stages: [
      { enemies: ['archer'], ledges: A },
      { enemies: ['archer', 'archer'], ledges: B },
      { enemies: ['shield', 'archer'], ledges: C, props: [{ kind: 'barrel', on: 1 }] },
      { enemies: ['elite'], ledges: A, elite: true, props: [{ kind: 'barrel', on: 0 }] },
      { enemies: ['jumper', 'healer'], ledges: B, hard: { mod: 'movingBase' } },
      { enemies: ['shield', 'healer'], ledges: C, props: [{ kind: 'barrel', on: 0 }, { kind: 'barrel', on: 1 }] },
      { enemies: ['boss'], ledges: BOSS, boss: 'shields' },
    ],
  },
  {
    id: 'snow',
    theme: 1,
    boss: 'giant',
    bonus: 'apples',
    stages: [
      { enemies: ['archer', 'archer'], ledges: with_(A, 1, (l) => slide(l)), wind: 150 },
      { enemies: ['bomber', 'archer'], ledges: B, props: [{ kind: 'rock', above: 1 }], wind: 170, hard: { mod: 'fog' } },
      { enemies: ['shield', 'jumper', 'archer'], ledges: with_(C, 2, (l) => slide(l, 55, 1.1)), wind: 190, hard: { enemies: ['shield', 'jumper', 'armored'] } },
      { enemies: ['elite', 'bomber'], ledges: A, elite: true, props: [{ kind: 'rock', above: 0 }], wind: 200 },
      {
        enemies: ['archer', 'bomber', 'shield'],
        ledges: with_(with_(B, 0, (l) => slide(l, 50)), 2, (l) => slide(l, 60, 1.2)),
        wind: 220,
        hard: { enemies: ['armored', 'bomber', 'archer'], ledges: with_(CAVE, 1, (l) => slide(l, 40)), mod: 'lowCeiling' },
      },
      { enemies: ['jumper', 'archer', 'bomber', 'archer'], ledges: with_(C, 1, (l) => slide(l, 50, 1)), props: [{ kind: 'rock', above: 3 }], wind: 240, hard: { enemies: ['jumper', 'armored', 'bomber', 'archer'] } },
      { enemies: ['boss'], ledges: with_(BOSS, 0, (l) => ({ ...l, w: 220, slide: { amp: 70, speed: 0.6 } })), boss: 'giant', wind: 160 },
    ],
  },
  {
    id: 'desert',
    theme: 2,
    boss: 'summoner',
    bonus: 'defend',
    stages: [
      { enemies: ['cover', 'archer'], ledges: A },
      { enemies: ['archer', 'archer'], ledges: with_(B, 1, (l) => swing(l)) },
      { enemies: ['catcher', 'archer'], ledges: C, props: [{ kind: 'barrel', on: 1 }], hard: { enemies: ['catcher', 'armored', 'archer'], ledges: CAVE, mod: 'lowCeiling' } },
      { enemies: ['elite', 'cover', 'archer'], ledges: with_(A, 2, (l) => swing(l, 45)), elite: true },
      { enemies: ['catcher', 'cover', 'bomber'], ledges: B, props: [{ kind: 'barrel', on: 2 }], hard: { enemies: ['cover', 'archer', 'armored', 'bomber'], ledges: ROW, props: [] } },
      { enemies: ['volley', 'catcher', 'cover', 'archer'], ledges: with_(with_(C, 2, (l) => swing(l, 50, 0.9)), 3, (l) => swing(l, 40, 1.3)), hard: { mod: 'fog' } },
      { enemies: ['boss'], ledges: BOSS, boss: 'summoner' },
    ],
  },
  {
    id: 'night',
    theme: 3,
    boss: 'warden',
    bonus: 'gallery',
    stages: [
      { enemies: ['ward', 'archer'], ledges: A },
      { enemies: ['ward', 'healer', 'mage'], ledges: with_(B, 1, (l) => slide(l)), hard: { mod: 'fog' } },
      { enemies: ['catcher', 'ward', 'bomber'], ledges: with_(C, 2, (l) => swing(l)), props: [{ kind: 'rock', above: 1 }] },
      { enemies: ['elite', 'healer', 'ward'], ledges: A, elite: true, props: [{ kind: 'barrel', on: 1 }] },
      { enemies: ['cover', 'mage', 'jumper', 'volley'], ledges: with_(with_(B, 0, (l) => slide(l, 50)), 1, (l) => swing(l, 50)), hard: { enemies: ['cover', 'mage', 'armored', 'volley'], mod: 'movingBase' } },
      { enemies: ['ward', 'catcher', 'healer', 'bomber'], ledges: C, props: [{ kind: 'rock', above: 0 }, { kind: 'barrel', on: 2 }], hard: { enemies: ['healer', 'archer', 'healer', 'armored'], ledges: PAIRS, props: [] } },
      { enemies: ['boss'], ledges: BOSS, boss: 'warden' },
    ],
  },
  {
    id: 'volcano',
    theme: 4,
    boss: 'magma',
    bonus: 'defend',
    stages: [
      { enemies: ['bomber', 'archer'], ledges: with_(D, 1, (l) => bob(l)) },
      { enemies: ['shield', 'bomber', 'archer'], ledges: with_(D, 0, (l) => bob(l, 36, 1.2)), props: [{ kind: 'rock', above: 2 }] },
      {
        enemies: ['volley', 'jumper', 'bomber'],
        ledges: with_(D, 2, (l) => bob(l, 48, 0.9)),
        props: [{ kind: 'barrel', on: 1 }],
        hard: { enemies: ['armored', 'jumper', 'bomber'], ledges: with_(CAVE, 2, (l) => bob(l, 30, 0.9)), mod: 'lowCeiling' },
      },
      { enemies: ['elite', 'bomber', 'healer'], ledges: with_(D, 2, (l) => bob(l, 40, 1.1)), elite: true, props: [{ kind: 'barrel', on: 0 }] },
      { enemies: ['catcher', 'bomber', 'cover', 'mage'], ledges: with_(with_(D, 0, (l) => bob(l, 34, 1.3)), 3, (l) => bob(l, 46, 0.8)), hard: { enemies: ['cover', 'archer', 'armored', 'mage'], ledges: with_(ROW, 3, (l) => bob(l, 40, 0.8)) } },
      {
        enemies: ['ward', 'bomber', 'healer', 'jumper'],
        ledges: with_(with_(D, 1, (l) => bob(l, 44, 1.2)), 2, (l) => slide(l, 50, 1)),
        props: [{ kind: 'rock', above: 0 }, { kind: 'barrel', on: 1 }],
        hard: { enemies: ['ward', 'armored', 'healer', 'jumper'], mod: 'fog' },
      },
      { enemies: ['boss'], ledges: with_(with_(BOSS, 1, (l) => bob(l, 40, 0.9)), 2, (l) => bob(l, 36, 1.2)), boss: 'magma' },
    ],
  },
  {
    id: 'sky',
    theme: 5,
    boss: 'tempest',
    bonus: 'apples',
    stages: [
      { enemies: ['archer', 'archer', 'catcher'], ledges: E, wind: 170, gust: 6 },
      { enemies: ['shield', 'mage', 'archer'], ledges: with_(E, 0, (l) => slide(l, 45, 1)), wind: 180, gust: 5.5 },
      { enemies: ['jumper', 'bomber', 'healer', 'volley'], ledges: with_(E, 2, (l) => swing(l, 50)), wind: 190, gust: 5, props: [{ kind: 'rock', above: 0 }], hard: { enemies: ['jumper', 'armored', 'healer', 'volley'], mod: 'fog' } },
      { enemies: ['elite', 'ward', 'catcher'], ledges: with_(E, 2, (l) => swing(l, 45, 1.2)), elite: true, wind: 200, gust: 5 },
      { enemies: ['cover', 'catcher', 'bomber', 'ward'], ledges: with_(with_(E, 0, (l) => slide(l, 45)), 3, (l) => swing(l, 45, 1.3)), wind: 210, gust: 4.5, props: [{ kind: 'barrel', on: 2 }], hard: { mod: 'movingBase' } },
      {
        enemies: ['healer', 'shield', 'jumper', 'bomber'],
        ledges: with_(with_(E, 1, (l) => bob(l, 40)), 2, (l) => swing(l, 50, 1)),
        wind: 220,
        gust: 4,
        props: [{ kind: 'rock', above: 3 }],
        hard: { enemies: ['healer', 'armored', 'healer', 'bomber'], ledges: with_(PAIRS, 0, (l) => bob(l, 30)), props: [] },
      },
      { enemies: ['boss'], ledges: with_(BOSS, 1, (l) => slide(l, 30, 0.9)), boss: 'tempest', wind: 200 },
    ],
  },
];

export interface StagePos {
  /** 0 … CHAPTERS − 1 a chapter, CHAPTERS endless */
  chapter: number;
  /** 1 … 7 */
  stage: number;
  endless: boolean;
  /** world theme 0 … CHAPTERS − 1 */
  theme: number;
}

export function stageOf(wave: number): StagePos {
  const w = Math.max(1, Math.floor(wave));
  if (w < ENDLESS_WAVE) {
    const chapter = Math.floor((w - 1) / STAGES);
    return { chapter, stage: ((w - 1) % STAGES) + 1, endless: false, theme: CHAPTER_DEFS[chapter]!.theme };
  }
  const k = w - ENDLESS_WAVE;
  return { chapter: CHAPTERS, stage: (k % STAGES) + 1, endless: true, theme: Math.floor(k / STAGES) % CHAPTERS };
}

/**
 * The power (`powerOf`, arsenal.ts) recommended for each chapter, 0 … CHAPTERS − 1. Measured
 * once (2026-11-21) with the balance tests' player: CAREFUL, 'hard', NO_META but for the bow at
 * level L, seeds 1 … 8 (rng 1000 + seed), `startChapter` c to `untilWave chapterStart(c + 1)`;
 * the lowest L (binary search, never below the previous chapter's) at which ≥ 6 of 8 runs clear
 * the chapter: 1, 4, 8, 14, 14, 14. Chapters 5 and 6 already clear at chapter 4's level, so they
 * are set one level above the chapter before (15, 16) to keep the ladder rising. The numbers are
 * powerOf at those levels with no shop levels: round(100 × weaponDamage(L)).
 */
export const RECOMMENDED_LEVEL: readonly number[] = [1, 4, 8, 14, 15, 16];
export const RECOMMENDED_POWER: readonly number[] = [100, 132, 174, 252, 265, 278];

/** First wave of a chapter (CHAPTERS = endless). */
export function chapterStart(chapter: number): number {
  return Math.max(0, Math.min(CHAPTERS, chapter)) * STAGES + 1;
}

/**
 * Difficulty level at each chapter's first stage, and its rise per stage. Chapters 5 and 6
 * carry on from chapter 4's last stage (23): the caldera at +0.5 a stage (its bombs and
 * floating ledges are the test), the citadel at +0.8, so neither opens with a cliff (the
 * 'hard' curves also flatten above HARD_LATE_LEVEL, see waves.ts).
 */
export const LEVEL_BASE: readonly number[] = [1, 3.5, 10.5, 17, 23.5, 27];
export const LEVEL_STEP: readonly number[] = [0.2, 1, 1, 1, 0.5, 0.8];
/**
 * hard (the 3D build): the meadow opens a step up and climbs three times as fast as classic's
 * (1.6 … 3.46, just under the snow's 3.5), so the first stages already shoot back with intent.
 */
export const HARD_MEADOW_BASE = 1.6;
export const HARD_MEADOW_STEP = 0.31;
/** hard: the regular stages of the first two chapters bring one more archer (see `stageEnemies`) */
export const HARD_EXTRA_UNTIL_CHAPTER = 2;
/** hard: in the meadow the extra archer joins from this stage (after the elite; the opening stages stay a warm-up) */
export const HARD_EXTRA_FROM_STAGE = 5;
/** endless: the level after the last chapter, +1 per wave */
export const ENDLESS_LEVEL = 32.5;

/**
 * Difficulty level of a wave: drives enemy health, damage, aim and timing (the same curves
 * the slice used per wave). The first chapter is a gentle ramp; later chapters climb fast.
 */
export function levelOf(wave: number, d: Difficulty = 'classic'): number {
  const p = stageOf(wave);
  if (d === 'hard' && !p.endless && p.chapter === 0) return HARD_MEADOW_BASE + HARD_MEADOW_STEP * (p.stage - 1);
  if (!p.endless) return LEVEL_BASE[p.chapter]! + LEVEL_STEP[p.chapter]! * (p.stage - 1);
  return ENDLESS_LEVEL + (wave - ENDLESS_WAVE);
}

const ENDLESS_POOL: readonly { type: EnemyType; weight: number }[] = [
  { type: 'archer', weight: 5 },
  { type: 'shield', weight: 2 },
  { type: 'jumper', weight: 2 },
  { type: 'bomber', weight: 2 },
  { type: 'healer', weight: 1 },
  { type: 'cover', weight: 2 },
  { type: 'catcher', weight: 2 },
  { type: 'ward', weight: 2 },
  { type: 'volley', weight: 2 },
  { type: 'mage', weight: 2 },
];

/** hard's endless pool: the same, and the plate-armoured archer */
const HARD_ENDLESS_POOL: readonly { type: EnemyType; weight: number }[] = [...ENDLESS_POOL, { type: 'armored', weight: 2 }];

function pick(rng: Rng, d: Difficulty): EnemyType {
  const pool = d === 'hard' ? HARD_ENDLESS_POOL : ENDLESS_POOL;
  let roll = rng.next() * pool.reduce((s, p) => s + p.weight, 0);
  for (const p of pool) {
    roll -= p.weight;
    if (roll < 0) return p.type;
  }
  return 'archer';
}

const ENDLESS_BOSSES: readonly BossKind[] = ['shields', 'giant', 'summoner', 'warden', 'magma', 'tempest'];

/**
 * The stage to play at a wave (endless stages are drawn from the wave rng). hard plays a
 * chapter stage with its `hard` changes laid over it; classic never sees a modifier.
 */
export function stageDef(wave: number, rng: Rng, d: Difficulty = 'classic'): StageDef {
  const p = stageOf(wave);
  if (!p.endless) {
    const def = CHAPTER_DEFS[p.chapter]!.stages[p.stage - 1]!;
    if (d !== 'hard' || !def.hard) return def;
    const { hard, ...rest } = def;
    return { ...rest, ...hard };
  }
  const cycle = Math.floor((wave - ENDLESS_WAVE) / STAGES);
  const bases = p.theme === 4 ? [D, B, C] : p.theme === 5 ? [E, A, C] : [A, B, C];
  if (p.stage === STAGES) {
    const boss = ENDLESS_BOSSES[cycle % ENDLESS_BOSSES.length]!;
    const def = CHAPTER_DEFS[ENDLESS_BOSSES.indexOf(boss)]!.stages[STAGES - 1]!;
    return { ...def, enemies: ['boss', ...(cycle > 0 ? [pick(rng, d)] : [])] };
  }
  const n = Math.min(4, 3 + Math.floor(cycle / 2));
  const enemies: EnemyType[] = [];
  if (p.stage === 4) enemies.push('elite');
  while (enemies.length < n) enemies.push(pick(rng, d));
  let ledges: LedgeDef[] = bases[(wave + cycle) % 3]!.map((l) => ({ ...l }));
  const mover = rng.int(0, 3);
  const r = rng.next();
  // the caldera's world floats its ledges on the lava; the others slide or swing them
  if (p.theme === 4 && r < 0.65) ledges = with_(ledges, mover, (l) => bob(l, 40));
  else if (r < 0.35) ledges = with_(ledges, mover, (l) => slide(l, 55));
  else if (r < 0.65) ledges = with_(ledges, mover, (l) => swing(l));
  const props: PropDef[] = [];
  if (rng.chance(0.5)) props.push({ kind: 'barrel', on: rng.int(0, n - 1) });
  if (rng.chance(0.4)) props.push({ kind: 'rock', above: rng.int(0, n - 1) });
  const def: StageDef = { enemies, ledges, props, elite: p.stage === 4 };
  if (p.theme === 1 || p.theme === 5 || rng.chance(0.2)) def.wind = 160 + 15 * Math.min(8, cycle) + rng.range(0, 60);
  if (p.theme === 5) def.gust = 5;
  return def;
}

/** Objectives on regular stages (not the first stage of a run, elites and bosses). */
export function objectiveFor(wave: number, rng: Rng): ObjectiveKind | null {
  const p = stageOf(wave);
  if (wave <= 2 || p.stage === 4 || p.stage === STAGES) return null;
  const kinds: readonly ObjectiveKind[] = ['noHit', 'fast', 'heads', 'multi'];
  return kinds[rng.int(0, kinds.length - 1)]!;
}

/** The bonus round after a chapter's boss (none after an endless boss). */
export function bonusAfter(wave: number): BonusKind | null {
  const p = stageOf(wave);
  if (p.stage !== STAGES || p.endless) return null;
  return CHAPTER_DEFS[p.chapter]!.bonus;
}

// ---------------------------------------------------------------- the growing field

/** classic: the field grows from this wave on (chapter 4, the second half of the run; hard widens from chapter 2, see HARD_SPANS) */
export const GROW_WAVE = 3 * STAGES + 1;
/**
 * How much bigger the field is than the 720 × 1280 frame at a wave. classic: 1 for chapters
 * 1 … 3, 1.15 for chapters 4 and 5, 1.22 for chapter 6 and endless; hard: HARD_SPANS, a little
 * wider every chapter from the second. Renderers show a window
 * `span` times the frame (anchored at the bottom left, where the player stands), so on a
 * portrait phone the view reaches x 0 … 720·span and y 1280·(1 − span) … 1280.
 */
export function fieldSpan(wave: number, d: Difficulty = 'classic'): number {
  if (d === 'hard') return HARD_SPANS[Math.min(CHAPTERS, stageOf(wave).chapter)]!;
  if (wave < GROW_WAVE) return 1;
  return stageOf(wave).chapter >= 5 ? 1.22 : 1.15;
}
/**
 * hard (the 3D build): the field widens a little every chapter from the second, 1.3 in endless
 * (never narrower than classic's; classic keeps its own values above).
 */
const HARD_SPANS: readonly number[] = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
/** the biggest span a hard wave uses */
export const HARD_MAX_SPAN = 1.3;
/** the biggest span any classic wave uses (renderers size their bakes for it) */
export const MAX_SPAN = 1.22;

/** Logical x of the right edge of the view at `span`. */
export const fieldRight = (span: number): number => 720 * span;
/** Logical y of the top edge of the view at `span`. */
export const fieldTop = (span: number): number => 1280 * (1 - span);

/**
 * The point every layout spreads from: the player's bow. Scaling the islands about it keeps
 * every straight line of sight (and, near enough, every arc) that was clear before clear after.
 */
const BOW_X = 150;
const BOW_Y = 880;
/** islands below the bow's height stay above this (clear of the bottom of the view) */
const LOW_Y = 1000;
/** the islands stay this far inside the view's right edge (and above its top, room for archers) */
const EDGE_PAD = 26;
const TOP_PAD = 230;
/** no island top above this: a full-power arrow (1750 px/s) still reaches a head on it */
const HIGHEST = 140;
/**
 * spots tried, in order, for the fifth island of a grown field (fractions of the view): all on
 * the far side, middle heights first (an island between the player and the archers, or too
 * high, would only get in the way)
 */
const EXTRA_SPOTS: readonly (readonly [number, number])[] = [0.45, 0.5, 0.4, 0.55, 0.35, 0.6, 0.3, 0.65, 0.25, 0.7].flatMap((fy) => [[0.86, fy] as const, [0.76, fy] as const]);

/**
 * A stage's islands on a grown field: spread away from the player (scaled about the bow, so the
 * layout keeps its shape and its lines of fire), kept inside the view with room for their
 * movement, plus a fifth island on the far side where there is room for one. Span 1 returns
 * the layout as it is.
 */
export function growLayout(base: readonly LedgeDef[], span: number, extra = true): LedgeDef[] {
  const out = base.map((l) => ({ ...l }));
  if (span <= 1) return out;
  const right = fieldRight(span) - EDGE_PAD;
  // room above for an archer, and never so high that a full-power shot cannot reach its head
  const top = Math.max(fieldTop(span) + TOP_PAD, HIGHEST);
  const reach = (l: LedgeDef) => l.w + (l.slide?.amp ?? 0) + (l.swing?.amp ?? 0);
  // the strongest spread that keeps every island (and its slide, swing or bob) inside the view
  let k = 1 + (span - 1) * 2.6;
  for (const l of out) {
    const cx = l.x + l.w / 2;
    const amp = (l.slide?.amp ?? 0) + (l.swing?.amp ?? 0);
    const bob = l.bob?.amp ?? 0;
    if (cx > BOW_X) k = Math.min(k, (right - l.w / 2 - amp - BOW_X) / (cx - BOW_X));
    if (l.y < BOW_Y) k = Math.min(k, (BOW_Y - top - bob) / (BOW_Y - l.y));
    if (l.y > BOW_Y) k = Math.min(k, (LOW_Y - bob - BOW_Y) / (l.y - BOW_Y));
  }
  k = Math.max(1, k);
  for (const l of out) {
    l.x = Math.round(BOW_X + (l.x + l.w / 2 - BOW_X) * k - l.w / 2);
    l.y = Math.round(BOW_Y + (l.y - BOW_Y) * k);
  }
  const W = 140;
  const clear = (m: LedgeDef) => out.every((o) => m.x + m.w + 44 < o.x - (o.slide?.amp ?? 0) - (o.swing?.amp ?? 0) || o.x + reach(o) + 44 < m.x || m.y + 160 < o.y - (o.bob?.amp ?? 0) || o.y + (o.bob?.amp ?? 0) + 160 < m.y);
  // nor in the way of a shot: off the straight line from the player's bow to every archer, and
  // not right above an island (it would roof it over: no lob over a shield or a wall)
  const inWay = (m: LedgeDef) =>
    out.some((o) => {
      if (m.x < o.x + o.w && m.x + m.w > o.x && o.y > m.y && o.y - m.y < (o.w > 200 ? 420 : 300)) return true;
      const tx = o.x + o.w / 2;
      const ty = o.y - 130;
      for (let k = 0; k <= 24; k++) {
        const x = 150 + ((tx - 150) * k) / 24;
        const y = 880 + ((ty - 880) * k) / 24;
        if (x > m.x - 30 && x < m.x + m.w + 30 && y > m.y - 60 && y < m.y + 90) return true;
      }
      return false;
    });
  // (a ceiling stage gets none: nothing may stand up in the rock)
  for (const [fx, fy] of extra ? EXTRA_SPOTS : []) {
    const m: LedgeDef = { x: Math.round(Math.min(right - W, fieldRight(span) * fx - W / 2)), y: Math.round(Math.max(top, fieldTop(span) + 1280 * span * fy)), w: W };
    if (clear(m) && !inWay(m)) {
      out.push(m);
      break;
    }
  }
  return out;
}

/**
 * The enemies a stage spawns. hard adds an archer to the regular stages (not elite or boss
 * stages) of the first HARD_EXTRA_UNTIL_CHAPTER chapters while a ledge is free, so the opening
 * is a fight from the first wave instead of a lone target.
 */
export function stageEnemies(wave: number, def: StageDef, ledges: number, d: Difficulty = 'classic'): EnemyType[] {
  const p = stageOf(wave);
  const extra = d === 'hard' && !p.endless && (p.chapter > 0 || p.stage >= HARD_EXTRA_FROM_STAGE) && p.chapter < HARD_EXTRA_UNTIL_CHAPTER && !def.elite && !def.boss && def.enemies.length < ledges;
  return extra ? [...def.enemies, 'archer'] : [...def.enemies];
}
