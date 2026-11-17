/**
 * Run structure (pure): four chapters of seven stages, each in its own themed world, then
 * endless. Stage 4 brings the chapter's elite, stage 7 its boss; a bonus round follows every
 * chapter. Every stage lists its enemies, ledges (some slide or swing on a rope) and props.
 */
import type { Rng } from '@oyun/core/pure';
import type { EnemyType } from './combat';

export const STAGES = 7;
export const CHAPTERS = 4;
/** first wave of endless mode */
export const ENDLESS_WAVE = CHAPTERS * STAGES + 1;

export type BossKind = 'shields' | 'giant' | 'summoner' | 'warden';
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
}

export type PropDef = { kind: 'barrel'; on: number } | { kind: 'rock'; above: number };

export interface StageDef {
  enemies: EnemyType[];
  ledges: readonly LedgeDef[];
  props?: readonly PropDef[];
  /** wind strength in px/s² (sign is seeded per run) */
  wind?: number;
  boss?: BossKind;
  elite?: boolean;
}

export interface ChapterDef {
  id: 'meadow' | 'snow' | 'desert' | 'night';
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

const slide = (l: LedgeDef, amp = 60, speed = 0.9): LedgeDef => ({ ...l, w: Math.min(l.w, 150), slide: { amp, speed } });
const swing = (l: LedgeDef, amp = 55, speed = 1.1): LedgeDef => ({ ...l, w: Math.min(l.w, 140), swing: { amp, speed } });
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
      { enemies: ['jumper', 'healer'], ledges: B },
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
      { enemies: ['bomber', 'archer'], ledges: B, props: [{ kind: 'rock', above: 1 }], wind: 170 },
      { enemies: ['shield', 'jumper', 'archer'], ledges: with_(C, 2, (l) => slide(l, 55, 1.1)), wind: 190 },
      { enemies: ['elite', 'bomber'], ledges: A, elite: true, props: [{ kind: 'rock', above: 0 }], wind: 200 },
      { enemies: ['archer', 'bomber', 'shield'], ledges: with_(with_(B, 0, (l) => slide(l, 50)), 2, (l) => slide(l, 60, 1.2)), wind: 220 },
      { enemies: ['jumper', 'archer', 'bomber', 'archer'], ledges: with_(C, 1, (l) => slide(l, 50, 1)), props: [{ kind: 'rock', above: 3 }], wind: 240 },
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
      { enemies: ['catcher', 'archer'], ledges: C, props: [{ kind: 'barrel', on: 1 }] },
      { enemies: ['elite', 'cover', 'archer'], ledges: with_(A, 2, (l) => swing(l, 45)), elite: true },
      { enemies: ['catcher', 'cover', 'bomber'], ledges: B, props: [{ kind: 'barrel', on: 2 }] },
      { enemies: ['archer', 'catcher', 'cover', 'archer'], ledges: with_(with_(C, 2, (l) => swing(l, 50, 0.9)), 3, (l) => swing(l, 40, 1.3)) },
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
      { enemies: ['ward', 'healer', 'archer'], ledges: with_(B, 1, (l) => slide(l)) },
      { enemies: ['catcher', 'ward', 'bomber'], ledges: with_(C, 2, (l) => swing(l)), props: [{ kind: 'rock', above: 1 }] },
      { enemies: ['elite', 'healer', 'ward'], ledges: A, elite: true, props: [{ kind: 'barrel', on: 1 }] },
      { enemies: ['cover', 'ward', 'jumper', 'archer'], ledges: with_(with_(B, 0, (l) => slide(l, 50)), 1, (l) => swing(l, 50)) },
      { enemies: ['ward', 'catcher', 'healer', 'bomber'], ledges: C, props: [{ kind: 'rock', above: 0 }, { kind: 'barrel', on: 2 }] },
      { enemies: ['boss'], ledges: BOSS, boss: 'warden' },
    ],
  },
];

export interface StagePos {
  /** 0 … 3 a chapter, 4 endless */
  chapter: number;
  /** 1 … 7 */
  stage: number;
  endless: boolean;
  /** world theme 0 … 3 */
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

/** First wave of a chapter (4 = endless). */
export function chapterStart(chapter: number): number {
  return Math.max(0, Math.min(CHAPTERS, chapter)) * STAGES + 1;
}

/** Difficulty level at each chapter's first stage, and its rise per stage. */
export const LEVEL_BASE: readonly number[] = [1, 3.5, 10.5, 17];
export const LEVEL_STEP: readonly number[] = [0.2, 1, 1, 1];
/** endless: the level after the last chapter, +1 per wave */
export const ENDLESS_LEVEL = 23.5;

/**
 * Difficulty level of a wave: drives enemy health, damage, aim and timing (the same curves
 * the slice used per wave). The first chapter is a gentle ramp; later chapters climb fast.
 */
export function levelOf(wave: number): number {
  const p = stageOf(wave);
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
];

function pick(rng: Rng): EnemyType {
  let roll = rng.next() * ENDLESS_POOL.reduce((s, p) => s + p.weight, 0);
  for (const p of ENDLESS_POOL) {
    roll -= p.weight;
    if (roll < 0) return p.type;
  }
  return 'archer';
}

const ENDLESS_BOSSES: readonly BossKind[] = ['shields', 'giant', 'summoner', 'warden'];

/** The stage to play at a wave (endless stages are drawn from the wave rng). */
export function stageDef(wave: number, rng: Rng): StageDef {
  const p = stageOf(wave);
  if (!p.endless) return CHAPTER_DEFS[p.chapter]!.stages[p.stage - 1]!;
  const cycle = Math.floor((wave - ENDLESS_WAVE) / STAGES);
  const bases = [A, B, C];
  if (p.stage === STAGES) {
    const boss = ENDLESS_BOSSES[cycle % ENDLESS_BOSSES.length]!;
    const def = CHAPTER_DEFS[ENDLESS_BOSSES.indexOf(boss)]!.stages[STAGES - 1]!;
    return { ...def, enemies: ['boss', ...(cycle > 0 ? [pick(rng)] : [])] };
  }
  const n = Math.min(4, 3 + Math.floor(cycle / 2));
  const enemies: EnemyType[] = [];
  if (p.stage === 4) enemies.push('elite');
  while (enemies.length < n) enemies.push(pick(rng));
  let ledges: LedgeDef[] = bases[(wave + cycle) % 3]!.map((l) => ({ ...l }));
  const mover = rng.int(0, 3);
  const r = rng.next();
  if (r < 0.35) ledges = with_(ledges, mover, (l) => slide(l, 55));
  else if (r < 0.65) ledges = with_(ledges, mover, (l) => swing(l));
  const props: PropDef[] = [];
  if (rng.chance(0.5)) props.push({ kind: 'barrel', on: rng.int(0, n - 1) });
  if (rng.chance(0.4)) props.push({ kind: 'rock', above: rng.int(0, n - 1) });
  const def: StageDef = { enemies, ledges, props, elite: p.stage === 4 };
  if (p.theme === 1 || rng.chance(0.2)) def.wind = 160 + 15 * Math.min(8, cycle) + rng.range(0, 60);
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
