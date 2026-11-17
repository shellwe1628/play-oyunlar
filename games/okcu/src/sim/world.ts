/**
 * The whole game as a deterministic fixed-step simulation: the player and enemy archers
 * (ragdolls with muscles), arrows, bombs, apples, ledges, waves, cards and coins. Scenes call
 * `advance`, `aimAt`, `shoot`, `pickCard`, … and draw the state; they hold no rules.
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { flyArrow, hitParts, sweepCapsule } from './arrow';
import { addVelocity, createBody, stepBody, translateBody, type Body, type Ledge } from './body';
import { drawOffer, statsFor, type CardId, type PlayerStats } from './cards';
import { resolveHit, type EnemyType, type HitPart } from './combat';
import { clamp, solveLaunchAngle, sweepAabb } from './geom';
import { NO_META, type MetaLevels } from './meta';
import { BOSS_PARTS, bowOrigin, createRagdoll, LEG_HEIGHT, PARTS, PT, setPose, type Part } from './ragdoll';
import { PLAYER_LEDGE, PLAYER_SCALE, PLAYER_X, TUNING } from './tuning';
import { enemyAccuracy, enemyDamageMul, enemyHp, enemyScale, enemyTiming, graceStep, helmetChance, layoutFor, waveEnemies, waveGrace } from './waves';

export type Phase = 'title' | 'play' | 'clear' | 'cards' | 'dying' | 'over';
export type ArcherType = EnemyType | 'player';
export type KoCause = 'shot' | 'head' | 'fall' | 'burn' | 'bomb';
type BrainState = 'wait' | 'draw' | 'cool' | 'jump' | 'spawn';

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
}

export interface Arrow {
  active: boolean;
  owner: 'player' | 'enemy';
  kind: 'arrow' | 'bomb';
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
  host: number;
  ha: number;
  hb: number;
  hu: number;
  hoff: number;
  hrel: number;
  /** visual: fades out when > 0 */
  fade: number;
  seq: number;
}

export interface Apple {
  active: boolean;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  t: number;
}

export type GameEvent =
  | { t: 'shot'; x: number; y: number; angle: number; power: number; arrows: number }
  | { t: 'enemyDraw'; id: number }
  | { t: 'enemyShot'; id: number; kind: 'arrow' | 'bomb'; x: number; y: number }
  | { t: 'hit'; id: number; part: HitPart; x: number; y: number; dmg: number; ko: boolean; slowmo: boolean; vx: number; vy: number; fire: boolean; enemy: EnemyType }
  | { t: 'bodyThunk'; id: number; x: number; y: number }
  | { t: 'playerHit'; part: HitPart; x: number; y: number; dmg: number; vx: number; vy: number }
  | { t: 'blocked'; x: number; y: number }
  | { t: 'ko'; id: number; x: number; y: number; cause: KoCause; coins: number; enemy: EnemyType }
  | { t: 'poof'; id: number; x: number; y: number; enemy: EnemyType }
  | { t: 'thunk'; x: number; y: number; owner: 'player' | 'enemy' }
  | { t: 'bounce'; x: number; y: number }
  | { t: 'shieldHit'; id: number; x: number; y: number; broke: boolean }
  | { t: 'bomb'; x: number; y: number; hurt: boolean; popped: boolean }
  | { t: 'apple'; x: number; y: number; heal: number }
  | { t: 'burn'; id: number; x: number; y: number; dmg: number }
  | { t: 'heal'; amount: number }
  | { t: 'waveStart'; wave: number }
  | { t: 'waveClear'; wave: number; coins: number }
  | { t: 'cards' }
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
}

export interface World {
  rng: Rng;
  brainRng: Rng;
  waveRng: Rng;
  cardRng: Rng;
  seed: number;
  meta: MetaLevels;
  phase: Phase;
  wave: number;
  time: number;
  acc: number;
  phaseT: number;
  player: Archer;
  enemies: Archer[];
  arrows: Arrow[];
  apples: Apple[];
  appleTimer: number;
  ledges: Ledge[];
  /** the enemy ledges of the current layout (indices into `ledges` start at 1) */
  layout: readonly Ledge[];
  cards: CardId[];
  stats: PlayerStats;
  offer: CardId[];
  offerExtra: boolean;
  rerollsLeft: number;
  shieldLeft: number;
  reload: number;
  volleyQueue: number;
  volleyT: number;
  volleyAngle: number;
  volleyPower: number;
  revived: boolean;
  nextId: number;
  arrowSeq: number;
  run: RunStats;
  events: GameEvent[];
}

const ARROW_POOL = 72;
const NO_LEDGES: Ledge[] = [];
const DT = TUNING.dt;
const SHIELD_PARTS: readonly Part[] = [{ a: 0, b: 1, r: 15, kind: 'body' }];

function newArrow(): Arrow {
  return {
    active: false,
    owner: 'player',
    kind: 'arrow',
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
  };
}

function playerPelvisY(): number {
  return PLAYER_LEDGE.y - LEG_HEIGHT * PLAYER_SCALE;
}

function makeArcher(w: World, type: ArcherType, x: number, ledgeTop: number, facing: number, ledge: number): Archer {
  const scale = type === 'player' ? PLAYER_SCALE : enemyScale(type);
  const ay = ledgeTop - LEG_HEIGHT * scale;
  const body = createRagdoll(x, ay, facing, scale);
  const hp = type === 'player' ? w.stats.maxHp : enemyHp(type, w.wave);
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
    bob: (w.nextId * 1.7) % 6.28,
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
    a.shieldHp = 3;
    a.shieldOn = true;
  }
  poseArcher(a, 0);
  return a;
}

export interface WorldOptions {
  seed: number;
  meta?: MetaLevels;
}

export function createWorld(opts: WorldOptions): World {
  const rng = createRng(opts.seed);
  const meta = opts.meta ?? NO_META;
  const w = {
    rng,
    brainRng: rng.fork('brain'),
    waveRng: rng.fork('waves'),
    cardRng: rng.fork('cards'),
    seed: opts.seed,
    meta,
    phase: 'title',
    wave: 1,
    time: 0,
    acc: 0,
    phaseT: 0,
    enemies: [],
    arrows: Array.from({ length: ARROW_POOL }, newArrow),
    apples: Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, baseY: 0, vx: 0, t: 0 })),
    appleTimer: 6,
    ledges: [{ ...PLAYER_LEDGE }],
    layout: [],
    cards: [],
    stats: statsFor([], meta),
    offer: [],
    offerExtra: false,
    rerollsLeft: 0,
    shieldLeft: 0,
    reload: 0,
    volleyQueue: 0,
    volleyT: 0,
    volleyAngle: 0,
    volleyPower: 0,
    revived: false,
    nextId: 1,
    arrowSeq: 0,
    run: { shots: 0, hits: 0, kos: 0, headshots: 0, firstKoShot: 0, coins: 0, playerHitsTaken: 0, enemyShots: 0 },
    events: [],
  } as unknown as World;
  if (w.stats.starterCard) {
    const [card] = drawOffer(w.cardRng, [], 1);
    if (card) w.cards.push(card);
  }
  w.stats = statsFor(w.cards, meta);
  w.rerollsLeft = w.stats.rerolls;
  w.player = makeArcher(w, 'player', PLAYER_X, PLAYER_LEDGE.y, 1, 0);
  w.player.hp = w.player.maxHp = w.stats.maxHp;
  spawnWave(w, 1, true);
  return w;
}

// ---------------------------------------------------------------- waves

function spawnWave(w: World, wave: number, instant: boolean): void {
  w.wave = wave;
  w.layout = layoutFor(wave);
  w.ledges = [{ ...PLAYER_LEDGE }, ...w.layout.map((l) => ({ ...l }))];
  // leftover bodies of the last wave poof now
  for (const e of w.enemies) if (!e.gone) poof(w, e);
  w.enemies.length = 0;
  for (const a of w.arrows) {
    if (!a.active) continue;
    if (a.state === 0 && a.owner === 'enemy') a.active = false;
    if (a.state === 1 || a.state === 3) a.active = false;
  }
  const types = waveEnemies(wave, w.waveRng);
  types.forEach((type, i) => {
    const L = w.layout[i]!;
    const e = makeArcher(w, type, L.x + L.w / 2, L.y, -1, i + 1);
    e.helmet = type !== 'boss' && w.waveRng.chance(helmetChance(wave));
    e.brain = 'wait';
    e.timer = waveGrace(wave) + i * graceStep(wave) + w.brainRng.range(0, 0.4);
    if (!instant) {
      e.brain = 'spawn';
      e.spawnT = 0;
      e.anchorY -= 900;
      translateBody(e.body, 0, -900);
      if (e.shield) translateBody(e.shield, 0, -900);
    }
    w.enemies.push(e);
  });
  w.shieldLeft = w.stats.shieldCharges;
  w.events.push({ t: 'waveStart', wave });
}

function startRun(w: World): void {
  w.phase = 'play';
  w.phaseT = 0;
  w.events.push({ t: 'waveStart', wave: w.wave });
}

// ---------------------------------------------------------------- player input

/** Aim pose while the string is drawn (power 0..1); no rules change. */
export function aimAt(w: World, angle: number, power: number): void {
  const p = w.player;
  if (!p.alive) return;
  p.aim = clamp(angle, -Math.PI * 0.62, Math.PI * 0.3);
  p.draw = clamp(power, 0, 1);
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
  return (w.phase === 'title' || w.phase === 'play' || w.phase === 'clear') && w.player.alive && w.reload <= 0;
}

/** Release the string. In the title this fires and starts wave 1. */
export function shoot(w: World, angle: number, power: number): boolean {
  if (!canShoot(w)) return false;
  if (w.phase === 'title') startRun(w);
  const a = effectiveAngle(w, clamp(angle, -Math.PI * 0.62, Math.PI * 0.3));
  w.run.shots += 1;
  w.reload = w.stats.reload;
  w.player.aim = a;
  w.player.draw = 0;
  fireVolley(w, a, power);
  w.volleyQueue = w.stats.volleys - 1;
  w.volleyT = 0.12;
  w.volleyAngle = a;
  w.volleyPower = power;
  const o = playerOrigin(w, a);
  w.events.push({ t: 'shot', x: o.x, y: o.y, angle: a, power, arrows: w.stats.volleys * (1 + 2 * w.stats.splitPairs) });
  return true;
}

function fireVolley(w: World, angle: number, power: number): void {
  const speed = arrowSpeed(power);
  const pairs = w.stats.splitPairs;
  for (let k = -pairs; k <= pairs; k++) {
    const ang = angle + k * 0.065;
    const o = playerOrigin(w, angle);
    const ar = spawnArrow(w, 'player', 'arrow', o.x, o.y, Math.cos(ang) * speed, Math.sin(ang) * speed);
    if (!ar) continue;
    ar.dmgMul = w.stats.dmgMul;
    ar.impulseMul = w.stats.impulseMul;
    ar.fire = w.stats.fireDps > 0;
    ar.pierce = w.stats.pierce;
    ar.bounces = w.stats.bounces;
  }
}

function spawnArrow(w: World, owner: 'player' | 'enemy', kind: 'arrow' | 'bomb', x: number, y: number, vx: number, vy: number): Arrow | null {
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
  a.life = kind === 'bomb' ? 6 : 5;
  a.dmgMul = 1;
  a.impulseMul = 1;
  a.fire = false;
  a.pierce = 0;
  a.bounces = 0;
  a.ignore = -1;
  a.host = -1;
  a.fade = 0;
  a.seq = w.arrowSeq++;
  return a;
}

// ---------------------------------------------------------------- cards

export function pickCard(w: World, index: number): boolean {
  if (w.phase !== 'cards') return false;
  const card = w.offer[index];
  if (!card) return false;
  w.cards.push(card);
  const before = w.stats.maxHp;
  w.stats = statsFor(w.cards, w.meta);
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
  w.offer = drawOffer(w.cardRng, w.cards, w.offerExtra ? 4 : 3);
  return true;
}

/** Rewarded: a fourth card to choose from (once per pick). */
export function addExtraCard(w: World): boolean {
  if (w.phase !== 'cards' || w.offerExtra) return false;
  const more = drawOffer(w.cardRng, [...w.cards, ...w.offer.flatMap((c) => Array<CardId>(9).fill(c))], 1);
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
  w.phase = w.enemies.some((e) => e.alive) ? 'play' : 'clear';
  w.phaseT = 0;
  return true;
}

// ---------------------------------------------------------------- step

/** Advance by `seconds` of game time in fixed ticks. Clears and refills `w.events`. */
export function advance(w: World, seconds: number): void {
  w.events.length = 0;
  w.acc += Math.min(seconds, 0.25);
  while (w.acc >= DT) {
    w.acc -= DT;
    tick(w);
  }
}

/** Same as advance but keeps earlier events (for scripted players and tests). */
export function advanceKeep(w: World, seconds: number): void {
  w.acc += Math.min(seconds, 0.25);
  while (w.acc >= DT) {
    w.acc -= DT;
    tick(w);
  }
}

function tick(w: World): void {
  w.time += DT;
  w.phaseT += DT;
  if (w.reload > 0) w.reload = Math.max(0, w.reload - DT);
  if (w.volleyQueue > 0) {
    w.volleyT -= DT;
    if (w.volleyT <= 0) {
      fireVolley(w, w.volleyAngle + 0.012 * w.volleyQueue, w.volleyPower);
      w.volleyQueue -= 1;
      w.volleyT = 0.12;
    }
  }
  updateArcher(w, w.player);
  for (const e of w.enemies) updateArcher(w, e);
  updateArrows(w);
  if (w.phase === 'play') updateApples(w);
  switch (w.phase) {
    case 'play':
      if (w.enemies.every((e) => !e.alive)) {
        w.phase = 'clear';
        w.phaseT = 0;
        const coins = Math.round((2 + w.wave) * w.stats.coinMul);
        w.run.coins += coins;
        heal(w, TUNING.waveClearHeal);
        w.events.push({ t: 'waveClear', wave: w.wave, coins });
      }
      break;
    case 'clear':
      if (w.phaseT >= TUNING.clearDelay) {
        w.offerExtra = false;
        w.offer = drawOffer(w.cardRng, w.cards, 3);
        if (w.offer.length === 0) {
          // every card is maxed out: straight on to the next wave
          w.phase = 'play';
          w.phaseT = 0;
          spawnWave(w, w.wave + 1, false);
        } else {
          w.phase = 'cards';
          w.phaseT = 0;
          w.events.push({ t: 'cards' });
        }
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

function heal(w: World, amount: number): void {
  const p = w.player;
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  if (p.hp > before) w.events.push({ t: 'heal', amount: p.hp - before });
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
  w.run.kos += 1;
  if (w.run.firstKoShot === 0) w.run.firstKoShot = Math.max(1, w.run.shots);
  let coins = 3 + Math.floor(w.wave / 2) + (cause === 'head' ? 2 : 0) + (a.type === 'boss' ? 25 : 0);
  coins = Math.round(coins * w.stats.coinMul);
  w.run.coins += coins;
  w.events.push({ t: 'ko', id: a.id, x: a.body.x[PT.head]!, y: a.body.y[PT.head]!, cause, coins, enemy: a.type });
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

function brain(w: World, a: Archer): void {
  const active = w.phase === 'play' || w.phase === 'clear';
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
  if (a.stagger > 0 && a.brain === 'draw') {
    a.brain = 'cool';
    a.timer = 0.5;
    a.draw = 0;
  }
  a.timer -= DT;
  const timing = enemyTiming(w.wave);
  switch (a.brain) {
    case 'wait':
    case 'cool':
      a.draw = Math.max(0, a.draw - DT * 4);
      if (a.type === 'jumper') {
        a.jumpCooldown -= DT;
        if (a.jumpCooldown <= 0 && a.timer > 0.2 && tryJump(w, a)) return;
      }
      if (a.timer <= 0) beginDraw(w, a, timing.draw);
      break;
    case 'draw': {
      const dur = a.type === 'boss' ? timing.draw * 1.15 : timing.draw;
      a.draw = Math.min(1, a.draw + DT / dur);
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

function tryJump(w: World, a: Archer): boolean {
  const free: number[] = [];
  for (let i = 1; i < w.ledges.length; i++) {
    if (i === a.ledge) continue;
    if (w.enemies.some((e) => e.alive && e.ledge === i)) continue;
    free.push(i);
  }
  a.jumpCooldown = w.brainRng.range(2.6, 4.2);
  if (free.length === 0) return false;
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

function enemySpeed(a: Archer): number {
  return a.type === 'bomber' ? TUNING.bombSpeed : a.type === 'boss' ? TUNING.bossSpeed : TUNING.enemySpeed;
}

/**
 * True when an arrow launched from (ox, oy) reaches the vertical line x = tx (within `ty` ± 60
 * when it gets there) without passing through a ledge. Used by enemies (and the scripted
 * player) to pick an arc that is not blocked by another floating ledge.
 */
export function arcClear(w: World, ox: number, oy: number, angle: number, speed: number, tx: number, ty: number): boolean {
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const g = TUNING.gravity;
  const dir = Math.sign(tx - ox) || 1;
  for (let t = 1 / 90; t < 3; t += 1 / 90) {
    const x = ox + vx * t;
    const y = oy + vy * t + 0.5 * g * t * t;
    if ((x - tx) * dir >= 0) return Math.abs(y - ty) < 60;
    if (y > 1400) return false;
    if (t < 0.04) continue; // leaving the archer's own ledge edge
    for (const L of w.ledges) {
      if (x > L.x - 4 && x < L.x + L.w + 4 && y > L.y - 4 && y < L.y + L.h) return false;
    }
  }
  return false;
}

const SPEED_STEPS = [1, 1.12, 1.25, 1.4] as const;

/** Aim solve for an enemy: an unblocked arc to the player's chest (before the wave's error). */
export function enemyAimSolution(w: World, a: Archer): { angle: number; speed: number } {
  const base = enemySpeed(a);
  const tx = PLAYER_X;
  const ty = playerPelvisY() - 24;
  let first: { angle: number; speed: number } | null = null;
  for (const high of [false, true]) {
    for (const k of SPEED_STEPS) {
      const speed = base * k;
      let angle = Math.PI + 0.6;
      let ok = true;
      for (let i = 0; i < 2; i++) {
        const o = bowOrigin(a.stanceX, a.anchorY, angle, a.scale);
        const sol = solveLaunchAngle(tx - o.x, ty - o.y, speed, TUNING.gravity, high);
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

function beginDraw(w: World, a: Archer, _draw: number): void {
  const sol = enemyAimSolution(w, a);
  const acc = enemyAccuracy(w.wave);
  a.aimGoal = sol.angle + gauss(w.brainRng) * (acc.angle + a.aimPenalty);
  a.speedGoal = sol.speed * (1 + gauss(w.brainRng) * acc.speed);
  a.brain = 'draw';
  a.timer = a.type === 'boss' ? enemyTiming(w.wave).draw * 1.15 : enemyTiming(w.wave).draw;
  w.events.push({ t: 'enemyDraw', id: a.id });
}

function release(w: World, a: Archer): void {
  const kind = a.type === 'bomber' ? 'bomb' : 'arrow';
  const spread = a.type === 'boss' ? [-0.045, 0.045] : [0];
  const o = bowOrigin(a.stanceX, a.anchorY, a.aim, a.scale);
  for (const s of spread) {
    const ang = a.aimGoal + s;
    spawnArrow(w, 'enemy', kind, o.x, o.y, Math.cos(ang) * a.speedGoal, Math.sin(ang) * a.speedGoal);
    w.run.enemyShots += 1;
  }
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
    flyArrow(a, DT, TUNING.gravity);
    a.angle = Math.atan2(a.vy, a.vx);
    a.life -= DT;
    if (a.life <= 0 || a.x < -300 || a.x > 1020 || a.y > 1600) {
      a.active = false;
      continue;
    }
    if (a.owner === 'player') playerArrowHits(w, a, x0, y0);
    else enemyArrowHits(w, a, x0, y0);
  }
}

/** Ledge test for a flying arrow from (x0,y0) to its current tip; returns true if it stopped. */
function ledgeHit(w: World, a: Arrow, x0: number, y0: number): boolean {
  let best: { t: number; nx: number; ny: number } | null = null;
  for (const L of w.ledges) {
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && (!best || h.t < best.t)) best = h;
  }
  if (!best) return false;
  const hx = x0 + (a.x - x0) * best.t;
  const hy = y0 + (a.y - y0) * best.t;
  if (a.kind === 'bomb') {
    explode(w, a, hx, hy);
    return true;
  }
  if (a.bounces > 0) {
    a.bounces -= 1;
    a.x = hx + best.nx * 2;
    a.y = hy + best.ny * 2;
    if (best.nx !== 0) a.vx = -a.vx * 0.78;
    if (best.ny !== 0) a.vy = -a.vy * 0.78;
    a.vx *= 0.92;
    a.ignore = -1;
    w.events.push({ t: 'bounce', x: hx, y: hy });
    return true;
  }
  const dir = Math.atan2(a.vy, a.vx);
  a.x = hx + Math.cos(dir) * 12;
  a.y = hy + Math.sin(dir) * 12;
  a.angle = dir;
  a.state = 1;
  a.life = TUNING.stuckLedgeLife;
  a.vx = 0;
  a.vy = 0;
  w.events.push({ t: 'thunk', x: hx, y: hy, owner: a.owner });
  return true;
}

function explode(w: World, a: Arrow, x: number, y: number): void {
  a.active = false;
  const p = w.player;
  let hurt = false;
  if (p.alive) {
    const dx = p.body.x[PT.neck]! - x;
    const dy = (p.body.y[PT.neck]! + p.body.y[PT.pelvis]!) / 2 - y;
    if (dx * dx + dy * dy < TUNING.bombRadius ** 2) {
      hurt = true;
      if (w.shieldLeft > 0) {
        w.shieldLeft -= 1;
        w.events.push({ t: 'blocked', x, y });
      } else {
        damagePlayer(w, 'body', TUNING.bombDamage * enemyDamageMul(w.wave), x, y, (dx || 1) * 8, -300);
      }
    }
  }
  w.events.push({ t: 'bomb', x, y, hurt, popped: false });
}

function playerArrowHits(w: World, a: Arrow, x0: number, y0: number): void {
  // bombs in flight
  for (const b of w.arrows) {
    if (!b.active || b.kind !== 'bomb' || b.state !== 0) continue;
    if (sweepCapsule(x0, y0, a.x, a.y, b.x, b.y, b.x, b.y, TUNING.bombHitRadius) >= 0) {
      b.active = false;
      w.run.hits += 1;
      w.events.push({ t: 'bomb', x: b.x, y: b.y, hurt: false, popped: true });
    }
  }
  // apples
  for (const ap of w.apples) {
    if (!ap.active) continue;
    if (sweepCapsule(x0, y0, a.x, a.y, ap.x, ap.y, ap.x, ap.y, TUNING.appleRadius * w.stats.appleRadiusMul) >= 0) {
      ap.active = false;
      const amount = Math.round(TUNING.appleHeal * w.stats.appleHealMul);
      w.events.push({ t: 'apple', x: ap.x, y: ap.y, heal: amount });
      heal(w, amount);
    }
  }
  // shields, then bodies: the earliest along the path wins
  let bestT = 2;
  let bestHost: Archer | null = null;
  let bestPart = -1;
  let bestShield = false;
  let hx = 0;
  let hy = 0;
  for (const e of w.enemies) {
    if (e.gone || e.id === a.ignore) continue;
    if (e.shield) {
      const h = hitParts(e.shield, 1, SHIELD_PARTS, x0, y0, a.x, a.y);
      if (h && h.t < bestT) {
        bestT = h.t;
        bestHost = e;
        bestPart = 0;
        bestShield = true;
        hx = h.x;
        hy = h.y;
      }
    }
    const h = hitParts(e.body, e.scale, e.parts, x0, y0, a.x, a.y);
    if (h && h.t < bestT) {
      bestT = h.t;
      bestHost = e;
      bestPart = h.part;
      bestShield = false;
      hx = h.x;
      hy = h.y;
    }
  }
  // ledges in front of the hit?
  let ledgeT = 2;
  for (const L of w.ledges) {
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && h.t < ledgeT) ledgeT = h.t;
  }
  if (bestHost && bestT <= ledgeT) {
    if (bestShield) hitShield(w, a, bestHost, hx, hy);
    else hitEnemy(w, a, bestHost, bestHost.parts[bestPart]!, hx, hy);
    return;
  }
  ledgeHit(w, a, x0, y0);
}

function hitShield(w: World, a: Arrow, e: Archer, hx: number, hy: number): void {
  const s = e.shield!;
  stickTo(a, e, s, SHIELD_PARTS[0]!, hx, hy, 3);
  w.run.hits += 1;
  let broke = false;
  if (e.shieldOn) {
    e.shieldHp -= a.dmgMul >= 1.6 ? 2 : 1;
    if (e.shieldHp <= 0) {
      broke = true;
      dropShield(w, e, Math.sign(a.vx || 1) * 220 * a.impulseMul);
      // the arrow's push knocks it away from the archer
    }
  } else {
    pushBody(s, hx, hy, a.vx, a.vy, 0.4, 120);
  }
  w.events.push({ t: 'shieldHit', id: e.id, x: hx, y: hy, broke });
}

function hitEnemy(w: World, a: Arrow, e: Archer, part: Part, hx: number, hy: number): void {
  const vx = a.vx;
  const vy = a.vy;
  const k = TUNING.impulse * a.impulseMul;
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
  w.run.hits += 1;
  const out = resolveHit(e.type, part.kind, a.dmgMul);
  e.hurt = 0;
  e.body.muscle = Math.min(e.body.muscle, e.type === 'boss' ? 0.35 : TUNING.hitMuscle);
  e.aimPenalty += out.aimPenalty;
  if (out.stagger > 0) e.stagger = Math.max(e.stagger, out.stagger);
  if (e.brain === 'draw' && e.type !== 'boss') {
    e.brain = 'cool';
    e.timer = 0.6;
    e.draw = 0;
  }
  // shove the stance; off the edge means a fall
  const shove = (out.shove + (part.kind === 'body' ? 0.35 : 0) * (a.impulseMul > 1.2 ? 1 : 0)) * TUNING.legShove * a.impulseMul;
  if (shove > 0 && e.type !== 'boss' && e.brain !== 'jump') {
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
  e.hp -= out.damage;
  const ko = out.ko || e.hp <= 0;
  if (part.kind === 'head' || part.kind === 'weak') w.run.headshots += 1;
  w.events.push({ t: 'hit', id: e.id, part: part.kind, x: hx, y: hy, dmg: out.ko ? Math.max(out.damage, e.hp + out.damage) : out.damage, ko, slowmo: out.slowmo || (ko && e.type === 'boss'), vx, vy, fire: a.fire, enemy: e.type as EnemyType });
  if (w.stats.lifesteal > 0) heal(w, w.stats.lifesteal);
  if (ko) {
    knockOut(w, e, part.kind === 'head' ? 'head' : 'shot');
    // knockout kick: the whole body is thrown along the arrow with a little hop, so it
    // tumbles, flops over the edge or ends up dangling instead of just sitting down
    const kick = TUNING.koKick * a.impulseMul;
    for (let i = 0; i < e.body.n; i++) addVelocity(e.body, i, vx * kick, Math.min(0, vy * kick) - TUNING.koHop, DT);
    addVelocity(e.body, PT.head, vx * kick * 0.8, vy * kick * 0.4, DT);
  }
  stickOrPierce(w, a, e, part, hx, hy);
}

function stickOrPierce(w: World, a: Arrow, e: Archer, part: Part, hx: number, hy: number): void {
  if (a.pierce > 0) {
    a.pierce -= 1;
    a.ignore = e.id;
    a.vx *= 0.85;
    a.vy *= 0.85;
    return;
  }
  stickTo(a, e, e.body, part, hx, hy, 2);
  trimStuck(w, e.id);
}

function damagePlayer(w: World, part: HitPart, dmg: number, x: number, y: number, vx: number, vy: number): void {
  const p = w.player;
  const out = resolveHit('player', part, 1);
  p.hp -= dmg;
  p.hurt = 0;
  p.body.muscle = Math.min(p.body.muscle, 0.12);
  if (out.wobble > 0) p.wobble = Math.max(p.wobble, out.wobble);
  if (out.stagger > 0) p.stagger = Math.max(p.stagger, out.stagger);
  w.run.playerHitsTaken += 1;
  pushBody(p.body, x, y, vx, vy, 0.3, 70);
  w.events.push({ t: 'playerHit', part, x, y, dmg, vx, vy });
  if (p.hp <= 0) knockOut(w, p, part === 'head' ? 'head' : 'shot');
}

function enemyArrowHits(w: World, a: Arrow, x0: number, y0: number): void {
  const p = w.player;
  let ledgeT = 2;
  for (const L of w.ledges) {
    const h = sweepAabb(x0, y0, a.x, a.y, L.x, L.y, L.w, L.h);
    if (h && h.t < ledgeT) ledgeT = h.t;
  }
  const h = p.gone ? null : hitParts(p.body, p.scale, PARTS, x0, y0, a.x, a.y);
  if (h && h.t <= ledgeT) {
    const part = PARTS[h.part]!;
    const hx = h.x;
    const hy = h.y;
    if (a.kind === 'bomb') {
      explode(w, a, hx, hy);
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
    if (p.alive) damagePlayer(w, part.kind, resolveHit('player', part.kind, enemyDamageMul(w.wave)).damage, hx, hy, vx, vy);
    else pushBody(p.body, hx, hy, vx, vy, 0.3, 70);
    stickTo(a, p, p.body, part, hx, hy, 2);
    trimStuck(w, p.id);
    return;
  }
  ledgeHit(w, a, x0, y0);
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
