import { describe, expect, it } from 'vitest';
import { createHitStop, createTrauma, easeOutBack, easeOutCubic, FEEDBACK_TIERS } from '../src/juice/math';

describe('trauma shake', () => {
  it('starts at rest with zero offset', () => {
    const t = createTrauma();
    expect(t.update(0.016)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it('adds trauma and clamps to 1', () => {
    const t = createTrauma();
    t.add(0.7);
    t.add(0.7);
    expect(t.trauma).toBe(1);
  });

  it('decays to exactly zero within 1/decay seconds and returns to rest', () => {
    const t = createTrauma({ decay: 2 });
    t.add(1);
    let out = { x: 1, y: 1, roll: 1 };
    for (let i = 0; i < 31; i++) out = t.update(1 / 60); // ~0.52 s
    expect(t.trauma).toBe(0);
    expect(out).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it('offset scales with trauma squared and never exceeds the maximum', () => {
    const t = createTrauma({ maxOffset: 20, maxRoll: 0.05, decay: 0.0001 });
    t.add(0.5);
    for (let i = 0; i < 200; i++) {
      const o = t.update(1 / 60);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(20 * 0.25 + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(20 * 0.25 + 1e-9);
      expect(Math.abs(o.roll)).toBeLessThanOrEqual(0.05 * 0.25 + 1e-9);
    }
  });

  it('strength 0 (reduce motion) produces no movement', () => {
    const t = createTrauma();
    t.strength = 0;
    t.add(1);
    expect(t.update(0.016)).toEqual({ x: 0, y: 0, roll: 0 });
  });
});

describe('hit-stop', () => {
  it('is inactive with time scale 1 by default', () => {
    const h = createHitStop();
    expect(h.update(16)).toBe(1);
    expect(h.active).toBe(false);
  });

  it('freezes for the requested real time then restores exactly 1', () => {
    const h = createHitStop();
    h.trigger(60);
    expect(h.update(30)).toBe(0);
    expect(h.update(29)).toBe(0);
    expect(h.update(1)).toBe(1);
    expect(h.active).toBe(false);
  });

  it('two overlapping stops 30 ms apart end after the longer remaining one', () => {
    const h = createHitStop();
    h.trigger(100);
    h.update(30);
    h.trigger(50); // 70 remaining > 50, keep 70
    h.update(60);
    expect(h.active).toBe(true);
    h.update(10);
    expect(h.active).toBe(false);
    expect(h.update(16)).toBe(1);
  });

  it('clamps very long stops so input never feels locked', () => {
    const h = createHitStop({ maxMs: 150 });
    h.trigger(5000);
    h.update(150);
    expect(h.active).toBe(false);
  });

  it('can use a slow-motion scale instead of a full freeze', () => {
    const h = createHitStop({ scale: 0.05 });
    h.trigger(50);
    expect(h.update(10)).toBe(0.05);
  });
});

describe('easing', () => {
  it('easeOutBack starts at 0, overshoots past 1 and ends at exactly 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10);
    expect(easeOutBack(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1);
  });
  it('easeOutCubic is monotonic from 0 to 1', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeOutCubic(1)).toBe(1);
  });
  it('clamps input outside 0..1', () => {
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutBack(-1)).toBeCloseTo(0, 10);
  });
});

describe('feedback tiers', () => {
  it('scale trauma, hit-stop and particles together, small < medium < large', () => {
    const { small, medium, large } = FEEDBACK_TIERS;
    expect(small.trauma).toBeLessThan(medium.trauma);
    expect(medium.trauma).toBeLessThan(large.trauma);
    expect(small.hitStopMs).toBe(0);
    expect(large.hitStopMs).toBeLessThanOrEqual(150);
    expect(small.particles).toBeLessThan(large.particles);
  });
});
