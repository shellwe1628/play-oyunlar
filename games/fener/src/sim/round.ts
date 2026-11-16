/**
 * Game rules for one round. PURE: no Phaser, no DOM, no Math.random — only the seeded Rng.
 * Scenes call createRound / step / tap and draw the result.
 */
import type { Rng } from '@oyun/core/pure';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rules {
  /** Round length, seconds. */
  duration: number;
  /** Playfield in logical px (scene passes the safe area below the HUD). */
  arena: Rect;
  startRadius: number;
  minRadius: number;
  /** Radius lost per hit. */
  shrinkPerHit: number;
  /** px/s */
  startSpeed: number;
  speedPerHit: number;
  maxSpeed: number;
  /** Extra hit radius for fingers, px. */
  forgiveness: number;
  /** Seconds lost on a miss. */
  missPenalty: number;
}

export const DEFAULT_RULES: Rules = {
  duration: 12,
  arena: { x: 0, y: 0, width: 720, height: 1280 },
  startRadius: 78,
  minRadius: 44,
  shrinkPerHit: 2.5,
  startSpeed: 220,
  speedPerHit: 22,
  maxSpeed: 720,
  forgiveness: 18,
  missPenalty: 0.6,
};

export interface Target {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface Round {
  readonly rules: Rules;
  /** Seeded stream owned by this round (spawn positions). */
  readonly rng: Rng;
  timeLeft: number;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  target: Target;
  over: boolean;
}

export type TapResult =
  | { kind: 'hit'; points: number; combo: number; x: number; y: number }
  | { kind: 'miss'; penalty: number }
  | { kind: 'ignored' };

/** Points for the n-th hit in a combo: 1, 1, 2, 2, 2, 3, ... */
export function pointsFor(combo: number): number {
  return 1 + Math.floor(combo / 3);
}

function spawn(rules: Rules, rng: Rng, hits: number): Target {
  const radius = Math.max(rules.minRadius, rules.startRadius - rules.shrinkPerHit * hits);
  const speed = Math.min(rules.maxSpeed, rules.startSpeed + rules.speedPerHit * hits);
  const a = rules.arena;
  const angle = rng.range(0, Math.PI * 2);
  return {
    x: rng.range(a.x + radius, a.x + a.width - radius),
    y: rng.range(a.y + radius, a.y + a.height - radius),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
  };
}

export function createRound(rules: Rules, rng: Rng): Round {
  return {
    rules,
    rng,
    timeLeft: rules.duration,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
    target: spawn(rules, rng, 0),
    over: false,
  };
}

/** Advance by dt seconds. Returns ended=true only on the step that ends the round. */
export function step(round: Round, dt: number): { ended: boolean } {
  if (round.over) return { ended: false };
  const t = round.target;
  const a = round.rules.arena;
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  if (t.x - t.radius < a.x) {
    t.x = a.x + t.radius;
    t.vx = Math.abs(t.vx);
  } else if (t.x + t.radius > a.x + a.width) {
    t.x = a.x + a.width - t.radius;
    t.vx = -Math.abs(t.vx);
  }
  if (t.y - t.radius < a.y) {
    t.y = a.y + t.radius;
    t.vy = Math.abs(t.vy);
  } else if (t.y + t.radius > a.y + a.height) {
    t.y = a.y + a.height - t.radius;
    t.vy = -Math.abs(t.vy);
  }
  round.timeLeft = Math.max(0, round.timeLeft - dt);
  if (round.timeLeft === 0) {
    round.over = true;
    return { ended: true };
  }
  return { ended: false };
}

/** Player tapped at (x, y) in logical px. */
export function tap(round: Round, x: number, y: number): TapResult {
  if (round.over) return { kind: 'ignored' };
  const t = round.target;
  const reach = t.radius + round.rules.forgiveness;
  if ((x - t.x) ** 2 + (y - t.y) ** 2 <= reach * reach) {
    round.combo += 1;
    round.bestCombo = Math.max(round.bestCombo, round.combo);
    round.hits += 1;
    const points = pointsFor(round.combo);
    round.score += points;
    const at = { x: t.x, y: t.y };
    round.target = spawn(round.rules, round.rng, round.hits);
    return { kind: 'hit', points, combo: round.combo, ...at };
  }
  round.combo = 0;
  round.misses += 1;
  const penalty = Math.min(round.timeLeft, round.rules.missPenalty);
  round.timeLeft -= penalty;
  return { kind: 'miss', penalty };
}
