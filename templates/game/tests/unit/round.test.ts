import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, createRound, pointsFor, step, tap, type Rules } from '../../src/sim/round';

const arena = { width: 720, height: 1280 };
const rules: Rules = { ...DEFAULT_RULES, arena: { x: 0, y: 200, width: 720, height: 1000 } };

describe('round', () => {
  it('starts with full time, zero score and a target inside the arena', () => {
    const r = createRound(rules, createRng(1));
    expect(r.timeLeft).toBe(rules.duration);
    expect(r.score).toBe(0);
    expect(r.over).toBe(false);
    const { x, y, radius } = r.target;
    expect(x - radius).toBeGreaterThanOrEqual(rules.arena.x);
    expect(x + radius).toBeLessThanOrEqual(rules.arena.x + rules.arena.width);
    expect(y - radius).toBeGreaterThanOrEqual(rules.arena.y);
    expect(y + radius).toBeLessThanOrEqual(rules.arena.y + rules.arena.height);
    void arena;
  });

  it('is deterministic for the same seed', () => {
    const a = createRound(rules, createRng(7));
    const b = createRound(rules, createRng(7));
    expect(a.target).toEqual(b.target);
  });

  it('moves the target and keeps it inside the arena (bounces)', () => {
    const r = createRound(rules, createRng(3));
    for (let i = 0; i < 600; i++) {
      step(r, 1 / 60);
      const { x, y, radius } = r.target;
      expect(x - radius).toBeGreaterThanOrEqual(rules.arena.x - 1e-6);
      expect(x + radius).toBeLessThanOrEqual(rules.arena.x + rules.arena.width + 1e-6);
      expect(y - radius).toBeGreaterThanOrEqual(rules.arena.y - 1e-6);
      expect(y + radius).toBeLessThanOrEqual(rules.arena.y + rules.arena.height + 1e-6);
      if (r.over) break;
    }
  });

  it('a tap on the target scores, builds combo and respawns the target', () => {
    const r = createRound(rules, createRng(5));
    const before = { ...r.target };
    const res = tap(r, before.x, before.y);
    expect(res.kind).toBe('hit');
    expect(r.score).toBe(1);
    expect(r.combo).toBe(1);
    expect(r.target).not.toEqual(before);
  });

  it('counts taps just outside the visual radius as hits (touch forgiveness)', () => {
    const r = createRound(rules, createRng(5));
    const { x, y, radius } = r.target;
    expect(tap(r, x + radius + rules.forgiveness - 1, y).kind).toBe('hit');
  });

  it('a miss resets combo and costs time', () => {
    const r = createRound(rules, createRng(5));
    tap(r, r.target.x, r.target.y);
    const t = r.timeLeft;
    const far = { x: r.target.x > 360 ? 10 : 710, y: r.target.y > 700 ? 210 : 1190 };
    const res = tap(r, far.x, far.y);
    expect(res.kind).toBe('miss');
    expect(r.combo).toBe(0);
    expect(r.timeLeft).toBeCloseTo(t - rules.missPenalty, 6);
  });

  it('points grow with combo', () => {
    expect(pointsFor(1)).toBe(1);
    expect(pointsFor(3)).toBe(2);
    expect(pointsFor(6)).toBe(3);
  });

  it('targets get faster and smaller with every hit, down to a floor', () => {
    const r = createRound(rules, createRng(9));
    const r0 = r.target.radius;
    for (let i = 0; i < 40; i++) tap(r, r.target.x, r.target.y);
    expect(r.target.radius).toBeLessThan(r0);
    expect(r.target.radius).toBeGreaterThanOrEqual(rules.minRadius);
  });

  it('ends when time runs out and ignores taps afterwards', () => {
    const r = createRound(rules, createRng(2));
    let ended = false;
    for (let i = 0; i < 60 * (rules.duration + 1); i++) ended = step(r, 1 / 60).ended || ended;
    expect(ended).toBe(true);
    expect(r.over).toBe(true);
    expect(r.timeLeft).toBe(0);
    expect(tap(r, r.target.x, r.target.y).kind).toBe('ignored');
  });

  it('step reports "ended" exactly once', () => {
    const r = createRound(rules, createRng(2));
    let count = 0;
    for (let i = 0; i < 60 * (rules.duration + 2); i++) if (step(r, 1 / 60).ended) count++;
    expect(count).toBe(1);
  });
});
