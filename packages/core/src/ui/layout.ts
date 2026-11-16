/** Pure layout maths: logical canvas size, touch target minimum, safe-area conversion. */
export type Orientation = 'portrait' | 'landscape';

export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Smallest touch target edge, in logical px of the 720×1280 canvas (≈ 48 CSS px on a 390 px phone). */
export const MIN_TOUCH = 88;

export function logicalSize(orientation: Orientation): Size {
  return orientation === 'portrait' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

/** Hit area for a visual of w×h: never smaller than MIN_TOUCH on either axis. */
export function touchHitSize(width: number, height: number, min = MIN_TOUCH): Size {
  return { width: Math.max(width, min), height: Math.max(height, min) };
}

/**
 * Convert device safe-area insets (CSS px from env(safe-area-inset-*)) to logical canvas px.
 * Only the part of an inset that overlaps the displayed canvas counts; letterbox bars already
 * keep the canvas clear of a notch.
 */
export function safeInsetsToLogical(insets: Insets, canvas: Rect, viewport: Size, logical: Size): Insets {
  const sx = logical.width / canvas.width;
  const sy = logical.height / canvas.height;
  const over = (inset: number, gap: number): number => Math.max(0, inset - Math.max(0, gap));
  return {
    top: over(insets.top, canvas.y) * sy,
    bottom: over(insets.bottom, viewport.height - (canvas.y + canvas.height)) * sy,
    left: over(insets.left, canvas.x) * sx,
    right: over(insets.right, viewport.width - (canvas.x + canvas.width)) * sx,
  };
}

/**
 * Where a toast sits. Default `'center'`: the middle of the safe area, because games put their
 * HUD in the top band and their controls (sliders, drawers, button rows) in the bottom band.
 * `'top'` = just under the safe top edge (the pre-2026-11 default), `'bottom'` = the same
 * distance above the safe bottom edge, a number = centre y in logical px.
 */
export type ToastPosition = 'top' | 'center' | 'bottom' | number;

/** Distance of the `'top'`/`'bottom'` slots from the safe edge (box centre), logical px. */
export const TOAST_EDGE_OFFSET = 90;
/** Gap kept between a toast box and the safe edges, logical px. */
export const TOAST_MARGIN = 16;

/**
 * Centre y of a toast box of `boxHeight` for `position`, inside the safe band `top..bottom`.
 * The result is clamped so the whole box (plus TOAST_MARGIN) stays inside the safe area.
 */
export function toastY(position: ToastPosition | undefined, safe: { top: number; bottom: number }, boxHeight: number): number {
  const p = position ?? 'center';
  const y =
    p === 'top'
      ? safe.top + TOAST_EDGE_OFFSET
      : p === 'bottom'
        ? safe.bottom - TOAST_EDGE_OFFSET
        : p === 'center'
          ? (safe.top + safe.bottom) / 2
          : p;
  const min = safe.top + TOAST_MARGIN + boxHeight / 2;
  const max = safe.bottom - TOAST_MARGIN - boxHeight / 2;
  if (min > max) return (safe.top + safe.bottom) / 2;
  return Math.min(max, Math.max(min, y));
}
