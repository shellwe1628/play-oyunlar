/**
 * Scripted players (pure): used by the balance tests, the `aimbot` test-hook action and
 * nothing else. They act only through the same API a finger uses (aim angle + power, card
 * taps and the focus button).
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { attemptForge, bowCost, type BowState } from './bow';
import type { CardId } from './cards';
import { CHAPTERS, ENDLESS_WAVE, stageOf } from './chapters';
import { clamp, minLaunchSpeed, sweepAabb } from './geom';
import { NO_META, type MetaLevels } from './meta';
import { PARTS, PT } from './ragdoll';
import { TUNING } from './tuning';
import type { Difficulty } from './waves';
import { WEAPONS, weaponPerks, type Projectile, type WeaponId } from './weapons';
import { advance, aliveEnemies, arcClear, arrowSpeed, BOOM, canShoot, createWorld, pickCard, playerOrigin, playerX, reachedWave, ROCKET, shoot, solveWithWind, SPEAR_LIFE, takeEvents, targetPoint, unleash, type Archer, type World } from './world';

export interface Profile {
  /** std dev of the launch angle error, radians */
  angleError: number;
  /** power error: uniform ±fraction of the intended power */
  powerError: number;
  /** aim at heads (true) or chests (false) */
  heads: boolean;
  /** seconds between being able to shoot and shooting (plus up to `thinkJitter`) */
  think: number;
  thinkJitter?: number;
  /** launch speed as a multiple of the minimum needed (lower = loftier arc that drops onto heads) */
  loft: number;
  /** card preference order (first available wins); empty = always the first card */
  prefer: readonly CardId[];
  /** how much of the wind drift is aimed off (0 … 1) */
  wind: number;
  /** reads the field: shoots healers first, drops barrels and ropes on enemies */
  tactics: boolean;
}

export const CARELESS: Profile = { angleError: 0.08, powerError: 0.25, heads: false, think: 0.6, loft: 1.18, prefer: [], wind: 0.6, tactics: false };
/** A clumsy first-timer: one shot every 2.5–3 s, rough aim, no dodging. */
export const SLOW_HUMAN: Profile = { angleError: 0.08, powerError: 0.15, heads: false, think: 2.0, thinkJitter: 0.5, loft: 1.18, prefer: [], wind: 0.5, tactics: false };
export const CAREFUL: Profile = {
  angleError: 0.012,
  powerError: 0.02,
  heads: true,
  think: 0.6,
  loft: 1.04,
  prefer: ['heavy', 'vitality', 'quick', 'shield', 'double', 'keen', 'split', 'vampire', 'pierce', 'chain', 'fire', 'zen', 'seeker', 'overdraw', 'boom', 'bounce', 'magnet', 'longsight'],
  wind: 1,
  tactics: true,
};

/** Enemies in the order the player would shoot them: healers first (tactics), then the one drawing (about to shoot), then the nearest. */
function targetOrder(w: World, p: Profile): Archer[] {
  // (an archer still hidden in a fog stage cannot be seen, nor hit)
  const list = aliveEnemies(w).filter((e) => e.brain !== 'spawn' && e.veil <= 0);
  const healer = p.tactics ? list.find((e) => e.type === 'healer') : undefined;
  list.sort((a, b) => (b.draw - a.draw) * 2 + (a.body.x[2]! - b.body.x[2]!) / 400);
  if (healer) list.unshift(...list.splice(list.indexOf(healer), 1));
  return list;
}

/** The solved shot at an archer's aim point. */
function solveAt(w: World, e: Archer, p: Profile): Solved {
  const q = aimPoint(e, p);
  return solve(w, q.x, q.y, p.loft, p.wind, e);
}

function aimPoint(t: Archer, p: Profile): { x: number; y: number } {
  const where: 'head' | 'chest' = p.heads || t.type === 'cover' ? 'head' : 'chest';
  const pt = targetPoint(t, where);
  // careful players aim for the crown, clear of the bow arm
  if (p.heads) pt.y -= 7 * t.scale;
  return pt;
}

function gauss(r: Rng): number {
  const u = Math.max(1e-9, r.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next());
}

/** How the selected weapon's projectile flies (world.ts fireVolley / updateArrows). */
interface Flight {
  kind: Projectile;
  speedMul: number;
  /** gravity, px/s² */
  g: number;
  windMul: number;
}

function flightOf(w: World): Flight {
  const s = w.stats;
  return { kind: s.projectile, speedMul: s.speedMul, g: TUNING.gravity * s.gravityMul, windMul: WEAPONS[s.weapon].windMul };
}

/** The draw power that launches at `speed` with this weapon. */
const powerFor = (speed: number, f: Flight): number => clamp((speed / f.speedMul - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin), 0, 1);

/** Launch speeds tried, as multiples of the minimum speed (× the profile's loft), flattest last. */
const ARC_STEPS = [1, 1.15, 1.35, 1.7] as const;

/**
 * The intended shot (before errors) at a point, for the selected weapon: arrows, bolts, spears
 * and pebbles take the flattest unblocked arc under their own gravity and wind (a spear's arc
 * must land within its 1.2 s flight); a boomerang and a rocket are aimed in a straight line.
 * Wind is aimed off by `windK`.
 */
export function solveShot(w: World, x: number, y: number, loft = 1.18, windK = 1): { angle: number; power: number } {
  const { angle, power } = solve(w, x, y, loft, windK);
  return { angle, power };
}

/** A solved shot, and whether its flight to the point is clear of ledges and walls (and in time). */
interface Solved {
  angle: number;
  power: number;
  clear: boolean;
}

function solve(w: World, x: number, y: number, loft: number, windK: number, who?: Archer): Solved {
  const f = flightOf(w);
  if (f.kind === 'boomerang') return solveBoomerang(w, x, y, windK, f);
  if (f.kind === 'rocket') {
    const direct = solveRocket(w, x, y, windK, f);
    // a lantern knight's ward swallows a rocket that strikes it (no burst): burst beside it instead
    const warded = who !== undefined && who.type === 'ward' && who.wardUp;
    if (!who || (direct.clear && !warded)) return direct;
    return searchShot(w, who, windK, f, direct, !warded) ?? { ...direct, clear: false };
  }
  let fallback: { angle: number; power: number } | null = null;
  const wind = w.wind * windK * f.windMul;
  const lo = TUNING.speedMin * f.speedMul;
  const hi = TUNING.speedMax * f.speedMul;
  // the bow's arrow keeps its four arcs; the other weapons also try the whole speed range (a
  // bolt's light gravity makes every multiple of the minimum speed the same clamped speed)
  const arrow = f.kind === 'arrow';
  const maxT = f.kind === 'spear' ? SPEAR_LIFE : arrow ? 3 : 5;
  const steps: readonly number[] = arrow ? ARC_STEPS : [...ARC_STEPS, -0.25, -0.5, -0.75, -1];
  for (const high of [false, true]) {
    for (const step of steps) {
      let angle = -0.6;
      let speed = lo;
      let ok = true;
      for (let i = 0; i < 3; i++) {
        const o = playerOrigin(w, angle);
        const need = minLaunchSpeed(x - o.x, y - o.y, f.g);
        // a positive step is a multiple of the minimum speed (× loft), a negative one a share of the range
        speed = step > 0 ? clamp(need * step * loft, lo, hi) : Math.max(lo + (hi - lo) * -step, Math.min(hi, need));
        const sol = solveWithWind(o.x, o.y, x, y, speed, wind, high, f.g);
        if (sol === null) ok = false;
        else angle = sol;
      }
      if (!ok) continue;
      const shot = { angle, power: powerFor(speed, f) };
      fallback ??= shot;
      const o = playerOrigin(w, angle);
      if (arcClear(w, o.x, o.y, angle, speed, x, y, windK * f.windMul, f.g, maxT)) return { ...shot, clear: true };
    }
  }
  return { ...(fallback ?? { angle: -Math.PI / 4, power: 1 }), clear: false };
}

/**
 * Rocket: full draw (the flattest, fastest flight, so it gets there before its 0.45 s fuse),
 * aimed with its light gravity; a burst within its radius of the point is as good as a hit.
 */
function solveRocket(w: World, x: number, y: number, windK: number, f: Flight): Solved {
  const speed = TUNING.speedMax * f.speedMul;
  let angle = Math.atan2(y - playerOrigin(w, -0.3).y, x - playerX(w));
  for (let i = 0; i < 3; i++) {
    const o = playerOrigin(w, angle);
    const sol = solveWithWind(o.x, o.y, x, y, speed, w.wind * windK * f.windMul, false, f.g);
    angle = sol ?? Math.atan2(y - o.y, x - o.x);
  }
  const o = playerOrigin(w, angle);
  // it must get there before the fuse
  return { angle, power: 1, clear: arcClear(w, o.x, o.y, angle, speed, x, y, windK * f.windMul, f.g, ROCKET.fuse) };
}

/** How far a boomerang thrown at `power` flies out before it turns (it slows linearly to a stop). */
function boomerangReach(power: number, f: Flight): number {
  return (arrowSpeed(power) * f.speedMul * (BOOM.turnBase + BOOM.turnPower * power)) / 2;
}

/**
 * Boomerang: straight at the point, drawn just hard enough that it turns a little past it (it
 * hits going out and again as it starts back); the wind's drift on the way out is aimed off.
 */
function solveBoomerang(w: World, x: number, y: number, windK: number, f: Flight): Solved {
  const wind = w.wind * windK * BOOM.windMul;
  let aimX = x;
  let angle = Math.atan2(y - playerOrigin(w, -0.3).y, x - playerX(w));
  let power = 1;
  for (let i = 0; i < 3; i++) {
    const o = playerOrigin(w, angle);
    const d = Math.hypot(aimX - o.x, y - o.y);
    const want = d * 1.06 + 25;
    // reach grows with power: bisect for the power that turns at `want`
    let lo = 0;
    let hi = 1;
    if (boomerangReach(1, f) <= want) lo = 1;
    else {
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (boomerangReach(mid, f) < want) lo = mid;
        else hi = mid;
      }
    }
    power = lo === 1 ? 1 : hi;
    const T = BOOM.turnBase + BOOM.turnPower * power;
    const v0 = arrowSpeed(power) * f.speedMul;
    // time to cover d while slowing: v0 (t − t²/2T) = d
    const q = Math.max(0, 1 - (2 * d) / (v0 * T));
    const t = T * (1 - Math.sqrt(q));
    aimX = x - 0.5 * wind * t * t;
    angle = Math.atan2(y - o.y, aimX - o.x);
  }
  // it flies over ledges and walls: only its reach can fall short
  const o = playerOrigin(w, angle);
  return { angle, power, clear: boomerangReach(power, f) >= Math.hypot(x - o.x, y - o.y) };
}

const PARTS_HEAD_R = PARTS.find((p) => p.kind === 'head')!.r;
const PARTS_BODY_R = PARTS.find((p) => p.kind === 'body')!.r;

/** Where a pass hurts an archer: its head and its chest, each a circle a little inside the hit shape. */
interface Goal {
  x: number;
  y: number;
  r: number;
}

function goalsOf(e: Archer): Goal[] {
  const head = targetPoint(e, 'head');
  const chest = targetPoint(e, 'chest');
  return [
    { x: head.x, y: head.y, r: PARTS_HEAD_R * e.scale - 8 },
    { x: chest.x, y: chest.y, r: PARTS_BODY_R * e.scale - 4 },
  ];
}

/** px a segment passes outside the goals (negative = through one). */
function gap(goals: readonly Goal[], x0: number, y0: number, x1: number, y1: number): number {
  let best = Infinity;
  for (const g of goals) best = Math.min(best, segDist(g.x, g.y, x0, y0, x1, y1) - g.r);
  return best;
}

/** A searched throw is taken if it passes within this many px of the goal circles (which sit 8 px inside the head, 4 px inside the chest). */
const SEARCH_OK = 4;

/** The angle error (rad) a searched rocket shot must survive either side (about CAREFUL's). */
const AIM_SLACK = 0.012;

/** Step used to predict a rocket's flight (coarser than the sim's, it is only aim). */
const PREDICT_DT = 1 / 60;

/** The first ledge or wall the segment enters: the contact point, or null. */
function contact(w: World, x0: number, y0: number, x1: number, y1: number): { x: number; y: number } | null {
  let best = 2;
  for (const L of w.ledges) {
    const h = sweepAabb(x0, y0, x1, y1, L.x, L.y, L.w, L.h);
    if (h && h.t < best) best = h.t;
  }
  for (const L of w.walls) {
    const h = sweepAabb(x0, y0, x1, y1, L.x, L.y, L.w, L.h);
    if (h && h.t < best) best = h.t;
  }
  return best <= 1 ? { x: x0 + (x1 - x0) * best, y: y0 + (y1 - y0) * best } : null;
}

/** Distance from (px, py) to the segment (x0, y0)–(x1, y1). */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
}

/**
 * How far a rocket fired at (angle, power) bursts outside an archer, in px (negative = it
 * reaches): a contact with its head or chest (unless `contactOk` is false: a ward swallows it), else its burst (on a ledge or wall, or at the
 * fuse) by the distance to its chest less what the burst reaches (world.ts updateArrows/burst).
 */
function rocketMiss(w: World, goals: readonly Goal[], scale: number, angle: number, power: number, windK: number, f: Flight, contactOk: boolean): number {
  const o = playerOrigin(w, angle);
  const speed = arrowSpeed(power) * f.speedMul;
  let px = o.x;
  let py = o.y;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const dt = PREDICT_DT;
  const wind = w.wind * windK * f.windMul;
  // burst(): archers whose chest is within the radius (+20 px × scale) take it; aim a little inside
  const burstR = (ROCKET.radius * (w.difficulty === 'hard' ? weaponPerks('firework', w.meta.wlevel).blastRadiusMul : 1) + 20 * scale) * 0.8;
  const chest = goals[1]!;
  for (let t = dt; t <= ROCKET.fuse + 1e-9; t += dt) {
    const nx = px + vx * dt + 0.5 * wind * dt * dt;
    const ny = py + vy * dt + 0.5 * f.g * dt * dt;
    vx += wind * dt;
    vy += f.g * dt;
    if (gap(goals, px, py, nx, ny) < 0) return contactOk ? -1 : Infinity;
    const c = contact(w, px, py, nx, ny);
    if (c) return Math.hypot(c.x - chest.x, c.y - chest.y) - burstR;
    if (ny < ROCKET.topEdge || ny < w.ceiling) return Infinity;
    px = nx;
    py = ny;
  }
  return Math.hypot(px - chest.x, py - chest.y) - burstR;
}

/**
 * A blocked rocket shot: search angles around the straight line and draw powers for the one
 * that bursts on the archer, by a ledge beside it or in the air next to it (a shorter draw
 * bursts sooner). Null if nothing reaches it, or only a throw a hair's breadth from failing.
 */
function searchShot(w: World, who: Archer, windK: number, f: Flight, direct: Solved, contactOk: boolean): Solved | null {
  const goals = goalsOf(who);
  const miss = (angle: number, power: number) =>
    angle < -Math.PI * 0.62 || angle > Math.PI * 0.3 || power < 0 || power > 1 ? Infinity : rocketMiss(w, goals, who.scale, angle, power, windK, f, contactOk);
  // a throw that only works to the hair (a ledge corner a few px off) is not one a hand repeats:
  // a throw scores its worst miss over a careful hand's angle error either side
  const steady = (angle: number, power: number) => Math.max(miss(angle - AIM_SLACK, power), miss(angle, power), miss(angle + AIM_SLACK, power));
  let best = { angle: direct.angle, power: direct.power, score: Infinity };
  const consider = (angle: number, power: number) => {
    const score = steady(angle, power);
    if (score < best.score) best = { angle, power, score };
  };
  // fine in angle: far off, a window over a ledge corner is only a few hundredths of a radian
  for (let da = -0.6; da <= 0.6 + 1e-9; da += 0.015) {
    for (let pw = 0.2; pw <= 1 + 1e-9; pw += 0.2) if (miss(direct.angle + da, pw) < SEARCH_OK) consider(direct.angle + da, pw);
  }
  if (best.score === Infinity) return null;
  const coarse = best;
  for (let da = -0.03; da <= 0.03 + 1e-9; da += 0.01) for (let dp = -0.1; dp <= 0.1 + 1e-9; dp += 0.05) consider(coarse.angle + da, coarse.power + dp);
  return best.score < SEARCH_OK + 10 ? { angle: best.angle, power: best.power, clear: true } : null;
}

/** Where to shoot in a bonus round: the nearest target, led by its flight time. */
function bonusPoint(w: World): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const t of w.targets) {
    if (!t.active || t.x > 700 || t.x < 300 || t.y < 120) continue;
    const d = Math.abs(t.x - 132) + Math.abs(t.y - 900) * 0.5;
    if (d >= bd) continue;
    bd = d;
    // lead: about the flight time to it
    const T = Math.hypot(t.x - 132, t.y - 900) / 1300;
    const vy = t.kind === 'target' ? Math.cos(t.t * 2.6) * 34 * 2.6 : t.vy;
    best = { x: t.x + t.vx * T, y: t.y + vy * T };
  }
  return best;
}

/** A barrel next to at least two enemies, or a rope above one, when the player reads the field. */
function tacticalPoint(w: World): { x: number; y: number } | null {
  for (const p of w.props) {
    if (!p.active || p.kind !== 'barrel') continue;
    // (an archer still hidden in the fog is not seen: no aiming at it through a barrel either)
    const near = aliveEnemies(w).filter((e) => e.veil <= 0 && Math.hypot(e.body.x[PT.pelvis]! - p.x, e.body.y[PT.pelvis]! - p.y) < 150).length;
    if (near >= 1) return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }
  return null;
}

/** Where to meet a lava rock that will land on the player: its fall, led by the arrow's flight time. */
function fallingRock(w: World): { x: number; y: number } | null {
  for (const a of w.arrows) {
    if (!a.active || a.owner !== 'enemy' || a.kind !== 'bomb' || a.state !== 0 || a.vy <= 0) continue;
    if (Math.abs(a.x - playerX(w)) > 70 || a.y < -60 || a.y > 520) continue;
    const o = playerOrigin(w, -Math.PI / 2);
    let t = 0.2;
    let x = a.x;
    let y = a.y;
    for (let i = 0; i < 3; i++) {
      x = a.x + a.vx * t;
      y = a.y + a.vy * t + 0.5 * TUNING.gravity * t * t;
      t = Math.hypot(x - o.x, y - o.y) / 1650;
    }
    if (y < o.y - 120) return { x, y };
  }
  return null;
}

export function planShot(w: World, rng: Rng, p: Profile): { angle: number; power: number } | null {
  // a lava rock falling on the player is shot down first (careful players only); it may be a
  // touch behind the bow, so the solved angle is taken the short way round (−π … π)
  const rock = p.tactics && w.phase === 'play' ? fallingRock(w) : null;
  if (rock) {
    const s = solve(w, rock.x, rock.y, p.loft, p.wind);
    const angle = s.angle > Math.PI ? s.angle - Math.PI * 2 : s.angle;
    return { angle: angle + gauss(rng) * p.angleError, power: s.power };
  }
  let pt: { x: number; y: number } | null = null;
  // the archer aimed at (a boomerang or a rocket may then curl back or burst beside it); a
  // barrel, an orb or a bonus target must be struck
  let who: Archer | undefined;
  let solved: Solved | null = null;
  if (w.phase === 'bonus') pt = bonusPoint(w);
  else {
    if (p.tactics) pt = tacticalPoint(w);
    // hard: a barrel the weapon cannot reach cleanly (a bolt cannot lob onto it) is left alone
    if (pt && w.difficulty === 'hard' && !solve(w, pt.x, pt.y, p.loft, p.wind).clear) pt = null;
    if (!pt) {
      const list = targetOrder(w, p);
      const t = list[0];
      if (!t) return null;
      // an orb fan from the warden is shot down first when it is close
      if (p.tactics) {
        for (const a of w.arrows) {
          if (a.active && a.owner === 'enemy' && a.kind === 'orb' && a.state === 0 && a.x < 560 && a.x > 300) {
            pt = { x: a.x + a.vx * 0.3, y: a.y + a.vy * 0.3 };
            break;
          }
        }
      }
      if (!pt) {
        who = t;
        // hard (the 3D build, every weapon): a careful player takes the first enemy in that order
        // with a clear shot (a crossbow bolt or a spear cannot lob onto every ledge)
        if (p.tactics && w.difficulty === 'hard') {
          for (const e of list) {
            const s = solveAt(w, e, p);
            if (e === t) solved = s;
            if (s.clear) {
              who = e;
              solved = s;
              break;
            }
          }
        }
        pt = aimPoint(who, p);
      }
    }
  }
  if (!pt) return null;
  const shot = solved ?? solve(w, pt.x, pt.y, p.loft, p.wind, who);
  // power error is an error in launch speed (what a sloppy thumb gets wrong)
  const speed = arrowSpeed(shot.power) * (1 + rng.range(-p.powerError, p.powerError));
  return {
    angle: shot.angle + gauss(rng) * p.angleError,
    power: clamp((speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin), 0, 1),
  };
}

export interface RunReport {
  wave: number;
  /** wave reached (the next wave after a clear) */
  reached: number;
  /** 0 … CHAPTERS − 1 chapter reached, CHAPTERS endless */
  chapter: number;
  firstKoShot: number;
  shots: number;
  kos: number;
  coins: number;
  time: number;
  cards: CardId[];
  bosses: number;
}

export interface RunOptions {
  meta?: MetaLevels;
  startChapter?: number;
  maxTime?: number;
  /** stop once this wave is reached (robustness sweeps) */
  untilWave?: number;
  /** keep the player alive (robustness sweeps: every stage must be clearable) */
  god?: boolean;
  /** enemy curves (waves.ts); default classic */
  difficulty?: Difficulty;
  /** called after every step */
  each?: (w: World) => void;
  /** the selected weapon and its level (hard); override `meta`'s */
  weapon?: WeaponId;
  wlevel?: number;
}

/** Play one whole run headless with a scripted player. */
export function playRun(seed: number, rng: Rng, p: Profile, opts: RunOptions | MetaLevels = {}, maxTime = 2400): RunReport {
  const o: RunOptions = 'hp' in opts ? { meta: opts } : opts;
  const meta: MetaLevels = { ...(o.meta ?? NO_META), ...(o.weapon ? { weapon: o.weapon } : {}), ...(o.wlevel !== undefined ? { wlevel: o.wlevel } : {}) };
  const w = createWorld({ seed, meta, startChapter: o.startChapter ?? 0, difficulty: o.difficulty ?? 'classic' });
  let wait = 0;
  let need = p.think + rng.next() * (p.thinkJitter ?? 0);
  const step = 1 / 30;
  const limit = o.maxTime ?? maxTime;
  while (w.time < limit && w.phase !== 'over') {
    if (o.untilWave && reachedWave(w) >= o.untilWave) break;
    // god: no hit can knock the player out (late hits can be bigger than the whole health bar;
    // the cap too, or a heal mid-step clips the health back to the real bar)
    if (o.god) w.player.hp = w.player.maxHp = 1e6;
    if (w.phase === 'cards') {
      let idx = 0;
      for (const c of p.prefer) {
        const i = w.offer.indexOf(c);
        if (i >= 0) {
          idx = i;
          break;
        }
      }
      pickCard(w, idx);
    }
    if (w.focus >= 1) unleash(w);
    if (canShoot(w) && (w.phase === 'title' || w.phase === 'play' || (w.phase === 'bonus' && w.bonus && w.bonus.t >= 0))) {
      wait += step;
      if (wait >= need || w.phase === 'title') {
        const s = planShot(w, rng, p);
        if (s && shoot(w, s.angle, s.power)) {
          wait = 0;
          need = p.think + rng.next() * (p.thinkJitter ?? 0);
        }
      }
    }
    advance(w, step);
    takeEvents(w);
    o.each?.(w);
  }
  const reached = reachedWave(w);
  return {
    wave: w.wave,
    reached,
    chapter: reached >= ENDLESS_WAVE ? CHAPTERS : stageOf(reached).chapter,
    firstKoShot: w.run.firstKoShot,
    shots: w.run.shots,
    kos: w.run.kos,
    coins: w.run.coins,
    time: w.time,
    cards: [...w.cards],
    bosses: w.run.bossKills.length,
  };
}

export interface CareerStep {
  run: number;
  reached: number;
  chapter: number;
  bow: number;
  coins: number;
}

/**
 * A player's first `runs` runs: play, bank the coins, forge the bow as far as the coins go
 * (then buy health). Returns per-run progress (what the balance table reports).
 */
export function career(seed: number, p: Profile, runs: number): CareerStep[] {
  const bow: BowState = { level: 0, heat: 0, tries: 0 };
  const wallet = { coins: 0 };
  let hp = 0;
  const out: CareerStep[] = [];
  for (let i = 0; i < runs; i++) {
    const meta: MetaLevels = { ...NO_META, hp, bow: bow.level };
    const r = playRun(seed * 1000 + i, createRng(seed * 7919 + i), p, { meta });
    wallet.coins += r.coins;
    // forge while affordable; a little health when the bow is out of reach
    for (;;) {
      const cost = bowCost(bow.level);
      if (cost === null || wallet.coins < cost) break;
      attemptForge(bow, wallet);
    }
    const hpCost = Math.round(25 * 1.55 ** hp);
    if (hp < 8 && wallet.coins >= hpCost && (bowCost(bow.level) ?? Infinity) > wallet.coins * 2) {
      wallet.coins -= hpCost;
      hp += 1;
    }
    out.push({ run: i + 1, reached: r.reached, chapter: r.chapter, bow: bow.level, coins: wallet.coins });
  }
  return out;
}
