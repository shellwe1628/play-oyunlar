/**
 * Scripted players (pure): used by the balance tests, the `aimbot` test-hook action and
 * nothing else. They act only through the same API a finger uses (aim angle + power, card
 * taps and the focus button).
 */
import { createRng, type Rng } from '@oyun/core/pure';
import { attemptForge, bowCost, type BowState } from './bow';
import type { CardId } from './cards';
import { ENDLESS_WAVE, stageOf } from './chapters';
import { clamp, minLaunchSpeed } from './geom';
import { NO_META, type MetaLevels } from './meta';
import { PT } from './ragdoll';
import { TUNING } from './tuning';
import type { Difficulty } from './waves';
import { advance, aliveEnemies, arcClear, arrowSpeed, canShoot, createWorld, pickCard, playerOrigin, reachedWave, shoot, solveWithWind, takeEvents, targetPoint, unleash, type Archer, type World } from './world';

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

function pickTarget(w: World, p: Profile): Archer | null {
  const list = aliveEnemies(w).filter((e) => e.brain !== 'spawn');
  if (list.length === 0) return null;
  if (p.tactics) {
    const healer = list.find((e) => e.type === 'healer');
    if (healer) return healer;
  }
  // the one that is drawing first (it is about to shoot), else the nearest
  list.sort((a, b) => (b.draw - a.draw) * 2 + (a.body.x[2]! - b.body.x[2]!) / 400);
  return list[0]!;
}

function gauss(r: Rng): number {
  const u = Math.max(1e-9, r.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next());
}

/** The intended shot (before errors) at a point: the flattest unblocked arc, wind aimed off by `windK`. */
export function solveShot(w: World, x: number, y: number, loft = 1.18, windK = 1): { angle: number; power: number } {
  let fallback: { angle: number; power: number } | null = null;
  const wind = w.wind * windK;
  for (const high of [false, true]) {
    for (const k of [loft, loft * 1.15, loft * 1.35, loft * 1.7]) {
      let angle = -0.6;
      let speed: number = TUNING.speedMin;
      let ok = true;
      for (let i = 0; i < 3; i++) {
        const o = playerOrigin(w, angle);
        const need = minLaunchSpeed(x - o.x, y - o.y, TUNING.gravity);
        speed = clamp(need * k, TUNING.speedMin, TUNING.speedMax);
        const sol = solveWithWind(o.x, o.y, x, y, speed, wind, high);
        if (sol === null) ok = false;
        else angle = sol;
      }
      if (!ok) continue;
      const shot = { angle, power: (speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin) };
      fallback ??= shot;
      const o = playerOrigin(w, angle);
      if (arcClear(w, o.x, o.y, angle, speed, x, y, windK)) return shot;
    }
  }
  return fallback ?? { angle: -Math.PI / 4, power: 1 };
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
    const near = aliveEnemies(w).filter((e) => Math.hypot(e.body.x[PT.pelvis]! - p.x, e.body.y[PT.pelvis]! - p.y) < 150).length;
    if (near >= 1) return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }
  return null;
}

export function planShot(w: World, rng: Rng, p: Profile): { angle: number; power: number } | null {
  let pt: { x: number; y: number } | null = null;
  if (w.phase === 'bonus') pt = bonusPoint(w);
  else {
    if (p.tactics) pt = tacticalPoint(w);
    if (!pt) {
      const t = pickTarget(w, p);
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
        const where: 'head' | 'chest' = p.heads || t.type === 'cover' ? 'head' : 'chest';
        pt = targetPoint(t, where);
        // careful players aim for the crown, clear of the bow arm
        if (p.heads) pt.y -= 7 * t.scale;
      }
    }
  }
  if (!pt) return null;
  const shot = solveShot(w, pt.x, pt.y, p.loft, p.wind);
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
  /** 0 … 3 chapter reached, 4 endless */
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
}

/** Play one whole run headless with a scripted player. */
export function playRun(seed: number, rng: Rng, p: Profile, opts: RunOptions | MetaLevels = {}, maxTime = 2400): RunReport {
  const o: RunOptions = 'hp' in opts ? { meta: opts } : opts;
  const w = createWorld({ seed, meta: o.meta ?? NO_META, startChapter: o.startChapter ?? 0, difficulty: o.difficulty ?? 'classic' });
  let wait = 0;
  let need = p.think + rng.next() * (p.thinkJitter ?? 0);
  const step = 1 / 30;
  const limit = o.maxTime ?? maxTime;
  while (w.time < limit && w.phase !== 'over') {
    if (o.untilWave && reachedWave(w) >= o.untilWave) break;
    if (o.god) w.player.hp = w.player.maxHp;
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
    chapter: reached >= ENDLESS_WAVE ? 4 : stageOf(reached).chapter,
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
