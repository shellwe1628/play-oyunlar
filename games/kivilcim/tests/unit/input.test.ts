import { describe, expect, it } from 'vitest';
import { EdgeQueue } from '../../src/sim/input';

/** Ticks end at 10, 20, 30 ... (ms) for these tests. */
const run = (q: EdgeQueue, ticks: number, start = 10, step = 10): boolean[] => {
  const out: boolean[] = [];
  for (let k = 0; k < ticks; k++) out.push(q.next(start + k * step));
  return out;
};

describe('input edge queue', () => {
  it('applies a press from the first tick whose time is at or after the event', () => {
    const q = new EdgeQueue();
    q.push(true, 23); // between ticks ending at 20 and 30
    expect(run(q, 5)).toEqual([false, false, true, true, true]);
  });

  it('an edge exactly at a tick boundary applies to that tick', () => {
    const q = new EdgeQueue();
    q.push(true, 20);
    expect(run(q, 3)).toEqual([false, true, true]);
  });

  it('a press shorter than one tick still produces exactly one held tick', () => {
    const q = new EdgeQueue();
    q.push(true, 21);
    q.push(false, 26); // 5 ms tap inside one tick
    expect(run(q, 5)).toEqual([false, false, true, false, false]);
  });

  it('a release shorter than one tick still produces exactly one released tick', () => {
    const q = new EdgeQueue(true);
    q.push(false, 31);
    q.push(true, 33);
    expect(run(q, 6)).toEqual([true, true, true, false, true, true]);
  });

  it('several taps inside one long frame each get their tick, in order', () => {
    const q = new EdgeQueue();
    q.push(true, 1);
    q.push(false, 2);
    q.push(true, 3);
    q.push(false, 4);
    // All four edges happened before the first tick ends: each edge takes one tick.
    expect(run(q, 6)).toEqual([true, false, true, false, false, false]);
  });

  it('ignores repeats of the current state', () => {
    const q = new EdgeQueue();
    q.push(false, 5);
    q.push(true, 15);
    q.push(true, 16);
    expect(run(q, 3)).toEqual([false, true, true]);
    expect(q.pending).toBe(0);
  });

  it('reset() drops pending edges and sets the state', () => {
    const q = new EdgeQueue();
    q.push(true, 50);
    q.reset(true);
    expect(q.pending).toBe(0);
    expect(run(q, 2)).toEqual([true, true]);
  });

  it('never grows without bound', () => {
    const q = new EdgeQueue();
    for (let i = 0; i < 1000; i++) q.push(i % 2 === 0, i);
    expect(q.pending).toBeLessThanOrEqual(64);
  });
});
