/**
 * The whole game as a deterministic fixed-step simulation: the player and enemy archers
 * (ragdolls with muscles), arrows, bombs, orbs, apples, ledges (some slide or swing on ropes),
 * props (barrels, hanging rocks), chapters, bosses, bonus rounds, cards, focus and coins.
 * From chapter 4 on the field grows (chapters.ts `fieldSpan`): `w.span` tells the renderers how
 * far to pull their cameras back.
 * Scenes call `advance`, `aimAt`, `shoot`, `pickCard`, `unleash`, … and draw the state; they
 * hold no rules.
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { flyArrow, hitParts, sweepCapsule } from './arrow';
import { addVelocity, createBody, stepBody, translateBody, type Body, type Ledge } from './body';
import { draftPick, drawOffer, statsFor, type CardId, type PlayerStats } from './cards';
import { bonusAfter, CHAPTERS, chapterStart, ENDLESS_WAVE, fieldSpan, fieldTop, growLayout, levelOf, objectiveFor, STAGES, stageDef, stageEnemies, stageOf, type BonusKind, type BossKind, type LedgeDef, type ObjectiveKind } from './chapters';
import { ENEMY_DAMAGE, resolveHit, type EnemyType, type HitPart } from './combat';
import { clamp, solveLaunchAngle, sweepAabb } from './geom';
import { NO_META, type MetaLevels, type RunBank } from './meta';
import type { DailyMod, RunSummary } from './progress';
import { BOSS_PARTS, bowOrigin, createRagdoll, LEG_HEIGHT, PARTS, PT, setPose, type Part } from './ragdoll';
import { PLAYER_LEDGE, PLAYER_SCALE, PLAYER_X, TUNING } from './tuning';
import { bossHp, enemyAccuracy, enemyDamageMul, enemyHp, enemyScale, enemyTiming, enemyWeight, graceStep, HARD_COIN_MUL, helmetChance, waveGrace, type Difficulty } from './waves';
import { WEAPONS, weaponDamage, weaponPerks } from './weapons';

export type Phase = 'title' | 'play' | 'clear' | 'bonus' | 'cards' | 'dying' | 'over';
export type ArcherType = EnemyType | 'player';
export type KoCause = 'shot' | 'head' | 'fall' | 'burn' | 'bomb' | 'blast' | 'crush';
type BrainState = 'wait' | 'draw' | 'cool' | 'jump' | 'spawn';

/** chapter bosses in chapter order (index = chapter, and the index of `save.bosses`) */
export const BOSS_KINDS: readonly BossKind[] = ['shields', 'giant', 'summoner', 'warden', 'magma', 'tempest'];

export interface Archer {
  id: number;
  type: ArcherType;
  body: Body;
  parts: readonly Part[];
  scale: number;
  facing: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  gone: boolean;
  ledge: number;
  /** where the pelvis should stand (stance) and where it is drawn toward */
  anchorX: number;
  anchorY: number;
  stanceX: number;
  aim: number;
  draw: number;
  brain: BrainState;
  timer: number;
  aimGoal: number;
  speedGoal: number;
  aimPenalty: number;
  stagger: number;
  wobble: number;
  burn: number;
  burnDps: number;
  burnTick: number;
  koTime: number;
  koCause: KoCause | null;
  mayDangle: boolean;
  dangle: number;
  dangleTime: number;
  /** seconds since the last hit (drawing a flinch face) */
  hurt: number;
  crouch: number;
  jumpT: number;
  jumpDur: number;
  jx0: number;
  jy0: number;
  jx1: number;
  jy1: number;
  jumpCooldown: number;
  spawnT: number;
  /** stance shoved past the ledge edge: limp and going down */
  falling: number;
  /** veteran: helmet stops one-shot headshots */
  helmet: boolean;
  shield: Body | null;
  shieldHp: number;
  shieldOn: boolean;
  bob: number;
  /** arrows released this wave (the first volley never lands a headshot) */
  shotsFired: number;
  /** chapter boss: which one, its phase (1, 2) and its special-move timer */
  bossKind: BossKind | null;
  bossPhase: number;
  special: number;
  /** arrow-catcher: seconds until it can catch again */
  catchCd: number;
  /** lantern knight: ward up, or seconds until it reforms */
  wardUp: boolean;
  wardT: number;
  /** frost arrows: seconds left chilled (draws, cools and hops slowly) */
  chill: number;
  /** wizard: seconds until it can blink to another ledge again */
  blinkCd: number;
}

export interface Arrow {
  active: boolean;
  owner: 'player' | 'enemy';
  kind: 'arrow' | 'bomb' | 'orb' | 'bolt' | 'spear' | 'boomerang' | 'pebble' | 'rocket';
  /** gravity and wind scale (1 for everything but some weapons' projectiles) */
  gravityMul: number;
  windMul: number;
  /** 0 flying, 1 stuck in a ledge, 2 stuck in a body, 3 stuck in a shield */
  state: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  age: number;
  life: number;
  dmgMul: number;
  impulseMul: number;
  fire: boolean;
  pierce: number;
  bounces: number;
  ignore: number;
  /** archer id (stuck in a body/shield) or ledge index (stuck in a ledge) */
  host: number;
  ha: number;
  hb: number;
  hu: number;
  hoff: number;
  hrel: number;
  /** visual: fades out when > 0 */
  fade: number;
  seq: number;
  /** an enemy's first volley of a wave: a head hit counts as a body hit */
  soft: boolean;
  /** id of the archer who loosed it (read by the animation layer for taunts) */
  by: number;
  /** player: steers toward heads (seeker card) */
  seek: boolean;
  /** player: a full-power overdrawn shot */
  over: boolean;
  /** player: the shot's first arrow (a miss by it ends a headshot chain) */
  primary: boolean;
  /** player: loosed while focus was up (drawn golden) */
  focus: boolean;
  /** this arrow already hit an enemy */
  scored: boolean;
  /** enemy orbs: the caster's ledge (they leave it without popping on its edge), -1 none */
  fromLedge: number;
  /** enemy orbs: turn rate toward the player, rad/s (the wizard's hex; 0 = straight) */
  homing: number;
  /** enemy orbs: a staff-carrier's spell (healer or wizard), drawn as a hex, not a warden orb */
  hex: boolean;
  /** player: frost and blast arrow heads (drawn icy / with a charge) */
  frost: boolean;
  blast: boolean;
  /** boomerang: flight age (s) at which it stops flying out and starts back */
  turnT: number;
  /** boomerang: archers already hit on this pass (cleared when it turns) */
  hitIds: number[];
}

export interface Apple {
  active: boolean;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  t: number;
}

/** A ledge that moves: slides on a rail, swings on two ropes from the top of the sky, or bobs up and down on the lava. */
export interface Mover {
  index: number;
  kind: 'slide' | 'swing' | 'bob';
  x0: number;
  y0: number;
  amp: number;
  speed: number;
  theta: number;
  /** swing: pivot (above the ledge centre, at the top of the view) and rope length to the ledge top */
  pivotX: number;
  pivotY: number;
  len: number;
  /** swing rope cut: the ledge falls */
  cut: boolean;
  vy: number;
}

/** where ropes hang from at the normal field size (a grown field hangs them higher, `ropeTop`) */
export const PIVOT_Y = -60;

/** The rope pivot height on a field of `span` (just above the top of the view). */
export function ropeTop(span: number): number {
  return Math.min(PIVOT_Y, fieldTop(span) - 60);
}

export interface Prop {
  active: boolean;
  kind: 'barrel' | 'rock';
  x: number;
  y: number;
  vy: number;
  /** barrel: box size; rock: radius in w */
  w: number;
  h: number;
  /** rock: still hanging on its rope */
  hanging: boolean;
  /** rock: where its rope hangs from */
  pivotY: number;
}

export interface Plate {
  active: boolean;
  x: number;
  y: number;
  r: number;
}

export interface Target {
  active: boolean;
  kind: 'target' | 'apple' | 'rock';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  baseY: number;
}

export interface Bonus {
  kind: BonusKind;
  /** seconds since the start (negative during the intro) */
  t: number;
  dur: number;
  hits: number;
  spawned: number;
  /** defend: rocks that reached the player */
  landed: number;
  coins: number;
  spawnT: number;
  grade: 'gold' | 'silver' | 'bronze' | 'none' | null;
}

export interface Objective {
  kind: ObjectiveKind;
  limit: number;
  hit: boolean;
  heads: number;
  multi: boolean;
}

export type GameEvent =
  | { t: 'shot'; x: number; y: number; angle: number; power: number; arrows: number; over: boolean }
  | { t: 'enemyDraw'; id: number }
  | { t: 'enemyShot'; id: number; kind: 'arrow' | 'bomb' | 'orb'; x: number; y: number }
  /** a wizard that was hit vanishes from one ledge and appears on another */
  | { t: 'blink'; id: number; x0: number; y0: number; x1: number; y1: number }
  /** a frost arrow (or a shatter burst) chilled an archer */
  | { t: 'chill'; id: number; x: number; y: number }
  | { t: 'hit'; id: number; part: HitPart; x: number; y: number; dmg: number; ko: boolean; slowmo: boolean; vx: number; vy: number; fire: boolean; enemy: EnemyType; crit: boolean }
  | { t: 'bodyThunk'; id: number; x: number; y: number }
  | { t: 'playerHit'; part: HitPart; x: number; y: number; dmg: number; vx: number; vy: number; by: number }
  | { t: 'blocked'; x: number; y: number }
  | { t: 'ko'; id: number; x: number; y: number; cause: KoCause; coins: number; enemy: EnemyType }
  | { t: 'poof'; id: number; x: number; y: number; enemy: EnemyType }
  | { t: 'thunk'; x: number; y: number; owner: 'player' | 'enemy' }
  | { t: 'bounce'; x: number; y: number }
  | { t: 'shieldHit'; id: number; x: number; y: number; broke: boolean }
  | { t: 'bomb'; x: number; y: number; hurt: boolean; popped: boolean }
  | { t: 'orbPop'; x: number; y: number }
  | { t: 'apple'; x: number; y: number; heal: number }
  | { t: 'burn'; id: number; x: number; y: number; dmg: number }
  | { t: 'heal'; amount: number }
  | { t: 'waveStart'; wave: number; chapter: number; stage: number; boss: BossKind | null; elite: boolean; wind: number; objective: ObjectiveKind | null; limit: number }
  | { t: 'waveClear'; wave: number; coins: number }
  | { t: 'objective'; kind: ObjectiveKind; ok: boolean; coins: number }
  | { t: 'caught'; id: number; x: number; y: number }
  | { t: 'ward'; id: number; x: number; y: number; up: boolean }
  | { t: 'healBeam'; from: number; to: number; x0: number; y0: number; x1: number; y1: number; amount: number }
  | { t: 'plate'; x: number; y: number }
  | { t: 'bossPhase'; id: number; kind: BossKind; x: number; y: number }
  | { t: 'summon'; id: number; x: number; y: number }
  /** the cinder king calls lava rocks down on the player (one event per rock, at its spawn point) */
  | { t: 'eruption'; id: number; x: number; y: number }
  /** the wind turns around (a gusty stage, or the storm caller); `by` is the boss's id or -1 */
  | { t: 'gust'; wind: number; by: number; x: number; y: number }
  | { t: 'barrel'; x: number; y: number; kills: number }
  | { t: 'rope'; x: number; y: number; kind: 'swing' | 'rock'; riders: number }
  | { t: 'rockHit'; x: number; y: number; id: number }
  | { t: 'rockBreak'; x: number; y: number }
  | { t: 'zap'; x0: number; y0: number; x1: number; y1: number; dmg: number }
  /** a burst of radius `r`: the boom card, a blast arrow, or a firework rocket (`rocket`) */
  | { t: 'blast'; x: number; y: number; r: number; fire: boolean; rocket: boolean }
  /** the player's boomerang came back to the bow (it ends here) */
  | { t: 'boomCatch'; x: number; y: number }
  | { t: 'multi'; n: number; x: number; y: number }
  | { t: 'streak'; n: number }
  | { t: 'chain'; n: number; x: number; y: number; coins: number }
  | { t: 'focusReady' }
  | { t: 'focus'; on: boolean }
  | { t: 'loot'; x: number; y: number; coins: number; kind: 'boss' | 'elite' }
  | { t: 'bonusStart'; kind: BonusKind }
  | { t: 'bonusHit'; x: number; y: number; coins: number; bull: boolean; kind: Target['kind'] }
  | { t: 'bonusEnd'; kind: BonusKind; hits: number; grade: 'gold' | 'silver' | 'bronze' | 'none'; coins: number }
  | { t: 'cards'; treasure: boolean }
  | { t: 'dying' }
  | { t: 'dead' };

export interface RunStats {
  shots: number;
  hits: number;
  kos: number;
  headshots: number;
  /** shot count when the first knockout happened (0 = none yet) */
  firstKoShot: number;
  coins: number;
  playerHitsTaken: number;
  enemyShots: number;
  crits: number;
  chain: number;
  chainBest: number;
  streak: number;
  streakBest: number;
  multiN: number;
  lastKo: number;
  multiBest: number;
  focusUses: number;
  bossKills: { kind: number; time: number }[];
  chapterStage: number[];
  bonusGold: number;
  barrelBest: number;
  ropeDrops: number;
  objectives: number;
}

export interface World {
  rng: Rng;
  brainRng: Rng;
  waveRng: Rng;
  cardRng: Rng;
  critRng: Rng;
  bonusRng: Rng;
  seed: number;
  meta: MetaLevels;
  mod: DailyMod | null;
  /** enemy aim, timing and damage curves (waves.ts); 'classic' unless the renderer asks */
  difficulty: Difficulty;
  phase: Phase;
  wave: number;
  /** 0 … 3 a chapter, 4 endless */
  chapter: number;
  stage: number;
  /** difficulty level of the wave (see levelOf) */
  level: number;
  /** world theme 0 … 3 */
  theme: number;
  time: number;
  acc: number;
  phaseT: number;
  player: Archer;
  enemies: Archer[];
  arrows: Arrow[];
  apples: Apple[];
  appleTimer: number;
  ledges: Ledge[];
  /** the enemy ledges of the current stage (indices into `ledges` start at 1) */
  layout: readonly Ledge[];
  /** field size against the 720 x 1280 frame (1, then bigger from chapter 4: chapters.ts fieldSpan) */
  span: number;
  /** cover walls: block arrows only (bodies pass); `on` is the ledge they stand on */
  walls: (Ledge & { on: number })[];
  movers: Mover[];
  props: Prop[];
  plates: Plate[];
  targets: Target[];
  bonus: Bonus | null;
  objective: Objective | null;
  /** horizontal wind on arrows, px/s² (+ blows toward the enemies) */
  wind: number;
  /** gusty stage: seconds between wind flips (0 = steady) and the time to the next one */
  gustEvery: number;
  gustT: number;
  cards: CardId[];
  stats: PlayerStats;
  offer: CardId[];
  offerExtra: boolean;
  /** the next card pick offers four (after a boss) */
  treasure: boolean;
  rerollsLeft: number;
  shieldLeft: number;
  reload: number;
  volleyQueue: number;
  volleyT: number;
  volleyAngle: number;
  volleyPower: number;
  /** focus meter 0 … 1 and seconds of powered-up time left */
  focus: number;
  focusT: number;
  revived: boolean;
  nextId: number;
  arrowSeq: number;
  run: RunStats;
  /** wave start time (boss kill timing) */
  waveT0: number;
  /** events since the scene last called takeEvents (kept until then, delivered exactly once) */
  events: GameEvent[];
  spareEvents: GameEvent[];
  /** layout nudge for the very first stage (seeded per run) */
  layoutRot: number;
  /** chapter the run started at (0 = from the beginning) */
  startChapter: number;
  /** coins/best already written to the save by the scene (survives a revive) */
  bank: RunBank | null;
}

const ARROW_POOL = 80;
const NO_LEDGES: Ledge[] = [];
/** the boss looses a fan of three arrows */
const BOSS_SPREAD = [-0.05, 0, 0.05] as const;
const ELITE_SPREAD = [-0.08, 0.08] as const;
const ONE_ARROW = [0] as const;
const DT = TUNING.dt;
const SHIELD_PARTS: readonly Part[] = [{ a: 0, b: 1, r: 15, kind: 'body' }];
const BODY_PART: Part = PARTS.find((p) => p.kind === 'body')!;

export const FX = {
  /** focus meter gains */
  focusBody: 0.06,
  focusHead: 0.16,
  focusKo: 0.06,
  focusMulti: 0.12,
  /** powered-up shots: damage, extra pierce, extra crit chance, reload */
  focusDmg: 1.5,
  focusCrit: 0.25,
  focusReload: 0.6,
  /** seconds between knockouts that still count as one multi-kill */
  multiWindow: 1.2,
  /** knockout streaks called out at these counts */
  streaks: [3, 5, 8, 12, 16, 20, 25, 30] as readonly number[],
  barrelRadius: 130,
  barrelDamage: 70,
  boomRadius: 110,
  rockRadius: 26,
  plateRadius: 30,
  orbSpeed: 300,
  orbDamage: 9,
  orbRadius: 20,
  /**
   * the healer's hex, cast when nobody needs mending (it used to stand there with nothing to
   * do: a staff that glowed and never struck), and the wizard's homing hex: speed, damage as a
   * share of an orb's, turn rate (rad/s)
   */
  hexSpeed: 280,
  healerHex: 1.1,
  mageSpeed: 250,
  mageHex: 1.7,
  mageHoming: 1.5,
  /** wizard: seconds between blinks */
  blinkCooldown: 3.2,
  /** volley archer: a fan of arrows on a high arc (launch speed shares), each hitting for `volleyShare` */
  volleySpeeds: [0.95, 1, 1.05] as readonly number[],
  volleyShare: 0.5,
  catchCooldown: 1.8,
  wardWindow: 1.4,
  healEvery: 3.4,
  healShare: 0.25,
  ropeRadius: 8,
} as const;

function newArrow(): Arrow {
  return {
    active: false,
    owner: 'player',
    kind: 'arrow',
    gravityMul: 1,
    windMul: 1,
    state: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    age: 0,
    life: 0,
    dmgMul: 1,
    impulseMul: 1,
    fire: false,
    pierce: 0,
    bounces: 0,
    ignore: -1,
    host: -1,
    ha: 0,
    hb: 0,
    hu: 0,
    hoff: 0,
    hrel: 0,
    fade: 0,
    seq: 0,
    soft: false,
    by: -1,
    seek: false,
    over: false,
    primary: false,
    focus: false,
    scored: false,
    fromLedge: -1,
    homing: 0,
    hex: false,
    frost: false,
    blast: false,
    turnT: 0,
    hitIds: [],
  };
}

function playerPelvisY(): number {
  return PLAYER_LEDGE.y - LEG_HEIGHT * PLAYER_SCALE;
}

function makeArcher(w: World, type: ArcherType, x: number, ledgeTop: number, facing: number, ledge: number): Archer {
  const scale = type === 'player' ? PLAYER_SCALE : enemyScale(type);
  const ay = ledgeTop - LEG_HEIGHT * scale;
  const body = createRagdoll(x, ay, facing, scale);
  const hp = type === 'player' ? w.stats.maxHp : Math.round(enemyHp(type, w.level, w.difficulty) * (w.mod === 'giants' ? 1.3 : 1));
  const a: Archer = {
    id: w.nextId++,
    type,
    body,
    parts: type === 'boss' ? BOSS_PARTS : PARTS,
    scale,
    facing,
    hp,
    maxHp: hp,
    alive: true,
    gone: false,
    ledge,
    anchorX: x,
    anchorY: ay,
    stanceX: x,
    aim: facing > 0 ? -0.35 : Math.PI + 0.35,
    draw: 0,
    brain: 'wait',
    timer: 0,
    aimGoal: 0,
    speedGoal: 0,
    aimPenalty: 0,
    stagger: 0,
    wobble: 0,
    burn: 0,
    burnDps: 0,
    burnTick: 0,
    koTime: 0,
    koCause: null,
    mayDangle: false,
    dangle: -1,
    dangleTime: 0,
    hurt: 9,
    crouch: 0,
    jumpT: 0,
    jumpDur: 0,
    jx0: 0,
    jy0: 0,
    jx1: 0,
    jy1: 0,
    jumpCooldown: 3,
    spawnT: 0,
    falling: 0,
    helmet: false,
    shield: null,
    shieldHp: 0,
    shieldOn: false,
    shotsFired: 0,
    bob: (w.nextId * 1.7) % 6.28,
    bossKind: null,
    bossPhase: 1,
    special: 0,
    catchCd: 0,
    wardUp: type === 'ward',
    wardT: 0,
    chill: 0,
    blinkCd: 0,
  };
  if (type === 'shield') {
    const sx = x + facing * 30;
    a.shield = createBody({
      points: [
        { x: sx, y: ledgeTop - 104, r: 8, kp: 0 },
        { x: sx, y: ledgeTop - 6, r: 8, kp: 0 },
      ],
      sticks: [[0, 1]],
      limits: [],
    });
    a.shield.pin[0] = 1;
    a.shield.pin[1] = 1;
    a.shieldHp = TUNING.shieldHits;
    a.shieldOn = true;
  }
  poseArcher(a, 0);
  return a;
}

export interface WorldOptions {
  seed: number;
  meta?: MetaLevels;
  /** start at this chapter (0 … 3, 4 = endless) with a drafted hand (chapter select) */
  startChapter?: number;
  /** daily challenge modifier */
  mod?: DailyMod | null;
  /** 'hard' for the 3D build (apps/okcu-3d); default 'classic' */
  difficulty?: Difficulty;
}

/** Cards in a hand drafted for a chapter-select start: five per chapter skipped. */
export const DRAFT_PER_CHAPTER = 5;

function newRun(): RunStats {
  return {
    shots: 0,
    hits: 0,
    kos: 0,
    headshots: 0,
    firstKoShot: 0,
    coins: 0,
    playerHitsTaken: 0,
    enemyShots: 0,
    crits: 0,
    chain: 0,
    chainBest: 0,
    streak: 0,
    streakBest: 0,
    multiN: 0,
    lastKo: -99,
    multiBest: 0,
    focusUses: 0,
    bossKills: [],
    chapterStage: Array<number>(CHAPTERS).fill(0),
    bonusGold: 0,
    barrelBest: 0,
    ropeDrops: 0,
    objectives: 0,
  };
}

export function createWorld(opts: WorldOptions): World {
  const rng = createRng(opts.seed);
  const meta = opts.meta ?? NO_META;
  const w = {
    rng,
    brainRng: rng.fork('brain'),
    waveRng: rng.fork('waves'),
    cardRng: rng.fork('cards'),
    critRng: rng.fork('crit'),
    bonusRng: rng.fork('bonus'),
    seed: opts.seed,
    meta,
    mod: opts.mod ?? null,
    difficulty: opts.difficulty ?? 'classic',
    phase: 'title',
    wave: 1,
    chapter: 0,
    stage: 1,
    level: 1,
    theme: 0,
    time: 0,
    acc: 0,
    phaseT: 0,
    enemies: [],
    arrows: Array.from({ length: ARROW_POOL }, newArrow),
    apples: Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, baseY: 0, vx: 0, t: 0 })),
    appleTimer: 6,
    ledges: [{ ...PLAYER_LEDGE }],
    layout: [],
    span: 1,
    walls: [],
    movers: [],
    props: Array.from({ length: 6 }, () => ({ active: false, kind: 'barrel', x: 0, y: 0, vy: 0, w: 0, h: 0, hanging: false, pivotY: PIVOT_Y })),
    plates: Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, r: FX.plateRadius })),
    targets: Array.from({ length: 24 }, () => ({ active: false, kind: 'target', x: 0, y: 0, vx: 0, vy: 0, r: 0, t: 0, baseY: 0 })),
    bonus: null,
    objective: null,
    wind: 0,
    gustEvery: 0,
    gustT: 0,
    cards: [],
    stats: statsFor([], meta, opts.difficulty ?? 'classic'),
    offer: [],
    offerExtra: false,
    treasure: false,
    rerollsLeft: 0,
    shieldLeft: 0,
    reload: 0,
    volleyQueue: 0,
    volleyT: 0,
    volleyAngle: 0,
    volleyPower: 0,
    focus: 0,
    focusT: 0,
    revived: false,
    nextId: 1,
    arrowSeq: 0,
    run: newRun(),
    waveT0: 0,
    events: [],
    spareEvents: [],
    layoutRot: 0,
    startChapter: Math.max(0, Math.min(CHAPTERS, Math.floor(opts.startChapter ?? 0))),
    bank: null,
  } as unknown as World;
  w.layoutRot = w.waveRng.int(0, 2);
  if (w.stats.starterCard) {
    const [card] = drawOffer(w.cardRng, [], 1, Infinity, w.stats.weapon);
    if (card) w.cards.push(card);
  }
  if (w.mod === 'fire') w.cards.push('fire');
  // chapter select: a fair hand for the chapters skipped, drafted from real offers
  for (let i = 0; i < w.startChapter * DRAFT_PER_CHAPTER; i++) {
    const offer = drawOffer(w.cardRng, w.cards, 3, Math.floor(i / DRAFT_PER_CHAPTER), w.stats.weapon);
    if (offer.length === 0) break;
    w.cards.push(offer[draftPick(offer)]!);
  }
  w.stats = statsFor(w.cards, meta, w.difficulty);
  w.rerollsLeft = w.stats.rerolls;
  w.player = makeArcher(w, 'player', PLAYER_X, PLAYER_LEDGE.y, 1, 0);
  w.player.hp = w.player.maxHp = w.stats.maxHp;
  spawnWave(w, chapterStart(w.startChapter), true);
  return w;
}

// ---------------------------------------------------------------- waves

/** a thrown spear is gone after this many seconds in the air (a bow arrow flies for 5) */
export const SPEAR_LIFE = 1.2;

/** hard: damage share of split's side arrows and of double's later volleys */
const HARD_SIDE_ARROW = 0.5;
const HARD_EXTRA_VOLLEY = 0.6;

function coinMul(w: World): number {
  return w.stats.coinMul * (w.mod === 'giants' ? 1.5 : 1) * (w.difficulty === 'hard' ? HARD_COIN_MUL : 1);
}

function clearProps(w: World): void {
  for (const p of w.props) p.active = false;
  for (const p of w.plates) p.active = false;
  w.walls.length = 0;
  w.movers.length = 0;
}

function addProp(w: World, kind: Prop['kind'], x: number, y: number): Prop | null {
  const p = w.props.find((q) => !q.active);
  if (!p) return null;
  p.active = true;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.vy = 0;
  p.w = kind === 'barrel' ? 36 : FX.rockRadius;
  p.h = kind === 'barrel' ? 46 : FX.rockRadius;
  p.hanging = kind === 'rock';
  p.pivotY = ropeTop(w.span);
  return p;
}

function spawnWave(w: World, wave: number, instant: boolean): void {
  w.wave = wave;
  const pos = stageOf(wave);
  w.chapter = pos.chapter;
  w.stage = pos.stage;
  w.theme = pos.theme;
  w.level = levelOf(wave, w.difficulty);
  const def = stageDef(wave, w.waveRng);
  w.span = fieldSpan(wave);
  const defs: LedgeDef[] = growLayout(def.ledges, w.span);
  if (wave === 1) nudgeFirst(w, defs);
  const pivotY = ropeTop(w.span);
  // leftover bodies of the last wave poof now
  for (const e of w.enemies) if (!e.gone) poof(w, e);
  w.enemies.length = 0;
  for (const a of w.arrows) {
    if (!a.active) continue;
    if (a.state === 0 && a.owner === 'enemy') a.active = false;
    // a boomerang still out would come back into the next wave: it is gone with the old one
    if (a.state === 0 && a.kind === 'boomerang') a.active = false;
    // a rocket still in its fuse would burst on the next wave's archers
    if (a.state === 0 && a.kind === 'rocket') a.active = false;
    if (a.state === 1 || a.state === 3) a.active = false;
  }
  clearProps(w);
  w.layout = defs.map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h ?? 58 }));
  w.ledges = [{ ...PLAYER_LEDGE }, ...w.layout.map((l) => ({ ...l }))];
  defs.forEach((l, i) => {
    if (l.slide) w.movers.push({ index: i + 1, kind: 'slide', x0: l.x, y0: l.y, amp: l.slide.amp, speed: l.slide.speed, theta: w.waveRng.range(0, Math.PI * 2), pivotX: 0, pivotY, len: 0, cut: false, vy: 0 });
    if (l.swing) w.movers.push({ index: i + 1, kind: 'swing', x0: l.x, y0: l.y, amp: l.swing.amp, speed: l.swing.speed, theta: w.waveRng.range(0, Math.PI * 2), pivotX: l.x + l.w / 2, pivotY, len: l.y - pivotY, cut: false, vy: 0 });
    if (l.bob) w.movers.push({ index: i + 1, kind: 'bob', x0: l.x, y0: l.y, amp: l.bob.amp, speed: l.bob.speed, theta: w.waveRng.range(0, Math.PI * 2), pivotX: 0, pivotY, len: 0, cut: false, vy: 0 });
  });
  // wind: the stage's strength, a seeded direction (the daily's wind modifier blows everywhere)
  const windBase = def.wind ?? (w.mod === 'wind' ? 140 : 0);
  w.wind = windBase > 0 ? windBase * (w.waveRng.chance(0.5) ? 1 : -1) : 0;
  w.gustEvery = w.wind !== 0 ? def.gust ?? 0 : 0;
  w.gustT = w.gustEvery;
  stageEnemies(wave, def, w.layout.length, w.difficulty).forEach((type, i) => {
    const L = w.ledges[i + 1]!;
    const e = makeArcher(w, type, L.x + L.w / 2, L.y, -1, i + 1);
    e.helmet = type === 'elite' || (type !== 'boss' && w.waveRng.chance(helmetChance(w.level)));
    e.brain = 'wait';
    e.timer = waveGrace(w.level, w.difficulty) + i * graceStep(w.level, w.difficulty) + w.brainRng.range(0, 0.4);
    if (type === 'boss') {
      const kind = def.boss ?? 'shields';
      const lap = pos.endless ? Math.floor((wave - ENDLESS_WAVE) / STAGES) + 1 : 0;
      e.bossKind = kind;
      e.hp = e.maxHp = Math.round(bossHp(kind, lap, w.difficulty) * (w.mod === 'giants' ? 1.3 : 1));
      e.special = kind === 'summoner' ? 3.5 : kind === 'magma' ? 4.5 : kind === 'tempest' ? 4 : 2.5;
    }
    if (type === 'cover') {
      // a rock wall in front (toward the player): it stops arrows aimed at the body
      w.walls.push({ x: L.x + L.w / 2 - 46, y: L.y - 118, w: 26, h: 118, on: i + 1 });
    }
    if (type === 'catcher') e.catchCd = 0.6;
    if (!instant) {
      e.brain = 'spawn';
      e.spawnT = 0;
      e.anchorY -= 900;
      translateBody(e.body, 0, -900);
      if (e.shield) translateBody(e.shield, 0, -900);
    }
    w.enemies.push(e);
  });
  for (const p of def.props ?? []) {
    if (p.kind === 'barrel') {
      const L = w.ledges[p.on + 1];
      if (L) addProp(w, 'barrel', L.x + L.w / 2 - 58, L.y - 46);
    } else {
      const L = w.ledges[p.above + 1];
      if (L) addProp(w, 'rock', L.x + L.w / 2, Math.max(fieldTop(w.span) + 150, L.y - 250));
    }
  }
  w.shieldLeft = w.stats.shieldCharges;
  const kind = objectiveFor(wave, w.waveRng);
  w.objective = kind ? { kind, limit: 10 + 5 * w.enemies.length, hit: false, heads: 0, multi: false } : null;
  if (!pos.endless) w.run.chapterStage[pos.chapter] = Math.max(w.run.chapterStage[pos.chapter]!, pos.stage);
  w.waveT0 = w.time;
  // the title's wave is announced by startRun when the first arrow flies
  if (!instant) pushWaveStart(w);
}

function pushWaveStart(w: World): void {
  const boss = w.enemies.find((e) => e.type === 'boss');
  w.events.push({
    t: 'waveStart',
    wave: w.wave,
    chapter: w.chapter,
    stage: w.stage,
    boss: boss?.bossKind ?? null,
    elite: w.enemies.some((e) => e.type === 'elite'),
    wind: w.wind,
    objective: w.objective?.kind ?? null,
    limit: w.objective?.limit ?? 0,
  });
}

/**
 * The first stage's target ledge is nudged to a seeded spot so the opening shot is never the
 * same rote shot (it stays an easy, close target).
 */
function nudgeFirst(w: World, base: LedgeDef[]): void {
  const t = base[0]!;
  // never lower than y 845: a target near the player's height is masked by its own bow arm
  const fits = (m: LedgeDef) => base.slice(1).every((o) => m.x + m.w + 40 < o.x || o.x + o.w + 40 < m.x || m.y + 150 < o.y || o.y + 150 < m.y);
  for (let i = 0; i < 6; i++) {
    const m = { ...t, x: clamp(t.x + w.waveRng.range(-60, 40) - 30 * w.layoutRot, 330, 720 - t.w - 10), y: Math.min(845, t.y + w.waveRng.range(-90, 0)) };
    if (fits(m)) {
      base[0] = m;
      return;
    }
  }
  base[0] = { ...t, y: Math.min(845, t.y) };
}

function startRun(w: World): void {
  w.phase = 'play';
  w.phaseT = 0;
  w.waveT0 = w.time;
  pushWaveStart(w);
}

/**
 * Start wave `wave` right now with archers already standing (no drop-in, no card pick).
 * For tests and tools only: real runs reach a wave by clearing the one before.
 */
export function jumpToWave(w: World, wave: number, dropIn = false): void {
  w.phase = 'play';
  w.phaseT = 0;
  w.bonus = null;
  for (const t of w.targets) t.active = false;
  spawnWave(w, wave, !dropIn);
}

/** Tests and tools: start a chapter's bonus round now. */
export function startBonusNow(w: World, kind: BonusKind): void {
  for (const e of w.enemies) if (!e.gone) poof(w, e);
  w.enemies.length = 0;
  startBonus(w, kind);
}

// ---------------------------------------------------------------- player input

/** Aim pose while the string is drawn (power 0..1); no rules change. */
export function aimAt(w: World, angle: number, power: number): void {
  const p = w.player;
  if (!p.alive) return;
  p.aim = clamp(angle, -Math.PI * 0.62, Math.PI * 0.3);
  p.draw = clamp(power, 0, 1);
}

/** A tap on the title: the archer twitches (cosmetic nudge that teaches "drag, don't tap"). */
export function twitch(w: World): void {
  const p = w.player;
  if (!p.alive) return;
  addVelocity(p.body, PT.head, -90, -160, DT);
  addVelocity(p.body, PT.handF, 60, -120, DT);
  p.body.muscle = Math.min(p.body.muscle, 0.5);
}

/** The angle actually fired for an intended angle (arm hits make the aim wobble). */
export function effectiveAngle(w: World, angle: number): number {
  const p = w.player;
  if (p.wobble <= 0) return angle;
  return angle + Math.sin(w.time * 9) * 0.07 * Math.min(1, p.wobble);
}

export function arrowSpeed(power: number): number {
  return TUNING.speedMin + clamp(power, 0, 1) * (TUNING.speedMax - TUNING.speedMin);
}

export function playerOrigin(w: World, angle: number): { x: number; y: number } {
  return bowOrigin(PLAYER_X, playerPelvisY(), angle, PLAYER_SCALE);
}

export function canShoot(w: World): boolean {
  return (w.phase === 'title' || w.phase === 'play' || w.phase === 'clear' || w.phase === 'bonus') && w.player.alive && w.reload <= 0;
}

/** Overdraw: a shot at this power or more is a full draw. */
export const OVERDRAW_POWER = 0.92;

/** Release the string. In the title this fires and starts the first wave. */
export function shoot(w: World, angle: number, power: number): boolean {
  if (!canShoot(w)) return false;
  if (w.phase === 'title') startRun(w);
  const a = effectiveAngle(w, clamp(angle, -Math.PI * 0.62, Math.PI * 0.3));
  w.run.shots += 1;
  w.reload = w.stats.reload * (w.focusT > 0 ? FX.focusReload : 1);
  w.player.aim = a;
  w.player.draw = 0;
  fireVolley(w, a, power, true);
  w.volleyQueue = w.stats.volleys - 1;
  w.volleyT = 0.12;
  w.volleyAngle = a;
  w.volleyPower = power;
  const o = playerOrigin(w, a);
  w.events.push({ t: 'shot', x: o.x, y: o.y, angle: a, power, arrows: w.stats.volleys * (1 + 2 * w.stats.splitPairs), over: power >= OVERDRAW_POWER && w.stats.overdraw > 1 });
  return true;
}

function fireVolley(w: World, angle: number, power: number, first: boolean): void {
  const speed = arrowSpeed(power) * w.stats.speedMul;
  const pairs = w.stats.splitPairs;
  const over = power >= OVERDRAW_POWER && w.stats.overdraw > 1;
  const focus = w.focusT > 0;
  for (let k = -pairs; k <= pairs; k++) {
    const ang = angle + k * 0.065;
    const o = playerOrigin(w, angle);
    const ar = spawnArrow(w, 'player', w.stats.projectile, o.x, o.y, Math.cos(ang) * speed, Math.sin(ang) * speed);
    if (!ar) continue;
    // hard: extra arrows (split's side arrows, double's later volleys) hit for a share, so the
    // run's cards widen the shot without multiplying its damage four to six times
    const extra = w.difficulty === 'hard' ? (k !== 0 ? HARD_SIDE_ARROW : 1) * (first ? 1 : HARD_EXTRA_VOLLEY) : 1;
    ar.gravityMul = w.stats.gravityMul;
    ar.windMul = WEAPONS[w.stats.weapon].windMul;
    ar.dmgMul = w.stats.dmgMul * (over ? w.stats.overdraw : 1) * (focus ? FX.focusDmg : 1) * extra;
    // hard: the forged bow pushes as well as it hurts (a stronger bow sends archers flying)
    ar.impulseMul = w.stats.impulseMul * (over && w.stats.siege ? 1.5 : 1) * (w.difficulty === 'hard' ? weaponDamage(w.meta.wlevel) * WEAPONS[w.stats.weapon].impulseMul : 1);
    ar.fire = w.stats.fireDps > 0;
    ar.frost = w.stats.frostTime > 0;
    ar.blast = w.stats.blastShare > 0;
    ar.pierce = w.stats.pierce + (focus ? 1 : 0);
    if (ar.kind === 'spear') ar.life = SPEAR_LIFE;
    if (ar.kind === 'boomerang') ar.turnT = BOOM.turnBase + BOOM.turnPower * clamp(power, 0, 1);
    // a rocket always bursts on contact: it never bounces, whatever cards are held
    ar.bounces = ar.kind === 'rocket' ? 0 : w.stats.bounces;
    ar.seek = w.stats.seek > 0 && (k === 0 || w.stats.swarm);
    ar.over = over;
    ar.focus = focus;
    ar.primary = first && k === 0;
  }
}

function spawnArrow(w: World, owner: 'player' | 'enemy', kind: Arrow['kind'], x: number, y: number, vx: number, vy: number): Arrow | null {
  let pick: Arrow | null = null;
  for (const a of w.arrows) {
    if (!a.active) {
      pick = a;
      break;
    }
  }
  if (!pick) {
    // recycle the oldest stuck arrow
    let oldest = Infinity;
    for (const a of w.arrows) {
      if (a.state !== 0 && a.seq < oldest) {
        oldest = a.seq;
        pick = a;
      }
    }
  }
  if (!pick) return null;
  const a = pick;
  a.active = true;
  a.owner = owner;
  a.kind = kind;
  a.state = 0;
  a.x = x;
  a.y = y;
  a.vx = vx;
  a.vy = vy;
  a.angle = Math.atan2(vy, vx);
  a.age = 0;
  a.gravityMul = 1;
  a.windMul = 1;
  a.life = kind === 'arrow' || owner === 'player' ? 5 : 6;
  a.dmgMul = 1;
  a.impulseMul = 1;
  a.fire = false;
  a.pierce = 0;
  a.bounces = 0;
  a.ignore = -1;
  a.host = -1;
  a.fade = 0;
  a.seq = w.arrowSeq++;
  a.soft = false;
  a.by = -1;
  a.seek = false;
  a.over = false;
  a.primary = false;
  a.focus = false;
  a.scored = false;
  a.fromLedge = -1;
  a.homing = 0;
  a.hex = false;
  a.frost = false;
  a.blast = false;
  a.turnT = 0;
  a.hitIds.length = 0;
  return a;
}

/** Unleash a full focus meter: a few seconds of powered-up shots. */
export function unleash(w: World): boolean {
  if (w.focus < 1 || w.focusT > 0 || !w.player.alive) return false;
  if (w.phase !== 'play' && w.phase !== 'bonus' && w.phase !== 'clear') return false;
  w.focus = 0;
  w.focusT = w.stats.focusTime;
  w.run.focusUses += 1;
  w.events.push({ t: 'focus', on: true });
  return true;
}

function gainFocus(w: World, k: number): void {
  if (w.focusT > 0 || w.focus >= 1) return;
  w.focus = Math.min(1, w.focus + k * w.stats.focusGain);
  if (w.focus >= 1) w.events.push({ t: 'focusReady' });
}

// ---------------------------------------------------------------- cards

export function pickCard(w: World, index: number): boolean {
  if (w.phase !== 'cards') return false;
  const card = w.offer[index];
  if (!card) return false;
  w.cards.push(card);
  const before = w.stats.maxHp;
  w.stats = statsFor(w.cards, w.meta, w.difficulty);
  const gain = w.stats.maxHp - before;
  w.player.maxHp = w.stats.maxHp;
  if (gain > 0) {
    w.player.hp = Math.min(w.player.maxHp, w.player.hp + gain);
    w.events.push({ t: 'heal', amount: gain });
  }
  w.offer = [];
  w.phase = 'play';
  w.phaseT = 0;
  spawnWave(w, w.wave + 1, false);
  return true;
}

export function reroll(w: World): boolean {
  if (w.phase !== 'cards' || w.rerollsLeft <= 0) return false;
  w.rerollsLeft -= 1;
  w.offer = drawOffer(w.cardRng, w.cards, w.offer.length, pickChapter(w), w.stats.weapon);
  return true;
}

/** Rewarded: one more card to choose from (once per pick). */
export function addExtraCard(w: World): boolean {
  if (w.phase !== 'cards' || w.offerExtra) return false;
  const more = drawOffer(w.cardRng, [...w.cards, ...w.offer.flatMap((c) => Array<CardId>(9).fill(c))], 1, pickChapter(w), w.stats.weapon);
  if (more.length === 0) return false;
  w.offer.push(more[0]!);
  w.offerExtra = true;
  return true;
}

/** Rewarded: once per run, continue with half health. */
export function revive(w: World): boolean {
  if (w.phase !== 'over' || w.revived) return false;
  w.revived = true;
  const old = w.player;
  w.player = makeArcher(w, 'player', PLAYER_X, PLAYER_LEDGE.y, 1, 0);
  w.player.maxHp = w.stats.maxHp;
  w.player.hp = Math.ceil(w.stats.maxHp / 2);
  for (const a of w.arrows) {
    if (!a.active) continue;
    if (a.owner === 'enemy' && a.state === 0) a.active = false;
    if (a.state === 2 && a.host === old.id) a.active = false;
  }
  for (const e of w.enemies) {
    if (e.alive && e.brain !== 'jump' && e.brain !== 'spawn') {
      e.brain = 'wait';
      e.timer = 1.6;
      e.draw = 0;
    }
  }
  w.phase = w.bonus ? 'bonus' : w.enemies.some((e) => e.alive) ? 'play' : 'clear';
  w.phaseT = 0;
  return true;
}

// ---------------------------------------------------------------- step

/** Longest stretch of game time one `advance` call may cover (a hitch never launches bodies). */
export const MAX_ADVANCE = 0.25;
/** Safety cap when nobody drains events (headless runs); the scene drains every frame. */
const EVENT_CAP = 4000;

/**
 * Advance by `seconds` of game time in fixed ticks. Events accumulate in `w.events` until
 * `takeEvents` hands them over, so input handled before the step (a shot) is never lost.
 */
export function advance(w: World, seconds: number): void {
  w.acc += Math.min(seconds, MAX_ADVANCE);
  while (w.acc >= DT) {
    w.acc -= DT;
    tick(w);
  }
  if (w.events.length > EVENT_CAP) w.events.splice(0, w.events.length - EVENT_CAP);
}

/**
 * All events since the previous call, exactly once. The returned array is reused by the call
 * after next, so consume it before calling again (the scene does, every frame).
 */
export function takeEvents(w: World): GameEvent[] {
  const out = w.events;
  w.events = w.spareEvents;
  w.events.length = 0;
  w.spareEvents = out;
  return out;
}

function tick(w: World): void {
  w.time += DT;
  w.phaseT += DT;
  if (w.reload > 0) w.reload = Math.max(0, w.reload - DT);
  if (w.focusT > 0) {
    w.focusT -= DT;
    if (w.focusT <= 0) {
      w.focusT = 0;
      w.events.push({ t: 'focus', on: false });
    }
  }
  if (w.volleyQueue > 0) {
    w.volleyT -= DT;
    if (w.volleyT <= 0) {
      fireVolley(w, w.volleyAngle + 0.012 * w.volleyQueue, w.volleyPower, false);
      w.volleyQueue -= 1;
      w.volleyT = 0.12;
    }
  }
  updateMovers(w);
  if (w.gustEvery > 0 && w.phase === 'play') updateGust(w);
  updateArcher(w, w.player);
  for (let i = 0; i < w.enemies.length; i++) updateArcher(w, w.enemies[i]!);
  updatePlates(w);
  updateArrows(w);
  updateProps(w);
  if (w.phase === 'play') updateApples(w);
  if (w.phase === 'bonus') updateBonus(w);
  switch (w.phase) {
    case 'play':
      if (w.enemies.every((e) => !e.alive)) clearWave(w);
      break;
    case 'clear':
      if (w.phaseT >= TUNING.clearDelay) {
        const bonus = bonusAfter(w.wave);
        if (bonus && !w.bonus) startBonus(w, bonus);
        else openCards(w);
      }
      break;
    case 'dying':
      if (w.phaseT >= TUNING.dyingTime) {
        w.phase = 'over';
        w.phaseT = 0;
        w.events.push({ t: 'dead' });
      }
      break;
    default:
      break;
  }
}

function clearWave(w: World): void {
  w.phase = 'clear';
  w.phaseT = 0;
  const coins = Math.round((2 + w.level) * coinMul(w));
  w.run.coins += coins;
  heal(w, clearHeal(w));
  w.events.push({ t: 'waveClear', wave: w.wave, coins });
  if (w.stage === STAGES && !stageOf(w.wave).endless) w.run.chapterStage[w.chapter] = STAGES + 1;
  const o = w.objective;
  if (o) {
    let ok: boolean;
    if (o.kind === 'noHit') ok = !o.hit;
    else if (o.kind === 'fast') ok = w.time - w.waveT0 <= o.limit;
    else if (o.kind === 'heads') ok = o.heads >= 1;
    else ok = o.multi;
    const reward = ok ? Math.round((4 + 2 * Math.min(4, w.chapter)) * coinMul(w)) : 0;
    w.run.coins += reward;
    if (ok) w.run.objectives += 1;
    w.events.push({ t: 'objective', kind: o.kind, ok, coins: reward });
    w.objective = null;
  }
}

/** A gusty stage: the wind turns around every `gustEvery` seconds. */
function updateGust(w: World): void {
  w.gustT -= DT;
  if (w.gustT > 0) return;
  w.gustT = w.gustEvery;
  flipWind(w, 1, -1, 360, 330);
}

/** The wind turns around (×k, at most `cap`); a gust event for the views. */
function flipWind(w: World, k: number, by: number, x: number, y: number, cap = 320): void {
  const s = w.wind === 0 ? 1 : -Math.sign(w.wind);
  w.wind = s * Math.min(cap, Math.max(150, Math.abs(w.wind) * k));
  w.events.push({ t: 'gust', wind: w.wind, by, x, y });
}

/** Health back at a wave clear: TUNING.waveClearHeal, +4 per chapter. */
export function clearHeal(w: World): number {
  return TUNING.waveClearHeal + 4 * Math.min(CHAPTERS, w.chapter);
}

/** The chapter a card pick leads into (cards of later chapters are not offered yet). */
function pickChapter(w: World): number {
  return stageOf(w.wave + 1).chapter;
}

function openCards(w: World): void {
  const n = w.treasure ? 4 : 3;
  const treasure = w.treasure;
  w.treasure = false;
  w.bonus = null;
  for (const t of w.targets) t.active = false;
  w.offerExtra = false;
  w.offer = drawOffer(w.cardRng, w.cards, n, pickChapter(w), w.stats.weapon);
  if (w.offer.length === 0) {
    // every card is maxed out: straight on to the next wave
    w.phase = 'play';
    w.phaseT = 0;
    spawnWave(w, w.wave + 1, false);
    return;
  }
  w.phase = 'cards';
  w.phaseT = 0;
  // nothing still in the air may land while the player is choosing
  for (const a of w.arrows) if (a.active && a.state === 0) a.active = false;
  w.events.push({ t: 'cards', treasure });
}

function heal(w: World, amount: number): void {
  const p = w.player;
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  if (p.hp > before) w.events.push({ t: 'heal', amount: p.hp - before });
}

// ---------------------------------------------------------------- moving ledges

function updateMovers(w: World): void {
  for (const m of w.movers) {
    const L = w.ledges[m.index];
    if (!L) continue;
    const ox = L.x;
    const oy = L.y;
    if (m.cut) {
      if (L.y > 1500) continue;
      m.vy += 1900 * DT;
      L.y += m.vy * DT;
    } else {
      m.theta += m.speed * DT;
      if (m.kind === 'slide') L.x = m.x0 + m.amp * Math.sin(m.theta);
      else if (m.kind === 'bob') L.y = m.y0 + m.amp * Math.sin(m.theta);
      else {
        const ang = (m.amp / m.len) * Math.sin(m.theta);
        L.x = m.pivotX + m.len * Math.sin(ang) - L.w / 2;
        L.y = m.pivotY + m.len * Math.cos(ang);
      }
    }
    const dx = L.x - ox;
    const dy = L.y - oy;
    if (dx === 0 && dy === 0) continue;
    // riders, barrels and arrows stuck in the ledge move with it
    for (const e of w.enemies) {
      if (!e.alive || e.ledge !== m.index || e.brain === 'spawn' || e.brain === 'jump' || e.falling > 0) continue;
      e.anchorX += dx;
      e.stanceX += dx;
      e.anchorY += dy;
      translateBody(e.body, dx, dy);
      if (e.shield) translateBody(e.shield, dx, dy);
    }
    for (const p of w.props) {
      if (!p.active || p.kind !== 'barrel') continue;
      if (p.y + p.h >= oy - 2 && p.y + p.h <= oy + 4 && p.x + p.w > ox && p.x < ox + L.w) {
        p.x += dx;
        p.y += dy;
      }
    }
    for (const wl of w.walls) {
      if (wl.on !== m.index) continue;
      wl.x += dx;
      wl.y += dy;
    }
    for (const a of w.arrows) {
      if (a.active && a.state === 1 && a.host === m.index) {
        a.x += dx;
        a.y += dy;
      }
    }
  }
}

function cutRopes(w: World, x0: number, y0: number, x1: number, y1: number): void {
  for (const m of w.movers) {
    if (m.kind !== 'swing' || m.cut) continue;
    const L = w.ledges[m.index]!;
    const r = FX.ropeRadius;
    const hit = sweepCapsule(x0, y0, x1, y1, m.pivotX, m.pivotY, L.x + 10, L.y, r) >= 0 || sweepCapsule(x0, y0, x1, y1, m.pivotX, m.pivotY, L.x + L.w - 10, L.y, r) >= 0;
    if (!hit) continue;
    m.cut = true;
    m.vy = 0;
    let riders = 0;
    for (const e of w.enemies) {
      if (!e.alive || e.ledge !== m.index || e.brain === 'spawn' || e.brain === 'jump') continue;
      riders += 1;
      setFeetPinned(e, false);
      e.falling = DT;
      e.stagger = 2;
    }
    w.run.ropeDrops += riders;
    w.events.push({ t: 'rope', x: x1, y: y1, kind: 'swing', riders });
  }
  for (const p of w.props) {
    if (!p.active || p.kind !== 'rock' || !p.hanging) continue;
    if (sweepCapsule(x0, y0, x1, y1, p.x, p.pivotY, p.x, p.y - p.w, FX.ropeRadius) < 0) continue;
    p.hanging = false;
    p.vy = 0;
    w.events.push({ t: 'rope', x: x1, y: y1, kind: 'rock', riders: 0 });
  }
}

// ---------------------------------------------------------------- props

function updateProps(w: World): void {
  for (const p of w.props) {
    if (!p.active || p.kind !== 'rock' || p.hanging) continue;
    p.vy += 1900 * DT;
    const y0 = p.y;
    p.y += p.vy * DT;
    for (const e of w.enemies) {
      if (!e.alive || e.brain === 'spawn') continue;
      const hx = e.body.x[PT.head]! - p.x;
      const hy = e.body.y[PT.head]! - p.y;
      const nx = e.body.x[PT.neck]! - p.x;
      const ny = e.body.y[PT.neck]! - p.y;
      const rr = (p.w + 24 * e.scale) ** 2;
      if (hx * hx + hy * hy < rr || nx * nx + ny * ny < rr) {
        w.events.push({ t: 'rockHit', x: p.x, y: p.y, id: e.id });
        addVelocity(e.body, PT.head, 0, 600, DT);
        if (e.type === 'boss') damageEnemy(w, e, 150 * w.stats.dmgMul, 'crush');
        else damageEnemy(w, e, 1e6, 'crush');
      }
    }
    for (let i = 1; i < w.ledges.length; i++) {
      const L = w.ledges[i]!;
      if (p.x > L.x - 6 && p.x < L.x + L.w + 6 && y0 + p.w <= L.y + 4 && p.y + p.w >= L.y) {
        p.active = false;
        w.events.push({ t: 'rockBreak', x: p.x, y: L.y - p.w });
        break;
      }
    }
    if (p.y > 1400) p.active = false;
  }
}

function explodeBarrel(w: World, p: Prop): void {
  if (!p.active) return;
  p.active = false;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const R = FX.barrelRadius * (w.stats.inferno ? 1.2 : 1);
  let kills = 0;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const t = targetPoint(e, 'chest');
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d > R + 20 * e.scale) continue;
    pushBody(e.body, cx, cy, (t.x - cx) * 6, -500, 0.5, 160);
    const dmg = (e.type === 'boss' ? 0.5 : 1) * FX.barrelDamage * w.stats.dmgMul;
    if (damageEnemy(w, e, dmg, 'blast')) kills += 1;
    if (w.stats.inferno && e.alive) setBurn(w, e);
  }
  w.run.barrelBest = Math.max(w.run.barrelBest, kills);
  w.events.push({ t: 'barrel', x: cx, y: cy, kills });
  // other barrels in reach go up too
  for (const q of w.props) {
    if (q.active && q.kind === 'barrel' && Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy) < R) explodeBarrel(w, q);
  }
}

// ---------------------------------------------------------------- archers

function poseArcher(a: Archer, time: number): void {
  const bob = Math.sin(time * 2.2 + a.bob) * 1.6 * a.scale;
  const face = a.facing;
  setPose(a.body, a.stanceX, a.anchorY, face, a.aim, a.draw, a.scale, a.crouch, bob);
  if (a.brain === 'jump') {
    // tuck the legs mid-hop
    const b = a.body;
    b.ty[PT.footF] = b.ty[PT.footF]! - 16 * a.scale;
    b.ty[PT.footB] = b.ty[PT.footB]! - 12 * a.scale;
  }
}

function setFeetPinned(a: Archer, on: boolean): void {
  a.body.pin[PT.footF] = on ? 1 : 0;
  a.body.pin[PT.footB] = on ? 1 : 0;
}

function enemyLedge(w: World, a: Archer): Ledge | undefined {
  return w.ledges[a.ledge];
}

function updateArcher(w: World, a: Archer): void {
  if (a.gone) return;
  const b = a.body;
  a.hurt += DT;
  if (a.alive) {
    if (a.falling > 0) {
      a.falling += DT;
      b.muscle = 0.03;
    } else if (b.muscle < 1) b.muscle = Math.min(1, b.muscle + TUNING.muscleRecover * DT);
    if (a.stagger > 0) a.stagger -= DT;
    if (a.wobble > 0) a.wobble -= DT;
    if (a.catchCd > 0) a.catchCd -= DT;
    if (!a.wardUp && a.type === 'ward') {
      a.wardT -= DT;
      if (a.wardT <= 0) {
        a.wardUp = true;
        w.events.push({ t: 'ward', id: a.id, x: b.x[PT.neck]!, y: b.y[PT.neck]!, up: true });
      }
    }
    a.crouch = Math.max(0, a.crouch - DT * 2.5);
    // stance slides toward a shoved anchor
    a.stanceX += (a.anchorX - a.stanceX) * Math.min(1, DT * 7);
    if (a.type !== 'player') brain(w, a);
    poseArcher(a, w.time);
    // burning
    if (a.burn > 0) {
      a.burn -= DT;
      a.burnTick -= DT;
      if (a.burnTick <= 0) {
        a.burnTick = 0.5;
        const dmg = a.burnDps * 0.5;
        a.hp -= dmg;
        w.events.push({ t: 'burn', id: a.id, x: b.x[PT.neck]!, y: b.y[PT.neck]!, dmg });
        if (a.hp <= 0) knockOut(w, a, 'burn');
      }
    }
    // dragged off the ledge (feet free and pelvis well below the stance)
    if (a.alive && a.falling > 0 && (b.y[PT.pelvis]! > a.anchorY + 40 * a.scale || a.falling > 0.9)) {
      knockOut(w, a, 'fall');
    }
  } else {
    a.koTime += DT;
    updateDangle(w, a);
    const fellAway = b.y[PT.pelvis]! > 1500;
    // the knocked-out player stays on its ledge under the result screen; enemies poof
    if (a.type !== 'player' && (fellAway || (a.koTime > TUNING.poofAfter && a.dangle < 0))) {
      poof(w, a);
      return;
    }
  }
  // dropping in from the sky or mid-hop: pass through other ledges instead of snagging on them
  const ghost = a.alive && (a.brain === 'spawn' || a.brain === 'jump');
  stepBody(b, DT, ghost ? NO_LEDGES : w.ledges);
  if (a.shield) {
    stepBody(a.shield, DT, ghost ? NO_LEDGES : w.ledges);
    if (a.shieldOn && a.alive) {
      // the planted shield follows the stance
      const L = enemyLedge(w, a);
      if (L) {
        const sx = a.stanceX + a.facing * 30 * a.scale;
        a.shield.tx[0] = sx;
        a.shield.ty[0] = L.y - 104;
        a.shield.tx[1] = sx;
        a.shield.ty[1] = L.y - 6;
      }
    }
  }
}

function updateDangle(w: World, a: Archer): void {
  const b = a.body;
  if (a.dangle >= 0) {
    a.dangleTime -= DT;
    if (a.dangleTime <= 0) {
      b.pin[a.dangle] = 0;
      a.dangle = -1;
      a.mayDangle = false;
      a.koTime = Math.min(a.koTime, TUNING.poofAfter - 1.1);
    }
    return;
  }
  if (!a.mayDangle || a.koTime > 1.6) return;
  for (const hand of [PT.handF, PT.handB]) {
    const hx = b.x[hand]!;
    const hy = b.y[hand]!;
    for (let l = 0; l < w.ledges.length; l++) {
      const L = w.ledges[l]!;
      if (w.movers.some((m) => m.index === l)) continue; // never hang from a moving ledge
      if (b.y[PT.pelvis]! < L.y + 10) continue; // only when the body hangs below the top
      for (const side of [0, 1]) {
        const cx = side === 0 ? L.x : L.x + L.w;
        const cy = L.y;
        const dx = hx - cx;
        const dy = hy - cy;
        if (dx * dx + dy * dy < (28 * a.scale) ** 2) {
          a.dangle = hand;
          a.dangleTime = w.rng.range(TUNING.dangleTime[0], TUNING.dangleTime[1]);
          b.pin[hand] = 1;
          b.tx[hand] = cx + (side === 0 ? 3 : -3);
          b.ty[hand] = cy + 2;
          return;
        }
      }
    }
  }
}

function poof(w: World, a: Archer): void {
  if (a.gone) return;
  a.gone = true;
  a.alive = false;
  for (const ar of w.arrows) if (ar.active && (ar.state === 2 || ar.state === 3) && ar.host === a.id) ar.active = false;
  w.events.push({ t: 'poof', id: a.id, x: a.body.x[PT.pelvis]!, y: a.body.y[PT.pelvis]! - 20 * a.scale, enemy: a.type === 'player' ? 'archer' : a.type });
}

function knockOut(w: World, a: Archer, cause: KoCause): void {
  if (!a.alive) return;
  a.alive = false;
  a.hp = 0;
  a.koCause = cause;
  a.koTime = 0;
  a.draw = 0;
  a.body.muscle = 0;
  setFeetPinned(a, false);
  a.mayDangle = w.rng.chance(a.type === 'boss' ? 0.3 : 0.7);
  if (a.shield && a.shieldOn) dropShield(w, a, a.facing * 120);
  if (a.type === 'player') {
    w.phase = 'dying';
    w.phaseT = 0;
    w.events.push({ t: 'dying' });
    return;
  }
  const r = w.run;
  r.kos += 1;
  if (r.firstKoShot === 0) r.firstKoShot = Math.max(1, r.shots);
  const head = cause === 'head';
  let coins = 3 + Math.floor(w.level / 2) + (head ? (w.mod === 'heads' ? 4 : 2) : 0);
  coins = Math.round(coins * coinMul(w));
  r.coins += coins;
  const hx = a.body.x[PT.head]!;
  const hy = a.body.y[PT.head]!;
  w.events.push({ t: 'ko', id: a.id, x: hx, y: hy, cause, coins, enemy: a.type });
  // streaks, multi-kills, focus
  r.streak += 1;
  r.streakBest = Math.max(r.streakBest, r.streak);
  if (FX.streaks.includes(r.streak)) w.events.push({ t: 'streak', n: r.streak });
  r.multiN = w.time - r.lastKo <= FX.multiWindow ? r.multiN + 1 : 1;
  r.lastKo = w.time;
  if (r.multiN >= 2) {
    r.multiBest = Math.max(r.multiBest, r.multiN);
    w.events.push({ t: 'multi', n: r.multiN, x: hx, y: hy });
    gainFocus(w, FX.focusMulti);
    if (w.objective) w.objective.multi = true;
  }
  gainFocus(w, FX.focusKo);
  if (head && w.objective) w.objective.heads += 1;
  // loot bursts out of bosses and elites
  if (a.type === 'boss' || a.type === 'elite') {
    const ch = a.bossKind ? BOSS_KINDS.indexOf(a.bossKind) : w.chapter;
    const loot = Math.round((a.type === 'boss' ? 25 + 10 * ch : 10 + 3 * Math.min(CHAPTERS, w.chapter)) * coinMul(w));
    r.coins += loot;
    w.events.push({ t: 'loot', x: hx, y: hy, coins: loot, kind: a.type });
  }
  if (a.type === 'boss') {
    r.bossKills.push({ kind: BOSS_KINDS.indexOf(a.bossKind ?? 'shields'), time: Math.round((w.time - w.waveT0) * 10) / 10 });
    w.treasure = true;
    // the summoner's spell breaks: its imps go down with it
    for (const e of w.enemies) if (e.alive && e.type === 'imp') knockOut(w, e, 'blast');
    for (const p of w.plates) p.active = false;
  }
  if (w.stats.boomDmg > 0 && cause !== 'fall') boom(w, a);
}

/** The boom card: a knocked-out enemy bursts, hurting (and with inferno burning) its neighbours. */
function boom(w: World, a: Archer): void {
  const c = targetPoint(a, 'chest');
  w.events.push({ t: 'blast', x: c.x, y: c.y, r: FX.boomRadius, fire: w.stats.inferno, rocket: false });
  for (const e of w.enemies) {
    if (!e.alive || e === a) continue;
    const t = targetPoint(e, 'chest');
    if (Math.hypot(t.x - c.x, t.y - c.y) > FX.boomRadius + 20 * e.scale) continue;
    damageEnemy(w, e, w.stats.boomDmg * w.stats.dmgMul * (e.type === 'boss' ? 0.5 : 1), 'blast');
    if (w.stats.inferno && e.alive) setBurn(w, e);
  }
}

function setBurn(w: World, e: Archer): void {
  e.burn = Math.max(e.burn, w.stats.fireTime || 2.5);
  e.burnDps = Math.max(e.burnDps, w.stats.fireDps || 10);
  e.burnTick = Math.min(e.burnTick || 0.5, 0.5);
}

/** Damage from a blast, rock or chain (no part, no slow motion). Returns true on a knockout. */
function damageEnemy(w: World, e: Archer, dmg: number, cause: KoCause): boolean {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.hurt = 0;
  e.body.muscle = Math.min(e.body.muscle, e.type === 'boss' ? 0.35 : TUNING.hitMuscle);
  checkBossPhase(w, e);
  if (e.hp <= 0) {
    knockOut(w, e, cause);
    return true;
  }
  return false;
}

function dropShield(_w: World, a: Archer, vx: number): void {
  const s = a.shield;
  if (!s) return;
  a.shieldOn = false;
  s.pin[0] = 0;
  s.pin[1] = 0;
  addVelocity(s, 0, vx * 1.6, -380, DT);
  addVelocity(s, 1, vx * 0.6, -120, DT);
}

function gauss(r: Rng): number {
  const u = Math.max(1e-9, r.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next());
}

function checkBossPhase(w: World, e: Archer): void {
  if (e.type !== 'boss' || e.bossPhase !== 1 || e.hp > e.maxHp * 0.5 || e.hp <= 0) return;
  e.bossPhase = 2;
  e.stagger = Math.max(e.stagger, 0.6);
  const m = w.movers.find((q) => q.index === e.ledge);
  if (m && e.bossKind === 'giant') m.speed *= 1.8;
  w.events.push({ t: 'bossPhase', id: e.id, kind: e.bossKind ?? 'shields', x: e.body.x[PT.head]!, y: e.body.y[PT.head]! });
}

function brain(w: World, a: Archer): void {
  const active = w.phase === 'play' || w.phase === 'clear';
  if (a.chill > 0) a.chill = Math.max(0, a.chill - DT);
  if (a.blinkCd > 0) a.blinkCd -= DT;
  if (a.brain === 'spawn') {
    a.spawnT += DT;
    const t = Math.min(1, a.spawnT / 0.55);
    const lift = 900 * (1 - t) * (1 - t);
    // drops in from the sky as a rigid unit (no stretching), then lands in a crouch
    const L = enemyLedge(w, a);
    if (L) {
      const y = L.y - LEG_HEIGHT * a.scale - lift;
      translateBody(a.body, 0, y - a.anchorY);
      if (a.shield) translateBody(a.shield, 0, y - a.anchorY);
      a.anchorY = y;
      // a moving ledge carries the spot it lands on
      const dx = L.x + L.w / 2 - a.anchorX;
      if (Math.abs(dx) > 0.01 && w.movers.some((m) => m.index === a.ledge)) {
        a.anchorX += dx;
        a.stanceX += dx;
        translateBody(a.body, dx, 0);
        if (a.shield) translateBody(a.shield, dx, 0);
      }
    }
    if (t >= 1) {
      a.brain = 'wait';
      a.crouch = 1;
    }
    return;
  }
  if (a.brain === 'jump') {
    a.jumpT += DT;
    const t = Math.min(1, a.jumpT / a.jumpDur);
    a.anchorX = a.stanceX = a.jx0 + (a.jx1 - a.jx0) * t;
    a.anchorY = a.jy0 + (a.jy1 - a.jy0) * t - 160 * 4 * t * (1 - t);
    if (t >= 1) {
      a.brain = 'cool';
      a.timer = 0.4;
      a.crouch = 1;
      setFeetPinned(a, true);
    }
    return;
  }
  if (!active || !w.player.alive) {
    a.draw = Math.max(0, a.draw - DT * 3);
    return;
  }
  if (a.type === 'boss') bossSpecial(w, a);
  if (a.stagger > 0 && a.brain === 'draw') {
    a.brain = 'cool';
    a.timer = 0.5;
    a.draw = 0;
  }
  // frost arrows: a chilled archer's clock runs slow (draw, cool-down, hops)
  const slow = a.chill > 0 ? w.stats.frostSlow : 1;
  a.timer -= DT * slow;
  const timing = enemyTiming(w.level, w.difficulty);
  const drawTime = drawTimeOf(a, timing.draw);
  switch (a.brain) {
    case 'wait':
    case 'cool':
      a.draw = Math.max(0, a.draw - DT * 4);
      if (a.type === 'jumper') {
        a.jumpCooldown -= DT * slow;
        if (a.jumpCooldown <= 0 && a.timer > 0.2 && tryJump(w, a)) return;
      }
      if (a.timer <= 0) {
        if (a.type === 'healer') {
          a.brain = 'draw';
          a.timer = drawTime;
        } else beginDraw(w, a, drawTime);
      }
      break;
    case 'draw': {
      a.draw = Math.min(1, a.draw + (DT * slow) / drawTime);
      if (a.type === 'healer') {
        if (a.timer <= 0) {
          // nobody to mend (or it is the last one standing): the gathered spell strikes the player
          if (healAllies(w, a) === 0) castOrb(w, a, FX.hexSpeed, FX.healerHex, 0);
          a.brain = 'cool';
          a.timer = FX.healEvery + w.brainRng.range(0, 0.6);
        }
        break;
      }
      a.aim += (a.aimGoal - a.aim) * Math.min(1, DT * 8);
      if (a.timer <= 0) {
        release(w, a);
        a.brain = 'cool';
        a.timer = timing.cool + w.brainRng.range(0, 0.6);
      }
      break;
    }
    default:
      break;
  }
}

function drawTimeOf(a: Archer, draw: number): number {
  switch (a.type) {
    case 'boss':
      return draw * 1.15;
    case 'imp':
      return draw * 0.8;
    case 'healer':
      return 0.8;
    // the wizard gathers its hex a beat longer; the volley archer hauls a heavy war bow
    case 'mage':
      return draw * 1.2;
    case 'volley':
      return draw * 1.35;
    default:
      return draw;
  }
}

/** Mends every wounded ally (not bosses); returns how many it mended. */
function healAllies(w: World, h: Archer): number {
  let n = 0;
  for (const e of w.enemies) {
    if (!e.alive || e === h || e.type === 'boss' || e.hp >= e.maxHp) continue;
    const amount = Math.min(e.maxHp - e.hp, Math.round(e.maxHp * FX.healShare));
    e.hp += amount;
    n += 1;
    w.events.push({ t: 'healBeam', from: h.id, to: e.id, x0: h.body.x[PT.handF]!, y0: h.body.y[PT.handF]!, x1: e.body.x[PT.neck]!, y1: e.body.y[PT.neck]!, amount });
  }
  return n;
}

/** Where a staff-carrier's orb leaves: the staff's tip (as both renderers draw it). */
export function staffTip(a: Archer): { x: number; y: number } {
  return { x: a.body.x[PT.handF]! + 4 * a.scale, y: a.body.y[PT.handF]! - 52 * a.scale };
}

/**
 * A staff-carrier's spell: one orb from the staff's tip straight at the player's chest (orbs
 * fly without gravity or wind), `share` of an orb's damage, turning toward the player at
 * `homing` rad/s. It leaves the caster's own ledge without popping on its edge.
 */
function castOrb(w: World, a: Archer, speed: number, share: number, homing: number): void {
  const acc = enemyAccuracy(w.level, w.difficulty);
  const o = staffTip(a);
  const ang = Math.atan2(playerPelvisY() - 30 - o.y, PLAYER_X - o.x) + gauss(w.brainRng) * (acc.angle + a.aimPenalty) * 0.3;
  const ar = spawnArrow(w, 'enemy', 'orb', o.x, o.y, Math.cos(ang) * speed, Math.sin(ang) * speed);
  if (ar) {
    ar.by = a.id;
    ar.dmgMul = share;
    ar.homing = homing;
    ar.fromLedge = a.ledge;
    ar.hex = true;
    ar.life = 7;
  }
  w.run.enemyShots += 1;
  a.shotsFired += 1;
  a.draw = 0;
  w.events.push({ t: 'enemyShot', id: a.id, kind: 'orb', x: o.x, y: o.y });
}

/**
 * The wizard, hit and still standing, vanishes and reappears on a free ledge that does not move
 * (once every FX.blinkCooldown s): a second arrow has to find it again.
 */
function blink(w: World, e: Archer): void {
  if (!e.alive || e.blinkCd > 0 || e.falling > 0 || e.brain === 'jump' || e.brain === 'spawn') return;
  const free: number[] = [];
  for (let i = 1; i < w.ledges.length; i++) {
    if (i === e.ledge || w.movers.some((m) => m.index === i)) continue;
    if (w.enemies.some((o) => o.alive && o.ledge === i)) continue;
    free.push(i);
  }
  if (free.length === 0) return;
  const to = free[w.brainRng.int(0, free.length - 1)]!;
  const L = w.ledges[to]!;
  const x0 = e.body.x[PT.neck]!;
  const y0 = e.body.y[PT.neck]!;
  const dx = L.x + L.w / 2 - e.stanceX;
  const dy = L.y - LEG_HEIGHT * e.scale - e.anchorY;
  translateBody(e.body, dx, dy);
  e.anchorX += dx;
  e.stanceX += dx;
  e.anchorY += dy;
  e.ledge = to;
  e.blinkCd = FX.blinkCooldown;
  e.brain = 'cool';
  e.timer = Math.max(e.timer, 0.7);
  e.draw = 0;
  e.crouch = 1;
  w.events.push({ t: 'blink', id: e.id, x0, y0, x1: e.body.x[PT.neck]!, y1: e.body.y[PT.neck]! });
}

/** A frost hit (or a shatter burst): the archer's clock runs slow for `t` seconds. */
function chillEnemy(w: World, e: Archer, t: number): void {
  if (!e.alive || t <= 0) return;
  if (e.chill <= 0) w.events.push({ t: 'chill', id: e.id, x: e.body.x[PT.neck]!, y: e.body.y[PT.neck]! });
  e.chill = Math.max(e.chill, t);
}

/**
 * Blast arrows: the arrow bursts where it lands (an archer, a shield, a ledge or a wall) and
 * every other archer within the radius takes a share of a body hit: shields and cover walls
 * stop the arrow, not the burst.
 */
function burst(w: World, a: Arrow, x: number, y: number, struck: Archer | null): void {
  // a firework rocket bursts with its own radius (perk-scaled) and full body damage; the blast card's numbers are for arrows
  const rocket = a.kind === 'rocket';
  const r = rocket ? rocketRadius(w) : w.stats.blastRadius;
  const dmg = ENEMY_DAMAGE.body * a.dmgMul * (rocket ? ROCKET.share : w.stats.blastShare);
  w.events.push({ t: 'blast', x, y, r, fire: false, rocket });
  for (const e of w.enemies) {
    if (!e.alive || e === struck || e.brain === 'spawn') continue;
    const t = targetPoint(e, 'chest');
    if (Math.hypot(t.x - x, t.y - y) > r + 20 * e.scale) continue;
    damageEnemy(w, e, dmg * (e.type === 'boss' ? 0.5 : 1), 'blast');
    if (rocket) a.scored = true;
    if (w.stats.shatter) chillEnemy(w, e, w.stats.frostTime);
  }
}

/** Boss mechanics that are not just "more health". */
function bossSpecial(w: World, a: Archer): void {
  if (a.bossKind === 'magma') return eruption(w, a);
  if (a.bossKind === 'tempest') return tempest(w, a);
  if (a.bossKind !== 'summoner') return;
  a.special -= DT;
  if (a.special > 0) return;
  a.special = a.bossPhase === 2 ? 4 : 5.5;
  const cap = a.bossPhase === 2 ? 3 : 2;
  let imps = 0;
  for (const e of w.enemies) if (e.alive && e.type === 'imp') imps += 1;
  if (imps >= cap) return;
  for (let i = 2; i < w.ledges.length; i++) {
    if (w.enemies.some((e) => e.alive && e.ledge === i)) continue;
    const L = w.ledges[i]!;
    const e = makeArcher(w, 'imp', L.x + L.w / 2, L.y, -1, i);
    e.brain = 'spawn';
    e.spawnT = 0;
    e.anchorY -= 900;
    translateBody(e.body, 0, -900);
    e.timer = 0.9 + w.brainRng.range(0, 0.5);
    e.shotsFired = 1; // summoned imps aim true from their first shot
    w.enemies.push(e);
    w.events.push({ t: 'summon', id: e.id, x: L.x + L.w / 2, y: L.y - 60 });
    return;
  }
}

/** Lava rocks that the cinder king's eruption drops around the player (offsets in px from PLAYER_X). */
export const ERUPTION_PHASE1 = [-110, 0, 110] as const;
export const ERUPTION_PHASE2 = [-95, -15, 65, 145] as const;

/**
 * The cinder king: every 7 s (5 s in phase 2) it calls lava rocks down from the top of the sky
 * in a row around the player. They are bombs: one always falls on the player (in phase 2 the
 * row is offset so two land close) and each can be shot out of the air.
 */
function eruption(w: World, a: Archer): void {
  a.special -= DT;
  if (a.special > 0) return;
  a.special = a.bossPhase === 2 ? 5 : 7;
  const row = a.bossPhase === 2 ? ERUPTION_PHASE2 : ERUPTION_PHASE1;
  const jitter = w.brainRng.range(-24, 24);
  for (let i = 0; i < row.length; i++) {
    const x = PLAYER_X + row[i]! + jitter;
    const y = -70 - i * 45;
    const ar = spawnArrow(w, 'enemy', 'bomb', x, y, w.brainRng.range(-25, 25), 120);
    if (ar) {
      ar.by = a.id;
      ar.life = 4;
    }
    w.run.enemyShots += 1;
    w.events.push({ t: 'eruption', id: a.id, x, y: 40 });
  }
  a.stagger = Math.max(a.stagger, 0.35);
}

/**
 * The storm caller: every 6 s (4 s in phase 2) it turns the wind around, and phase 2 blows
 * harder (×1.25 each turn, up to 320 px/s²). Its arrows fly in a fan of three in phase 2.
 */
function tempest(w: World, a: Archer): void {
  a.special -= DT;
  if (a.special > 0) return;
  a.special = a.bossPhase === 2 ? 4 : 6;
  flipWind(w, a.bossPhase === 2 ? 1.25 : 1, a.id, a.body.x[PT.head]!, a.body.y[PT.head]!);
}

function updatePlates(w: World): void {
  const boss = w.enemies.find((e) => e.alive && e.bossKind === 'shields');
  if (!boss) {
    for (const p of w.plates) p.active = false;
    return;
  }
  const n = boss.bossPhase === 2 ? 3 : 2;
  const om = boss.bossPhase === 2 ? 1.9 : 1.25;
  const b = boss.body;
  const cx = (b.x[PT.neck]! + b.x[PT.pelvis]!) / 2;
  const cy = (b.y[PT.neck]! + b.y[PT.pelvis]!) / 2 - 10;
  for (let i = 0; i < w.plates.length; i++) {
    const p = w.plates[i]!;
    p.active = i < n;
    if (!p.active) continue;
    const ang = w.time * om + (i * Math.PI * 2) / n;
    p.x = cx + Math.cos(ang) * 112;
    p.y = cy + Math.sin(ang) * 112;
  }
}

function tryJump(w: World, a: Archer): boolean {
  const free: number[] = [];
  for (let i = 1; i <= w.layout.length; i++) {
    if (i === a.ledge) continue;
    if (w.movers.some((m) => m.index === i)) continue; // never onto a moving ledge
    if (w.enemies.some((e) => e.alive && e.ledge === i)) continue;
    free.push(i);
  }
  a.jumpCooldown = w.brainRng.range(2.6, 4.2);
  if (free.length === 0 || w.movers.some((m) => m.index === a.ledge)) return false;
  const to = free[w.brainRng.int(0, free.length - 1)]!;
  const L = w.ledges[to]!;
  a.jx0 = a.stanceX;
  a.jy0 = a.anchorY;
  a.jx1 = L.x + L.w / 2;
  a.jy1 = L.y - LEG_HEIGHT * a.scale;
  a.jumpT = 0;
  a.jumpDur = 0.75;
  a.brain = 'jump';
  a.ledge = to;
  a.draw = 0;
  a.crouch = 1;
  setFeetPinned(a, false);
  return true;
}

/** The frost giant's second phase throws a bomb every other time. */
function giantBomb(a: Archer): boolean {
  return a.bossKind === 'giant' && a.bossPhase === 2 && a.shotsFired % 2 === 1;
}

function enemySpeed(a: Archer): number {
  return a.type === 'bomber' || giantBomb(a) ? TUNING.bombSpeed : a.type === 'boss' ? TUNING.bossSpeed : TUNING.enemySpeed;
}

function blocksArc(w: World, x: number, y: number): boolean {
  for (const L of w.ledges) if (x > L.x - 4 && x < L.x + L.w + 4 && y > L.y - 4 && y < L.y + L.h) return true;
  for (const L of w.walls) if (x > L.x - 4 && x < L.x + L.w + 4 && y > L.y - 4 && y < L.y + L.h) return true;
  return false;
}

/**
 * True when an arrow launched from (ox, oy) reaches the vertical line x = tx (within `ty` ± 60
 * when it gets there) within `maxT` s without passing through a ledge or wall (wind included;
 * gravity `g`, lighter for some weapons' projectiles). Used by enemies (and the scripted player)
 * to pick an arc that is not blocked.
 */
export function arcClear(w: World, ox: number, oy: number, angle: number, speed: number, tx: number, ty: number, windK = 1, g: number = TUNING.gravity, maxT = 3): boolean {
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const wind = w.wind * windK;
  const dir = Math.sign(tx - ox) || 1;
  for (let t = 1 / 90; t < maxT; t += 1 / 90) {
    const x = ox + vx * t + 0.5 * wind * t * t;
    const y = oy + vy * t + 0.5 * g * t * t;
    if ((x - tx) * dir >= 0) return Math.abs(y - ty) < 60;
    if (y > 1400) return false;
    if (t < 0.04) continue; // leaving the archer's own ledge edge
    if (blocksArc(w, x, y)) return false;
  }
  return false;
}

const SPEED_STEPS = [1, 1.12, 1.25, 1.4] as const;
const LOW_FIRST = [false, true] as const;
/** the volley archer's lobs: the slowest arc that is clear rises least (more of them are clear) */
const LOB_STEPS = [0.88, 0.94, 1, 1.12, 1.25] as const;
const HIGH_FIRST = [true, false] as const;

/**
 * Launch angle to hit (tx, ty) from (ox, oy) at `speed` with gravity `g` and wind: the wind shift
 * over the flight time is aimed off (two refinement passes). Null if out of reach.
 */
export function solveWithWind(ox: number, oy: number, tx: number, ty: number, speed: number, wind: number, high: boolean, g: number = TUNING.gravity): number | null {
  let aimX = tx;
  let angle: number | null = null;
  for (let i = 0; i < 3; i++) {
    angle = solveLaunchAngle(aimX - ox, ty - oy, speed, g, high);
    if (angle === null || wind === 0) return angle;
    const vx = Math.cos(angle) * speed;
    const T = Math.abs(vx) > 1 ? (aimX - ox) / vx : 1;
    aimX = tx - 0.5 * wind * T * T;
  }
  return angle;
}

/** Aim solve for an enemy: an unblocked arc to the player's chest (before the wave's error). */
export function enemyAimSolution(w: World, a: Archer): { angle: number; speed: number } {
  const base = enemySpeed(a);
  const tx = PLAYER_X;
  const ty = playerPelvisY() - 24;
  let first: { angle: number; speed: number } | null = null;
  // the volley archer lobs: its arrows come down from above, over walls and ledges
  for (const high of a.type === 'volley' ? HIGH_FIRST : LOW_FIRST) {
    for (const k of a.type === 'volley' && high ? LOB_STEPS : SPEED_STEPS) {
      const speed = base * k;
      let angle = Math.PI + 0.6;
      let ok = true;
      for (let i = 0; i < 2; i++) {
        const o = bowOrigin(a.stanceX, a.anchorY, angle, a.scale);
        const sol = solveWithWind(o.x, o.y, tx, ty, speed, w.wind, high);
        if (sol === null) ok = false;
        else angle = sol;
      }
      if (!ok) continue;
      first ??= { angle, speed };
      const o = bowOrigin(a.stanceX, a.anchorY, angle, a.scale);
      if (arcClear(w, o.x, o.y, angle, speed, tx, ty)) return { angle, speed };
    }
  }
  return first ?? { angle: Math.PI + Math.PI / 4, speed: base };
}

function beginDraw(w: World, a: Archer, drawTime: number): void {
  const acc = enemyAccuracy(w.level, w.difficulty);
  if (a.bossKind === 'warden') {
    // the warden aims its orb fan straight at the player (orbs fly without gravity)
    const o = bowOrigin(a.stanceX, a.anchorY, a.aim, a.scale);
    a.aimGoal = Math.atan2(playerPelvisY() - 30 - o.y, PLAYER_X - o.x) + gauss(w.brainRng) * acc.angle * 0.3;
    a.speedGoal = FX.orbSpeed;
  } else if (a.type === 'mage') {
    // the wizard's staff points at the player while the hex gathers (aimed for real on release)
    const o = staffTip(a);
    a.aimGoal = Math.atan2(playerPelvisY() - 30 - o.y, PLAYER_X - o.x);
    a.speedGoal = FX.mageSpeed;
  } else {
    const sol = enemyAimSolution(w, a);
    a.aimGoal = sol.angle + gauss(w.brainRng) * (acc.angle + a.aimPenalty);
    a.speedGoal = sol.speed * (1 + gauss(w.brainRng) * acc.speed);
  }
  a.brain = 'draw';
  a.timer = drawTime;
  w.events.push({ t: 'enemyDraw', id: a.id });
}

function release(w: World, a: Archer): void {
  if (a.type === 'mage') return castOrb(w, a, FX.mageSpeed, FX.mageHex, FX.mageHoming);
  const o = bowOrigin(a.stanceX, a.anchorY, a.aim, a.scale);
  if (a.type === 'volley') {
    // three arrows on the same high arc, a little short, true and a little long: one of them
    // usually comes down on the player, each for half an arrow's damage
    for (const k of FX.volleySpeeds) {
      const sp = a.speedGoal * k;
      const ar = spawnArrow(w, 'enemy', 'arrow', o.x, o.y, Math.cos(a.aimGoal) * sp, Math.sin(a.aimGoal) * sp);
      if (ar) {
        ar.soft = a.shotsFired === 0;
        ar.by = a.id;
        ar.dmgMul = FX.volleyShare;
      }
      w.run.enemyShots += 1;
    }
    a.shotsFired += 1;
    a.draw = 0;
    w.events.push({ t: 'enemyShot', id: a.id, kind: 'arrow', x: o.x, y: o.y });
    return;
  }
  let kind: Arrow['kind'] = a.type === 'bomber' ? 'bomb' : 'arrow';
  // the elite looses two arrows only in endless; in the chapters it is a health check
  let spread: readonly number[] = a.type === 'elite' && w.chapter >= CHAPTERS ? ELITE_SPREAD : ONE_ARROW;
  const speed = a.speedGoal;
  if (a.type === 'boss') {
    switch (a.bossKind) {
      case 'shields':
        // its threat is the shield ring (three plates, faster, in phase 2), not volume of fire
        spread = a.bossPhase === 2 && stageOf(w.wave).endless ? BOSS_SPREAD : ONE_ARROW;
        break;
      case 'giant':
        // phase 2: every other throw is a bomb (aimed at bomb speed in beginDraw)
        if (giantBomb(a)) kind = 'bomb';
        else spread = BOSS_SPREAD;
        break;
      case 'summoner':
        spread = ONE_ARROW;
        break;
      case 'magma':
      case 'tempest':
        // their threat is the eruption / the turning wind; phase 2 adds a fan
        spread = a.bossPhase === 2 ? BOSS_SPREAD : ONE_ARROW;
        break;
      case 'warden': {
        kind = 'orb';
        const n = a.bossPhase === 2 ? 7 : 5;
        const s: number[] = [];
        for (let i = 0; i < n; i++) s.push(-0.36 + (0.72 * i) / (n - 1) + (a.bossPhase === 2 && a.shotsFired % 2 ? 0.05 : 0));
        spread = s;
        break;
      }
      default:
        spread = BOSS_SPREAD;
    }
  }
  for (const s of spread) {
    const ang = a.aimGoal + s;
    const ar = spawnArrow(w, 'enemy', kind, o.x, o.y, Math.cos(ang) * speed, Math.sin(ang) * speed);
    if (ar) {
      ar.soft = a.shotsFired === 0;
      ar.by = a.id;
      // the warden's orbs leave its wide ledge instead of bursting on its edge
      if (kind === 'orb') ar.fromLedge = a.ledge;
    }
    w.run.enemyShots += 1;
  }
  a.shotsFired += 1;
  a.draw = 0;
  w.events.push({ t: 'enemyShot', id: a.id, kind, x: o.x, y: o.y });
}

// ---------------------------------------------------------------- arrows

function stickTo(a: Arrow, host: Archer, body: Body, part: Part, hx: number, hy: number, state: 2 | 3): void {
  const ra = part.a;
  const rb = part.a === part.b || part.u !== undefined ? (part.a === PT.head ? PT.neck : part.b) : part.b;
  const ax = body.x[ra]!;
  const ay = body.y[ra]!;
  let ux = body.x[rb]! - ax;
  let uy = body.y[rb]! - ay;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const dir = Math.atan2(a.vy, a.vx);
  const depth = 10 * host.scale;
  const tx = hx + Math.cos(dir) * depth - ax;
  const ty = hy + Math.sin(dir) * depth - ay;
  a.state = state;
  a.host = host.id;
  a.ha = ra;
  a.hb = rb;
  a.hu = (tx * ux + ty * uy) / len;
  a.hoff = tx * -uy + ty * ux;
  a.hrel = dir - Math.atan2(uy, ux);
  a.vx = 0;
  a.vy = 0;
}

function placeStuck(a: Arrow, body: Body): void {
  const ax = body.x[a.ha]!;
  const ay = body.y[a.ha]!;
  let ux = body.x[a.hb]! - ax;
  let uy = body.y[a.hb]! - ay;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  a.x = ax + ux * a.hu * len + -uy * a.hoff;
  a.y = ay + uy * a.hu * len + ux * a.hoff;
  a.angle = Math.atan2(uy, ux) + a.hrel;
}

function archerById(w: World, id: number): Archer | undefined {
  if (w.player.id === id) return w.player;
  for (const e of w.enemies) if (e.id === id) return e;
  return undefined;
}

function pushBody(body: Body, hx: number, hy: number, vx: number, vy: number, k: number, radius: number): void {
  for (let i = 0; i < body.n; i++) {
    const dx = body.x[i]! - hx;
    const dy = body.y[i]! - hy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const f = Math.max(0, 1 - d / radius);
    if (f > 0 && !body.pin[i]) addVelocity(body, i, vx * k * f, vy * k * f, DT);
  }
}

function trimStuck(w: World, hostId: number): void {
  let count = 0;
  let oldest: Arrow | null = null;
  for (const a of w.arrows) {
    if (a.active && a.state === 2 && a.host === hostId) {
      count += 1;
      if (!oldest || a.seq < oldest.seq) oldest = a;
    }
  }
  if (count > TUNING.stuckPerBody && oldest) oldest.active = false;
}

/** A player arrow that ends without hitting anything breaks the headshot chain. */
function missed(w: World, a: Arrow): void {
  if (a.owner === 'player' && a.primary && !a.scored) w.run.chain = 0;
}

function steer(w: World, a: Arrow): void {
  let best = 300 * 300;
  let tx = 0;
  let ty = 0;
  for (const e of w.enemies) {
    if (!e.alive || e.brain === 'spawn' || e.id === a.ignore) continue;
    const dx = e.body.x[PT.head]! - a.x;
    const dy = e.body.y[PT.head]! - a.y;
    if (dx * a.vx + dy * a.vy <= 0) continue; // only what lies ahead
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      tx = dx;
      ty = dy;
    }
  }
  if (best >= 300 * 300) return;
  const cur = Math.atan2(a.vy, a.vx);
  let diff = Math.atan2(ty, tx) - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = clamp(diff, -w.stats.seek * DT, w.stats.seek * DT);
  const sp = Math.hypot(a.vx, a.vy);
  a.vx = Math.cos(cur + turn) * sp;
  a.vy = Math.sin(cur + turn) * sp;
}

/** The wizard's hex turns toward the player's chest while it is still in front of the player. */
function homeOrb(w: World, a: Arrow): void {
  const p = w.player;
  if (!p.alive || a.x < PLAYER_X + 30) return;
  const tx = (p.body.x[PT.neck]! + p.body.x[PT.pelvis]!) / 2 - a.x;
  const ty = (p.body.y[PT.neck]! + p.body.y[PT.pelvis]!) / 2 - a.y;
  const cur = Math.atan2(a.vy, a.vx);
  let diff = Math.atan2(ty, tx) - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = clamp(diff, -a.homing * DT, a.homing * DT);
  const sp = Math.hypot(a.vx, a.vy);
  a.vx = Math.cos(cur + turn) * sp;
  a.vy = Math.sin(cur + turn) * sp;
}

/** A sling pebble keeps 70% of its normal speed off ledges, walls and shields. */
export const PEBBLE_REST = 0.7;

function updateArrows(w: World): void {
  for (const a of w.arrows) {
    if (!a.active) continue;
    a.age += DT;
    if (a.state === 2 || a.state === 3) {
      const host = archerById(w, a.host);
      const body = a.state === 3 ? host?.shield : host?.body;
      if (!host || !body || host.gone) {
        a.active = false;
        continue;
      }
      placeStuck(a, body);
      continue;
    }
    if (a.state === 1) {
      a.life -= DT;
      if (a.life <= 0) a.active = false;
      continue;
    }
    // flying
    const x0 = a.x;
    const y0 = a.y;
    if (a.kind === 'orb') {
      if (a.homing > 0) homeOrb(w, a);
      a.x += a.vx * DT;
      a.y += a.vy * DT;
    } else if (a.kind === 'boomerang') {
      if (flyBoomerang(w, a)) continue;
    } else {
      if (a.seek) steer(w, a);
      flyArrow(a, DT, TUNING.gravity * a.gravityMul);
      if (w.wind !== 0) {
        const wind = w.wind * a.windMul;
        a.x += 0.5 * wind * DT * DT;
        a.vx += wind * DT;
      }
    }
    a.angle = Math.atan2(a.vy, a.vx);
    a.life -= DT;
    if (a.kind === 'rocket' && a.age >= ROCKET.fuse - 1e-9) {
      burst(w, a, a.x, a.y, null);
      missed(w, a);
      a.active = false;
      continue;
    }
    if (a.life <= 0 || a.x < -300 || a.x > 1020 || a.y > 1600 || (a.kind === 'rocket' && a.y < ROCKET.topEdge)) {
      missed(w, a);
      a.active = false;
      continue;
    }
    if (a.owner === 'player') playerArrowHits(w, a, x0, y0);
    else enemyArrowHits(w, a, x0, y0);
  }
}

/**
 * Boomerang flight: no gravity. Out along the launch line, slowing linearly to a stop at `turnT`
 * (wind pushes it at 0.3 of an arrow's push); then back toward the bow, speeding up, on a path
 * that curls up over the line it went out on and straightens as it nears the player, with the
 * wind's 0.3 drift. It flies over ledges and walls both ways (see playerArrowHits); a shield
 * turns it early. Back within BOOM.catchR of the bow it ends (it never hurts the player).
 * Returns true when it ended this step.
 */
function flyBoomerang(w: World, a: Arrow): boolean {
  const t0 = a.age - DT;
  const wind = w.wind * BOOM.windMul;
  if (t0 < a.turnT) {
    const left = a.turnT - t0;
    const k = left > DT + 1e-9 ? 1 - DT / left : 0;
    a.x += ((a.vx * (1 + k)) / 2) * DT + 0.5 * wind * DT * DT;
    a.y += ((a.vy * (1 + k)) / 2) * DT;
    a.vx = a.vx * k + wind * DT * k;
    a.vy *= k;
    if (a.age >= a.turnT - 1e-9) turnBoomerang(a);
    return false;
  }
  const o = playerOrigin(w, w.player.aim);
  let dx = o.x - a.x;
  let dy = o.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d < BOOM.catchR) return endBoomerang(w, a);
  const mul = w.difficulty === 'hard' ? weaponPerks('boomerang', w.meta.wlevel).returnSpeedMul : 1;
  const sp = Math.min(BOOM.returnMax, BOOM.returnAcc * (a.age - a.turnT)) * mul;
  const dir = Math.atan2(dy, dx) + BOOM.curl * clamp((d - BOOM.catchR) / 500, 0, 1);
  a.vx = Math.cos(dir) * sp + wind * BOOM.driftT;
  a.vy = Math.sin(dir) * sp;
  a.x += a.vx * DT;
  a.y += a.vy * DT;
  dx = o.x - a.x;
  dy = o.y - a.y;
  d = Math.hypot(dx, dy);
  if (d < BOOM.catchR) return endBoomerang(w, a);
  return false;
}

/** The boomerang starts back (at `turnT`, or early off a ledge or shield): a new pass. */
function turnBoomerang(a: Arrow): void {
  a.turnT = Math.min(a.turnT, a.age);
  a.hitIds.length = 0;
  a.vx = 0;
  a.vy = 0;
}

/** Caught: back within BOOM.catchR of the bow. */
function endBoomerang(w: World, a: Arrow): boolean {
  missed(w, a);
  a.active = false;
  w.events.push({ t: 'boomCatch', x: a.x, y: a.y });
  return true;
}

/** Boomerang: turn time 0.55 + 0.5 × power s (a full draw reaches 919 px, the far corner of the widest fields); return acceleration (px/s²) and top speed (px/s), both × the return perk. */
export const BOOM = { turnBase: 0.55, turnPower: 0.5, windMul: 0.3, returnAcc: 1500, returnMax: 1400, curl: 0.7, driftT: 0.5, catchR: 60 } as const;

/** Firework rocket: fuse (s; a full draw flies 840 px before it, and its burst reaches the far corner of the widest fields), burst radius (px) and share of a body hit every archer in it takes; it leaves the field this far above it. */
export const ROCKET = { fuse: 0.48, radius: 145, share: 1, topEdge: 0 } as const;

/** A firework rocket's burst radius in this world (px): ROCKET.radius × the level's perk (hard). */
export function rocketRadius(w: World): number {
  return ROCKET.radius * (w.difficulty === 'hard' ? weaponPerks('firework', w.meta.wlevel).blastRadiusMul : 1);
}

const boomReturning = (a: Arrow): boolean => a.kind === 'boomerang' && a.age >= a.turnT;

/** Ledge (or wall) test for a flying arrow from (x0,y0) to its current tip; returns true if it stopped. */
function ledgeHit(w: World, a: Arrow, x0: number, y0: number): boolean {
  let best: { t: number; nx: number; ny: number } | null = null;
  let bestIdx = -1;
  for (let i = 0; i < w.ledges.length; i++) {
    if (i === a.fromLedge) continue;
    const L = w.ledges[i]!;
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && (!best || h.t < best.t)) {
      best = h;
      bestIdx = i;
    }
  }
  for (const L of w.walls) {
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && (!best || h.t < best.t)) {
      best = h;
      bestIdx = -1;
    }
  }
  if (!best) return false;
  const hx = x0 + (a.x - x0) * best.t;
  const hy = y0 + (a.y - y0) * best.t;
  if (a.kind === 'bomb') {
    explode(w, a, hx, hy);
    return true;
  }
  if (a.kind === 'orb') {
    a.active = false;
    w.events.push({ t: 'orbPop', x: hx, y: hy });
    return true;
  }
  if (a.kind === 'pebble' && a.bounces <= 0) {
    // a pebble never sticks: the contact after its last bounce ends it
    missed(w, a);
    a.active = false;
    w.events.push({ t: 'thunk', x: hx, y: hy, owner: a.owner });
    return true;
  }
  if (a.bounces > 0) {
    const pebble = a.kind === 'pebble';
    a.bounces -= 1;
    a.x = hx + best.nx * 2;
    a.y = hy + best.ny * 2;
    if (best.nx !== 0) a.vx = -a.vx * (pebble ? PEBBLE_REST : 0.78);
    if (best.ny !== 0) a.vy = -a.vy * (pebble ? PEBBLE_REST : 0.78);
    if (!pebble) a.vx *= 0.92;
    a.ignore = -1;
    w.events.push({ t: 'bounce', x: hx, y: hy });
    return true;
  }
  if (a.kind === 'rocket') {
    // a rocket never sticks: it bursts on the ledge or wall (missed only if the burst hurt nobody)
    burst(w, a, hx, hy, null);
    missed(w, a);
    a.active = false;
    return true;
  }
  missed(w, a);
  if (a.owner === 'player' && w.stats.blastShare > 0) burst(w, a, hx, hy, null);
  const dir = Math.atan2(a.vy, a.vx);
  a.x = hx + Math.cos(dir) * 12;
  a.y = hy + Math.sin(dir) * 12;
  a.angle = dir;
  a.state = 1;
  a.host = bestIdx;
  a.life = TUNING.stuckLedgeLife;
  a.vx = 0;
  a.vy = 0;
  w.events.push({ t: 'thunk', x: hx, y: hy, owner: a.owner });
  return true;
}

function explode(w: World, a: Arrow, x: number, y: number, direct = false): void {
  a.active = false;
  const p = w.player;
  let hurt = false;
  if (p.alive) {
    const dx = p.body.x[PT.neck]! - x;
    const dy = (p.body.y[PT.neck]! + p.body.y[PT.pelvis]!) / 2 - y;
    if (direct || dx * dx + dy * dy < TUNING.bombRadius ** 2) {
      hurt = true;
      if (w.shieldLeft > 0) {
        w.shieldLeft -= 1;
        w.events.push({ t: 'blocked', x, y });
      } else {
        damagePlayer(w, 'body', TUNING.bombDamage * enemyDamageMul(w.level, w.difficulty), x, y, (dx || 1) * 8, -300, a.by);
      }
    }
  }
  w.events.push({ t: 'bomb', x, y, hurt, popped: false });
}

function playerArrowHits(w: World, a: Arrow, x0: number, y0: number): void {
  // things popped in passing: bombs and orbs in flight, apples, bonus targets, ropes
  for (const b of w.arrows) {
    if (!b.active || b.state !== 0 || b.owner !== 'enemy' || b.kind === 'arrow') continue;
    const r = b.kind === 'bomb' ? TUNING.bombHitRadius : FX.orbRadius + 8;
    if (sweepCapsule(x0, y0, a.x, a.y, b.x, b.y, b.x, b.y, r) >= 0) {
      b.active = false;
      w.run.hits += 1;
      if (b.kind === 'bomb') w.events.push({ t: 'bomb', x: b.x, y: b.y, hurt: false, popped: true });
      else w.events.push({ t: 'orbPop', x: b.x, y: b.y });
    }
  }
  for (const ap of w.apples) {
    if (!ap.active) continue;
    if (sweepCapsule(x0, y0, a.x, a.y, ap.x, ap.y, ap.x, ap.y, TUNING.appleRadius * w.stats.appleRadiusMul) >= 0) {
      ap.active = false;
      const amount = Math.round(TUNING.appleHeal * w.stats.appleHealMul);
      w.events.push({ t: 'apple', x: ap.x, y: ap.y, heal: amount });
      heal(w, amount);
    }
  }
  if (w.bonus) bonusHits(w, x0, y0, a.x, a.y);
  if (w.movers.length > 0 || w.props.some((p) => p.active && p.kind === 'rock')) cutRopes(w, x0, y0, a.x, a.y);
  // blockers: shields, plates, barrels, rocks, bodies, ledges and walls — the earliest wins
  let bestT = 2;
  let what = 0; // 1 body, 2 shield, 3 plate, 4 barrel, 5 rock
  let bestHost: Archer | null = null;
  let bestPart = -1;
  let bestProp: Prop | null = null;
  let hx = 0;
  let hy = 0;
  for (const e of w.enemies) {
    // archers dropping in cannot be hit until they land
    if (e.gone || e.id === a.ignore || (e.alive && e.brain === 'spawn')) continue;
    if (a.hitIds.length > 0 && a.hitIds.includes(e.id)) continue;
    if (e.shield) {
      const h = hitParts(e.shield, 1, SHIELD_PARTS, x0, y0, a.x, a.y);
      if (h && h.t < bestT) {
        bestT = h.t;
        bestHost = e;
        bestPart = 0;
        what = 2;
        hx = h.x;
        hy = h.y;
      }
    }
    const h = hitParts(e.body, e.scale, e.parts, x0, y0, a.x, a.y);
    if (h && h.t < bestT) {
      bestT = h.t;
      bestHost = e;
      bestPart = h.part;
      what = 1;
      hx = h.x;
      hy = h.y;
    }
  }
  for (const p of w.plates) {
    if (!p.active) continue;
    const t = sweepCapsule(x0, y0, a.x, a.y, p.x, p.y, p.x, p.y, p.r);
    if (t >= 0 && t < bestT) {
      bestT = t;
      what = 3;
      hx = x0 + (a.x - x0) * t;
      hy = y0 + (a.y - y0) * t;
    }
  }
  for (const p of w.props) {
    if (!p.active) continue;
    let t: number;
    if (p.kind === 'barrel') t = sweepAabb(x0, y0, a.x, a.y, p.x, p.y, p.w, p.h)?.t ?? -1;
    else t = sweepCapsule(x0, y0, a.x, a.y, p.x, p.y, p.x, p.y, p.w);
    if (t >= 0 && t < bestT) {
      bestT = t;
      what = p.kind === 'barrel' ? 4 : 5;
      bestProp = p;
      hx = x0 + (a.x - x0) * t;
      hy = y0 + (a.y - y0) * t;
    }
  }
  // ledges in front of the hit? (a boomerang flies over ledges and walls both ways: it curls
  // over cover onto archers a straight shot cannot reach; only bodies and shields stop it)
  const over = a.kind === 'boomerang';
  let ledgeT = 2;
  for (let i = 0; i < w.ledges.length && !over; i++) {
    const L = w.ledges[i]!;
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && h.t < ledgeT) ledgeT = h.t;
  }
  for (let i = 0; i < w.walls.length && !over; i++) {
    const L = w.walls[i]!;
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && h.t < ledgeT) ledgeT = h.t;
  }
  if (what !== 0 && bestT <= ledgeT) {
    switch (what) {
      case 1:
        hitEnemy(w, a, bestHost!, bestHost!.parts[bestPart]!, hx, hy);
        break;
      case 2:
        hitShield(w, a, bestHost!, hx, hy);
        break;
      case 3:
        missed(w, a);
        a.active = false;
        w.events.push({ t: 'plate', x: hx, y: hy });
        break;
      case 4:
        a.active = false;
        a.scored = true;
        explodeBarrel(w, bestProp!);
        break;
      default:
        missed(w, a);
        a.active = false;
        w.events.push({ t: 'thunk', x: hx, y: hy, owner: 'player' });
    }
    return;
  }
  if (!over) ledgeHit(w, a, x0, y0);
}

function hitShield(w: World, a: Arrow, e: Archer, hx: number, hy: number): void {
  const s = e.shield!;
  // a pebble still in flight after glancing off is not a miss; it is one only when finally spent
  // (a boomerang only when it ends)
  if (a.kind !== 'boomerang' && a.kind !== 'rocket' && (a.kind !== 'pebble' || a.bounces <= 0)) missed(w, a);
  if (a.kind === 'rocket') {
    // it bursts on the shield (below) and never sticks
    a.active = false;
  } else if (a.kind === 'boomerang') {
    // it never sticks: the shield's bearer is safe from it this pass (going out, it starts back; below)
    a.hitIds.push(e.id);
  } else if (a.kind === 'pebble') {
    // a pebble never sticks: it glances off the shield (0.7 restitution about the contact normal) while bounces last
    if (a.bounces > 0) {
      a.bounces -= 1;
      let nx = hx - s.x[0]!;
      let ny = hy - s.y[0]!;
      const sx = s.x[1]! - s.x[0]!;
      const sy = s.y[1]! - s.y[0]!;
      const t = clamp((nx * sx + ny * sy) / (sx * sx + sy * sy || 1), 0, 1);
      nx -= sx * t;
      ny -= sy * t;
      const len = Math.hypot(nx, ny);
      if (len < 1e-6) {
        nx = -Math.sign(a.vx || 1);
        ny = 0;
      } else {
        nx /= len;
        ny /= len;
      }
      const vn = a.vx * nx + a.vy * ny;
      if (vn < 0) {
        a.vx -= (1 + PEBBLE_REST) * vn * nx;
        a.vy -= (1 + PEBBLE_REST) * vn * ny;
      }
      a.x = hx + nx * 2;
      a.y = hy + ny * 2;
      w.events.push({ t: 'bounce', x: hx, y: hy });
    } else a.active = false;
  } else stickTo(a, e, s, SHIELD_PARTS[0]!, hx, hy, 3);
  w.run.hits += 1;
  let broke = false;
  if (e.shieldOn) {
    e.shieldHp -= a.dmgMul >= 1.6 || (a.over && w.stats.siege) ? 2 : 1;
    if (e.shieldHp <= 0) {
      broke = true;
      dropShield(w, e, Math.sign(a.vx || 1) * 220 * a.impulseMul);
    }
  } else {
    pushBody(s, hx, hy, a.vx, a.vy, 0.4, 120);
  }
  w.events.push({ t: 'shieldHit', id: e.id, x: hx, y: hy, broke });
  if (a.kind === 'rocket') {
    burst(w, a, hx, hy, null);
    missed(w, a);
  } else if (w.stats.blastShare > 0) burst(w, a, hx, hy, null);
  if (a.kind === 'boomerang' && !boomReturning(a)) {
    a.x = hx - Math.sign(a.vx || 1) * 2;
    a.y = hy;
    turnBoomerang(a);
    a.hitIds.push(e.id);
  }
}

function hitEnemy(w: World, a: Arrow, e: Archer, part: Part, hx: number, hy: number): void {
  const vx = a.vx;
  const vy = a.vy;
  // a ready arrow-catcher snatches it out of the air (not while drawing or recovering)
  if (e.alive && e.type === 'catcher' && e.catchCd <= 0 && e.brain !== 'draw' && e.brain !== 'spawn' && e.brain !== 'jump' && e.stagger <= 0) {
    e.catchCd = FX.catchCooldown;
    a.active = false;
    missed(w, a);
    w.events.push({ t: 'caught', id: e.id, x: e.body.x[PT.handF]!, y: e.body.y[PT.handF]! });
    return;
  }
  // a lantern knight's ward pops on the first hit; a second hit soon after gets through
  if (e.alive && e.type === 'ward' && e.wardUp) {
    e.wardUp = false;
    e.wardT = FX.wardWindow;
    if (a.kind === 'boomerang') a.hitIds.push(e.id);
    else a.active = false;
    a.scored = true;
    w.events.push({ t: 'ward', id: e.id, x: hx, y: hy, up: false });
    return;
  }
  const weight = e.type === 'boss' ? 1 : enemyWeight(w.level, w.difficulty);
  const k = (TUNING.impulse * a.impulseMul) / weight;
  // the body whips around the hit point
  pushBody(e.body, hx, hy, vx, vy, k, 70 * e.scale);
  if (part.a !== part.b && part.u === undefined) {
    addVelocity(e.body, part.a, vx * k * 0.5, vy * k * 0.5, DT);
    addVelocity(e.body, part.b, vx * k * 0.7, vy * k * 0.7, DT);
  } else {
    addVelocity(e.body, part.a, vx * k, vy * k, DT);
  }
  if (!e.alive) {
    stickOrPierce(w, a, e, part, hx, hy);
    w.events.push({ t: 'bodyThunk', id: e.id, x: hx, y: hy });
    return;
  }
  a.scored = true;
  w.run.hits += 1;
  const crit = w.critRng.chance(w.stats.crit + (a.focus ? FX.focusCrit : 0));
  // the first chapter's boss relies on its shields, not its armour: body hits count four times
  const armourK = e.bossKind === 'shields' && part.kind !== 'weak' ? 4 : 1;
  const out = resolveHit(e.type, part.kind, a.dmgMul * (part.kind === 'head' && a.owner === 'player' ? w.stats.headMul : 1) * (crit ? w.stats.critMul : 1) * armourK, e.helmet, w.difficulty === 'hard');
  if (crit) w.run.crits += 1;
  e.hurt = 0;
  e.body.muscle = Math.min(e.body.muscle, e.type === 'boss' ? 0.35 : TUNING.hitMuscle);
  e.aimPenalty += out.aimPenalty;
  if (out.stagger > 0) e.stagger = Math.max(e.stagger, out.stagger);
  if (e.brain === 'draw' && e.type !== 'boss' && e.type !== 'elite') {
    e.brain = 'cool';
    e.timer = 0.6;
    e.draw = 0;
  }
  // shove the stance; off the edge means a fall
  const shove = ((out.shove + (part.kind === 'body' ? 0.35 : 0) * (a.impulseMul > 1.2 ? 1 : 0)) * TUNING.legShove * a.impulseMul) / weight;
  if (shove > 0 && e.type !== 'boss' && e.type !== 'elite' && e.brain !== 'jump') {
    e.anchorX += Math.sign(vx || 1) * shove;
    const L = enemyLedge(w, e);
    if (L && (e.anchorX < L.x + 4 || e.anchorX > L.x + L.w - 4)) {
      setFeetPinned(e, false);
      e.falling = DT;
      e.stagger = 2;
      // a little push over the edge
      addVelocity(e.body, PT.pelvis, Math.sign(vx || 1) * 120, -60, DT);
    }
  }
  if (a.fire) {
    e.burn = w.stats.fireTime;
    e.burnDps = w.stats.fireDps;
    e.burnTick = 0.5;
  }
  if (w.stats.frostTime > 0) chillEnemy(w, e, w.stats.frostTime);
  e.hp -= out.damage;
  checkBossPhase(w, e);
  const ko = out.ko || e.hp <= 0;
  const head = part.kind === 'head' || part.kind === 'weak';
  if (head) w.run.headshots += 1;
  w.events.push({ t: 'hit', id: e.id, part: part.kind, x: hx, y: hy, dmg: out.ko ? Math.max(out.damage, e.hp + out.damage) : out.damage, ko, slowmo: out.slowmo || (ko && e.type === 'boss'), vx, vy, fire: a.fire, enemy: e.type as EnemyType, crit });
  // headshot chain: consecutive headshots, each one paying a little more
  const r = w.run;
  if (head) {
    r.chain += 1;
    r.chainBest = Math.max(r.chainBest, r.chain);
    if (r.chain >= 2) {
      const coins = Math.round(r.chain * coinMul(w));
      r.coins += coins;
      w.events.push({ t: 'chain', n: r.chain, x: hx, y: hy, coins });
      gainFocus(w, 0.04 * r.chain);
    }
  } else r.chain = 0;
  gainFocus(w, head ? FX.focusHead : FX.focusBody);
  if (crit) gainFocus(w, 0.05);
  if (w.stats.lifesteal > 0) heal(w, w.stats.lifesteal);
  // chain lightning jumps to the nearest other enemy (storm: twice)
  if (w.stats.chainShare > 0) zap(w, e, out.damage * w.stats.chainShare, w.stats.chainJumps);
  if (ko) {
    knockOut(w, e, part.kind === 'head' ? 'head' : 'shot');
    // knockout kick: the whole body is thrown along the arrow with a little hop, so it
    // tumbles, flops over the edge or ends up dangling instead of just sitting down
    const kick = TUNING.koKick * a.impulseMul;
    for (let i = 0; i < e.body.n; i++) addVelocity(e.body, i, vx * kick, Math.min(0, vy * kick) - TUNING.koHop, DT);
    addVelocity(e.body, PT.head, vx * kick * 0.8, vy * kick * 0.4, DT);
  }
  stickOrPierce(w, a, e, part, hx, hy);
  if (a.kind === 'rocket' || w.stats.blastShare > 0) burst(w, a, hx, hy, e);
  // after the arrow is stuck: it travels with the wizard
  if (!ko && e.type === 'mage') blink(w, e);
}

function zap(w: World, from: Archer, dmg: number, jumps: number): void {
  let src = from;
  const hit = new Set<number>([from.id]);
  for (let j = 0; j < jumps; j++) {
    const s = targetPoint(src, 'chest');
    let best: Archer | null = null;
    let bd = 260;
    for (const e of w.enemies) {
      if (!e.alive || hit.has(e.id) || e.brain === 'spawn') continue;
      const t = targetPoint(e, 'chest');
      const d = Math.hypot(t.x - s.x, t.y - s.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    const t = targetPoint(best, 'chest');
    w.events.push({ t: 'zap', x0: s.x, y0: s.y, x1: t.x, y1: t.y, dmg });
    hit.add(best.id);
    damageEnemy(w, best, dmg, 'blast');
    src = best;
  }
}

function stickOrPierce(w: World, a: Arrow, e: Archer, part: Part, hx: number, hy: number): void {
  if (a.kind === 'boomerang') {
    // it cuts through and flies on (pierce is moot: it is not slowed or used up); once per archer per pass
    a.hitIds.push(e.id);
    return;
  }
  if (a.kind === 'rocket') {
    a.active = false;
    return;
  }
  if (a.pierce > 0) {
    a.pierce -= 1;
    a.ignore = e.id;
    a.vx *= 0.85;
    a.vy *= 0.85;
    return;
  }
  if (a.kind === 'pebble') {
    a.active = false;
    return;
  }
  stickTo(a, e, e.body, part, hx, hy, 2);
  trimStuck(w, e.id);
}

function damagePlayer(w: World, part: HitPart, dmg: number, x: number, y: number, vx: number, vy: number, by = -1): void {
  const p = w.player;
  const out = resolveHit('player', part, 1);
  // a bonus round never knocks the player out
  const amount = w.phase === 'bonus' ? Math.min(dmg, Math.max(0, p.hp - 1)) : dmg;
  p.hp -= amount;
  p.hurt = 0;
  p.body.muscle = Math.min(p.body.muscle, 0.12);
  if (out.wobble > 0) p.wobble = Math.max(p.wobble, out.wobble);
  if (out.stagger > 0) p.stagger = Math.max(p.stagger, out.stagger);
  w.run.playerHitsTaken += 1;
  w.run.streak = 0;
  if (w.objective) w.objective.hit = true;
  pushBody(p.body, x, y, vx, vy, 0.3, 70);
  w.events.push({ t: 'playerHit', part, x, y, dmg: amount, vx, vy, by });
  if (p.hp <= 0) knockOut(w, p, part === 'head' ? 'head' : 'shot');
}

function enemyArrowHits(w: World, a: Arrow, x0: number, y0: number): void {
  const p = w.player;
  let ledgeT = 2;
  // a staff-carrier's hex flies straight (or curves) at the player and passes through rock: a
  // ledge between caster and player would otherwise eat every spell (the old healer could not
  // have struck from most ledges). It can still be shot out of the air.
  for (let i = 0; i < w.ledges.length && !a.hex; i++) {
    if (i === a.fromLedge) continue;
    const L = w.ledges[i]!;
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && h.t < ledgeT) ledgeT = h.t;
  }
  const h = p.gone ? null : hitParts(p.body, p.scale, PARTS, x0, y0, a.x, a.y);
  if (h && h.t <= ledgeT) {
    const hitPart = PARTS[h.part]!;
    // a wave's opening volley never lands a headshot: it counts as a body hit
    const part = (a.soft || a.kind === 'orb') && hitPart.kind === 'head' ? BODY_PART : hitPart;
    const hx = h.x;
    const hy = h.y;
    if (a.kind === 'bomb') {
      // it struck the player: it hurts even when it burst on the crown, beyond the blast radius
      explode(w, a, hx, hy, true);
      return;
    }
    if (p.alive && w.shieldLeft > 0) {
      w.shieldLeft -= 1;
      a.active = false;
      w.events.push({ t: 'blocked', x: hx, y: hy });
      return;
    }
    const vx = a.vx;
    const vy = a.vy;
    if (a.kind === 'orb') {
      a.active = false;
      if (p.alive) damagePlayer(w, 'body', FX.orbDamage * enemyDamageMul(w.level, w.difficulty) * a.dmgMul, hx, hy, vx, vy, a.by);
      w.events.push({ t: 'orbPop', x: hx, y: hy });
      return;
    }
    if (p.alive) damagePlayer(w, part.kind, resolveHit('player', part.kind, enemyDamageMul(w.level, w.difficulty) * a.dmgMul).damage, hx, hy, vx, vy, a.by);
    else pushBody(p.body, hx, hy, vx, vy, 0.3, 70);
    stickTo(a, p, p.body, part, hx, hy, 2);
    trimStuck(w, p.id);
    return;
  }
  if (!a.hex) ledgeHit(w, a, x0, y0);
}

// ---------------------------------------------------------------- bonus rounds

export const BONUS = {
  gallery: { dur: 20, every: 0.75, gold: 18, silver: 11, bronze: 5 },
  apples: { dur: 16, every: 0.6, gold: 17, silver: 10, bronze: 5 },
  defend: { dur: 22, every: 1.1, gold: 17, silver: 11, bronze: 5 },
  intro: 1.6,
  outro: 1.4,
} as const;

function startBonus(w: World, kind: BonusKind): void {
  w.phase = 'bonus';
  w.phaseT = 0;
  for (const a of w.arrows) if (a.active && a.state === 0 && a.owner === 'enemy') a.active = false;
  for (const p of w.props) p.active = false;
  for (const p of w.plates) p.active = false;
  for (const t of w.targets) t.active = false;
  w.bonus = { kind, t: -BONUS.intro, dur: BONUS[kind].dur, hits: 0, spawned: 0, landed: 0, coins: 0, spawnT: 0, grade: null };
  w.events.push({ t: 'bonusStart', kind });
}

function spawnTarget(w: World, kind: Target['kind']): Target | null {
  const t = w.targets.find((q) => !q.active);
  if (!t) return null;
  const r = w.bonusRng;
  t.active = true;
  t.kind = kind;
  t.t = 0;
  if (kind === 'target') {
    t.x = 780;
    t.baseY = r.range(300, 800);
    t.y = t.baseY;
    t.vx = -r.range(110, 175);
    t.vy = 0;
    t.r = 30;
  } else if (kind === 'apple') {
    t.x = r.range(330, 690);
    t.y = -40;
    t.baseY = t.y;
    t.vx = r.range(-20, 20);
    t.vy = r.range(150, 230);
    t.r = 28;
  } else {
    t.x = 770;
    t.y = r.range(320, 760);
    t.baseY = t.y;
    const tx = PLAYER_X;
    const ty = playerPelvisY() - 30;
    const sp = r.range(300, 380);
    const d = Math.hypot(tx - t.x, ty - t.y) || 1;
    t.vx = ((tx - t.x) / d) * sp;
    t.vy = ((ty - t.y) / d) * sp;
    t.r = 24;
  }
  return t;
}

function updateBonus(w: World): void {
  const b = w.bonus!;
  b.t += DT;
  if (b.t < 0) return;
  const cfg = BONUS[b.kind];
  if (b.t < b.dur) {
    b.spawnT -= DT;
    if (b.spawnT <= 0) {
      b.spawnT = cfg.every;
      if (spawnTarget(w, b.kind === 'gallery' ? 'target' : b.kind === 'apples' ? 'apple' : 'rock')) b.spawned += 1;
    }
  }
  const p = w.player;
  for (const t of w.targets) {
    if (!t.active) continue;
    t.t += DT;
    t.x += t.vx * DT;
    if (t.kind === 'target') t.y = t.baseY + Math.sin(t.t * 2.6) * 34;
    else t.y += t.vy * DT;
    if (t.kind === 'rock') {
      const dx = p.body.x[PT.neck]! - t.x;
      const dy = (p.body.y[PT.neck]! + p.body.y[PT.pelvis]!) / 2 - t.y;
      if (dx * dx + dy * dy < 60 * 60) {
        t.active = false;
        b.landed += 1;
        damagePlayer(w, 'body', 6, t.x, t.y, t.vx, t.vy, -2);
        continue;
      }
    }
    if (t.x < -80 || t.y > 1350) t.active = false;
  }
  if (b.t >= b.dur && b.grade === null && !w.targets.some((t) => t.active && t.kind === 'rock')) endBonus(w);
  if (b.grade !== null && b.t >= b.dur + BONUS.outro) {
    w.bonus = null;
    openCards(w);
  }
}

function endBonus(w: World): void {
  const b = w.bonus!;
  const cfg = BONUS[b.kind];
  for (const t of w.targets) t.active = false;
  const grade = b.hits >= cfg.gold ? 'gold' : b.hits >= cfg.silver ? 'silver' : b.hits >= cfg.bronze ? 'bronze' : 'none';
  b.grade = grade;
  const c = Math.min(4, w.chapter);
  const prize = grade === 'gold' ? 30 + 10 * c : grade === 'silver' ? 15 + 5 * c : grade === 'bronze' ? 5 + 2 * c : 0;
  const coins = Math.round(prize * coinMul(w));
  w.run.coins += coins;
  b.coins += coins;
  if (grade === 'gold') {
    w.run.bonusGold += 1;
    w.treasure = true;
  }
  // a bonus round heals up for the next chapter
  heal(w, 30);
  w.events.push({ t: 'bonusEnd', kind: b.kind, hits: b.hits, grade, coins: b.coins });
}

function bonusHits(w: World, x0: number, y0: number, x1: number, y1: number): void {
  const b = w.bonus!;
  for (const t of w.targets) {
    if (!t.active) continue;
    const tt = sweepCapsule(x0, y0, x1, y1, t.x, t.y, t.x, t.y, t.r);
    if (tt < 0) continue;
    t.active = false;
    b.hits += 1;
    // a bullseye: the arrow's path passes near the middle
    const bull = t.kind === 'target' && sweepCapsule(x0, y0, x1, y1, t.x, t.y, t.x, t.y, 10) >= 0;
    const base = t.kind === 'target' ? (bull ? 4 : 2) : t.kind === 'apple' ? 1 : 3;
    const coins = Math.round(base * coinMul(w));
    w.run.coins += coins;
    b.coins += coins;
    if (t.kind === 'apple') heal(w, 4);
    w.events.push({ t: 'bonusHit', x: t.x, y: t.y, coins, bull, kind: t.kind });
  }
}

// ---------------------------------------------------------------- apples

function updateApples(w: World): void {
  w.appleTimer -= DT;
  if (w.appleTimer <= 0) {
    w.appleTimer = w.rng.range(TUNING.appleEvery[0], TUNING.appleEvery[1]);
    const ap = w.apples.find((p) => !p.active);
    if (ap) {
      ap.active = true;
      ap.x = 780;
      ap.baseY = w.rng.range(330, 760);
      ap.y = ap.baseY;
      ap.vx = -TUNING.appleSpeed;
      ap.t = 0;
    }
  }
  for (const ap of w.apples) {
    if (!ap.active) continue;
    ap.t += DT;
    ap.x += ap.vx * DT;
    ap.y = ap.baseY + Math.sin(ap.t * 2.4) * 22;
    if (ap.x < -60) ap.active = false;
  }
}

// ---------------------------------------------------------------- queries

export function aliveEnemies(w: World): Archer[] {
  return w.enemies.filter((e) => e.alive);
}

/** Damage-dealing hit test used by the debug aimbot and tests: where is this enemy's head/chest? */
export function targetPoint(e: Archer, where: 'head' | 'chest' | 'weak'): { x: number; y: number } {
  const b = e.body;
  if (where === 'head') return { x: b.x[PT.head]!, y: b.y[PT.head]! };
  const u = 0.5;
  return { x: b.x[PT.neck]! + (b.x[PT.pelvis]! - b.x[PT.neck]!) * u, y: b.y[PT.neck]! + (b.y[PT.pelvis]! - b.y[PT.neck]!) * u };
}

/** Wave reached: the wave being played, or the next one once this one is cleared. */
export function reachedWave(w: World): number {
  return w.phase === 'clear' || w.phase === 'cards' || w.phase === 'bonus' ? w.wave + 1 : w.wave;
}

/** What the run has done so far (records, achievements, the result screen). */
export function summarize(w: World, daily = false): RunSummary {
  const r = w.run;
  const reached = reachedWave(w);
  return {
    reached,
    kos: r.kos,
    headChain: r.chainBest,
    streak: r.streakBest,
    multi: r.multiBest,
    focusUses: r.focusUses,
    bossKills: r.bossKills,
    chapterStage: [...r.chapterStage],
    bonusGold: r.bonusGold,
    barrelBest: r.barrelBest,
    ropeDrops: r.ropeDrops,
    endless: Math.max(0, reached - ENDLESS_WAVE + 1),
    daily,
  };
}
