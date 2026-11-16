import { describe, expect, it } from 'vitest';
import { MIN_TOUCH, findOverlaps, logicalSize, safeInsetsToLogical, stackRows, toastY, touchHitSize } from '../src/ui/layout';

describe('logicalSize', () => {
  it('is 720x1280 portrait and 1280x720 landscape', () => {
    expect(logicalSize('portrait')).toEqual({ width: 720, height: 1280 });
    expect(logicalSize('landscape')).toEqual({ width: 1280, height: 720 });
  });
});

describe('touchHitSize', () => {
  it('grows small targets to at least 88 logical px', () => {
    expect(MIN_TOUCH).toBe(88);
    expect(touchHitSize(40, 30)).toEqual({ width: 88, height: 88 });
    expect(touchHitSize(300, 100)).toEqual({ width: 300, height: 100 });
    expect(touchHitSize(300, 60)).toEqual({ width: 300, height: 88 });
  });
});

describe('safeInsetsToLogical', () => {
  // A 390x844 phone (CSS px) showing a 720x1280 FIT canvas:
  // scale = min(390/720, 844/1280) = 0.5417; canvas 390 x 693.3, letterbox top/bottom 75.3 each.
  const viewport = { width: 390, height: 844 };
  const canvas = { x: 0, y: 75.33, width: 390, height: 693.33 };
  const logical = { width: 720, height: 1280 };

  it('returns zero when the device has no insets', () => {
    expect(safeInsetsToLogical({ top: 0, right: 0, bottom: 0, left: 0 }, canvas, viewport, logical)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('ignores the part of an inset already covered by the letterbox', () => {
    const r = safeInsetsToLogical({ top: 47, right: 0, bottom: 34, left: 0 }, canvas, viewport, logical);
    expect(r.top).toBe(0);
    expect(r.bottom).toBe(0);
  });

  it('converts the overlapping part of an inset into logical px', () => {
    const full = { x: 0, y: 0, width: 390, height: 844 }; // canvas touching the edges
    const r = safeInsetsToLogical({ top: 47, right: 0, bottom: 34, left: 0 }, full, viewport, { width: 720, height: 1558 });
    expect(r.top).toBeCloseTo(47 * (1558 / 844), 5);
    expect(r.bottom).toBeCloseTo(34 * (1558 / 844), 5);
  });
});

describe('toastY', () => {
  // Portrait 720×1280 with a 60 px notch inset and a 40 px home-indicator inset.
  const safe = { top: 60, bottom: 1280 - 40 };
  const h = 80;

  it('defaults to the middle of the safe area: clear of the top HUD band and bottom controls', () => {
    expect(toastY(undefined, safe, h)).toBe((60 + 1240) / 2);
    expect(toastY('center', safe, h)).toBe(650);
  });

  it("'top' keeps the old slot just under the safe top edge", () => {
    expect(toastY('top', safe, h)).toBe(60 + 90);
  });

  it("'bottom' sits the same distance above the safe bottom edge", () => {
    expect(toastY('bottom', safe, h)).toBe(1240 - 90);
  });

  it('a number is the centre y in logical px, clamped so the whole box stays inside the safe area', () => {
    expect(toastY(400, safe, h)).toBe(400);
    expect(toastY(0, safe, h)).toBe(60 + 16 + 40);
    expect(toastY(5000, safe, h)).toBe(1240 - 16 - 40);
  });

  it('works in landscape', () => {
    expect(toastY('center', { top: 0, bottom: 720 }, h)).toBe(360);
  });
});

describe('stackRows', () => {
  const overlaps = (c: number[], h: number[]): boolean =>
    c.some((y, i) => i > 0 && y - h[i]! / 2 < c[i - 1]! + h[i - 1]! / 2);

  it('centres a stack that fits, rows in order with the gap between them', () => {
    const r = stackRows([60, 200, 50], { top: -250, bottom: 250, gap: 10 });
    expect(r.flexScale).toBe(1);
    expect(r.scale).toBe(1);
    // total 330 → starts at -165
    expect(r.centers).toEqual([-135, 5, 140]);
  });

  it('shrinks the flex row (the big number) when the rows do not fit, and nothing overlaps', () => {
    const heights = [56, 66, 205, 55, 47, 47, 47];
    const r = stackRows(heights, { top: -252, bottom: 252, gap: 8, flex: 2 });
    expect(r.scale).toBe(1);
    expect(r.flexScale).toBeLessThan(1);
    const shown = heights.map((h, i) => (i === 2 ? h * r.flexScale : h));
    expect(overlaps(r.centers, shown)).toBe(false);
    expect(r.centers[0]! - shown[0]! / 2).toBeGreaterThanOrEqual(-252 - 1e-9);
    expect(r.centers[6]! + shown[6]! / 2).toBeLessThanOrEqual(252 + 1e-9);
  });

  it('never shrinks the flex row below minFlexScale; then scales every row so the stack still fits', () => {
    const r = stackRows([100, 300, 100], { top: -100, bottom: 100, gap: 10, flex: 1, minFlexScale: 0.5 });
    expect(r.flexScale).toBe(0.5);
    expect(r.scale).toBeCloseTo(180 / 350, 10);
    expect(overlaps(r.centers, r.heights)).toBe(false);
    expect(r.centers[0]! - r.heights[0]! / 2).toBeCloseTo(-100, 9);
    expect(r.centers[2]! + r.heights[2]! / 2).toBeCloseTo(100, 9);
  });
});

describe('findOverlaps', () => {
  it('lists every pair of [x, y, w, h] rects that intersect (touching edges do not count)', () => {
    expect(
      findOverlaps({ a: [0, 0, 10, 10], b: [10, 0, 10, 10], c: [5, 5, 10, 10], d: [100, 100, 1, 1] }),
    ).toEqual([['a', 'c'], ['b', 'c']]);
    expect(findOverlaps({})).toEqual([]);
  });
});
