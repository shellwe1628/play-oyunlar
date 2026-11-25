import { describe, expect, it } from 'vitest';
import { MAX_FRAME_MS, followsRealTime, realTimeDelta, splitStep } from '../src/time';

describe('followsRealTime', () => {
  it('is on under automation (navigator.webdriver) or in test mode', () => {
    expect(followsRealTime({ webdriver: true, test: false })).toBe(true);
    expect(followsRealTime({ webdriver: false, test: true })).toBe(true);
  });
  it('is off for a real player', () => {
    expect(followsRealTime({ webdriver: false, test: false })).toBe(false);
    expect(followsRealTime({ webdriver: undefined, test: false })).toBe(false);
  });
});

describe('realTimeDelta', () => {
  it('passes slow frames through unchanged, so game time keeps up with the wall clock', () => {
    // Phaser's own smoothing would clamp this to 16.67 ms while the window is unfocused.
    expect(realTimeDelta(82)).toBe(82);
    expect(realTimeDelta(16.7)).toBe(16.7);
  });
  it('caps a single huge frame at MAX_FRAME_MS so game logic cannot explode', () => {
    expect(MAX_FRAME_MS).toBe(200);
    expect(realTimeDelta(5000)).toBe(200);
  });
  it('turns negative or non-finite deltas into 0', () => {
    expect(realTimeDelta(-3)).toBe(0);
    expect(realTimeDelta(Number.NaN)).toBe(0);
    expect(realTimeDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('splitStep', () => {
  it('splits a long frame into slices no longer than max that add up to the whole frame', () => {
    const three = splitStep(0.12, 0.05);
    expect(three).toHaveLength(3);
    expect(three[0]).toBe(0.05);
    expect(three[1]).toBe(0.05);
    expect(three[2]).toBeCloseTo(0.02, 10);
    const slices = splitStep(0.2, 0.05);
    expect(slices).toHaveLength(4);
    expect(slices.reduce((a, b) => a + b, 0)).toBeCloseTo(0.2, 10);
  });
  it('returns one slice for a short frame and none for zero, negative or non-finite time', () => {
    expect(splitStep(0.016, 0.05)).toEqual([0.016]);
    expect(splitStep(0, 0.05)).toEqual([]);
    expect(splitStep(-1, 0.05)).toEqual([]);
    expect(splitStep(Number.NaN, 0.05)).toEqual([]);
  });
  it('never loops forever on a bad max', () => {
    expect(splitStep(0.1, 0)).toEqual([0.1]);
  });
});
