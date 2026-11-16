import { describe, expect, it } from 'vitest';
import { MIN_TOUCH, logicalSize, safeInsetsToLogical, toastY, touchHitSize } from '../src/ui/layout';

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
