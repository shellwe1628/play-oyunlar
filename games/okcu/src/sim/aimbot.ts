/**
 * Scripted players (pure): used by the balance tests, the `aimbot` test-hook action and
 * nothing else. They act only through the same API a finger uses (aim angle + power).
 */
import type { Rng } from '@oyun/core/pure';
import type { CardId } from './cards';
import { clamp, minLaunchSpeed, solveLaunchAngle } from './geom';
import type { MetaLevels } from './meta';
import { TUNING } from './tuning';
import { advance, aliveEnemies, arcClear, arrowSpeed, canShoot, createWorld, pickCard, playerOrigin, shoot, takeEvents, targetPoint, type Archer, type World } from './world';

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
}

export const CARELESS: Profile = { angleError: 0.08, powerError: 0.25, heads: false, think: 0.6, loft: 1.18, prefer: [] };
/** A clumsy first-timer: one shot every 2.5–3 s, rough aim, no dodging. */
export const SLOW_HUMAN: Profile = { angleError: 0.08, powerError: 0.15, heads: false, think: 2.0, thinkJitter: 0.5, loft: 1.18, prefer: [] };
export const CAREFUL: Profile = {
  angleError: 0.012,
  powerError: 0.02,
  heads: true,
  think: 0.6,
  loft: 1.04,
  prefer: ['heavy', 'vitality', 'quick', 'shield', 'double', 'split', 'vampire', 'pierce', 'fire', 'bounce', 'magnet', 'longsight'],
};

function pickTarget(w: World): Archer | null {
  const list = aliveEnemies(w).filter((e) => e.brain !== 'spawn');
  if (list.length === 0) return null;
  // the one that is drawing first (it is about to shoot), else the nearest
  list.sort((a, b) => (b.draw - a.draw) * 2 + (a.body.x[2]! - b.body.x[2]!) / 400);
  return list[0]!;
}

function gauss(r: Rng): number {
  const u = Math.max(1e-9, r.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r.next());
}

/** The intended shot (before errors) at a point: the flattest unblocked arc. */
export function solveShot(w: World, x: number, y: number, loft = 1.18): { angle: number; power: number } {
  let fallback: { angle: number; power: number } | null = null;
  for (const high of [false, true]) {
    for (const k of [loft, loft * 1.15, loft * 1.35, loft * 1.7]) {
      let angle = -0.6;
      let speed: number = TUNING.speedMin;
      let ok = true;
      for (let i = 0; i < 3; i++) {
        const o = playerOrigin(w, angle);
        const need = minLaunchSpeed(x - o.x, y - o.y, TUNING.gravity);
        speed = clamp(need * k, TUNING.speedMin, TUNING.speedMax);
        const sol = solveLaunchAngle(x - o.x, y - o.y, speed, TUNING.gravity, high);
        if (sol === null) ok = false;
        else angle = sol;
      }
      if (!ok) continue;
      const shot = { angle, power: (speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin) };
      fallback ??= shot;
      const o = playerOrigin(w, angle);
      if (arcClear(w, o.x, o.y, angle, speed, x, y)) return shot;
    }
  }
  return fallback ?? { angle: -Math.PI / 4, power: 1 };
}

export function planShot(w: World, rng: Rng, p: Profile): { angle: number; power: number } | null {
  const t = pickTarget(w);
  if (!t) return null;
  let where: 'head' | 'chest' | 'weak' = p.heads ? 'head' : 'chest';
  if (t.type === 'boss') where = p.heads ? 'head' : 'chest';
  else if (t.shieldOn && p.heads) where = 'head';
  const pt = targetPoint(t, where);
  // careful players aim for the crown, clear of the bow arm
  if (p.heads) pt.y -= 7 * t.scale;
  const shot = solveShot(w, pt.x, pt.y, p.loft);
  // power error is an error in launch speed (what a sloppy thumb gets wrong)
  const speed = arrowSpeed(shot.power) * (1 + rng.range(-p.powerError, p.powerError));
  return {
    angle: shot.angle + gauss(rng) * p.angleError,
    power: clamp((speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin), 0, 1),
  };
}

export interface RunReport {
  wave: number;
  firstKoShot: number;
  shots: number;
  kos: number;
  coins: number;
  time: number;
  cards: CardId[];
}

/** Play one whole run headless with a scripted player. */
export function playRun(seed: number, rng: Rng, p: Profile, meta?: MetaLevels, maxTime = 1200): RunReport {
  const w = createWorld({ seed, ...(meta ? { meta } : {}) });
  let wait = 0;
  let need = p.think + rng.next() * (p.thinkJitter ?? 0);
  const step = 1 / 30;
  while (w.time < maxTime && w.phase !== 'over') {
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
    if (canShoot(w) && (w.phase === 'title' || w.phase === 'play')) {
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
  }
  return { wave: w.wave, firstKoShot: w.run.firstKoShot, shots: w.run.shots, kos: w.run.kos, coins: w.run.coins, time: w.time, cards: [...w.cards] };
}
