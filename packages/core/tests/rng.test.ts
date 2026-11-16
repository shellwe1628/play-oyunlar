import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/rng';

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive on both ends and covers the range', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const v = r.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('range(min, max) returns floats in [min, max)', () => {
    const r = createRng(11);
    for (let i = 0; i < 1_000; i++) {
      const v = r.range(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
    }
  });

  it('pick() returns an element and throws on an empty array', () => {
    const r = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });

  it('shuffle() returns a permutation without mutating the input', () => {
    const r = createRng(9);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });

  it('chance(p) respects 0 and 1', () => {
    const r = createRng(13);
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('state can be saved and restored to continue the same sequence', () => {
    const r = createRng(99);
    r.next();
    const saved = r.getState();
    const expected = [r.next(), r.next(), r.next()];
    const restored = createRng(0);
    restored.setState(saved);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });

  it('fork(label) gives an independent, deterministic child stream', () => {
    const a = createRng(5).fork('spawns');
    const b = createRng(5).fork('spawns');
    const c = createRng(5).fork('colors');
    expect(a.next()).toEqual(b.next());
    expect(createRng(5).fork('spawns').next()).not.toEqual(c.next());
  });

  it('hashSeed turns strings into stable 32-bit unsigned seeds', () => {
    expect(hashSeed('abc')).toEqual(hashSeed('abc'));
    expect(hashSeed('abc')).not.toEqual(hashSeed('abd'));
    const h = hashSeed('anything');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
