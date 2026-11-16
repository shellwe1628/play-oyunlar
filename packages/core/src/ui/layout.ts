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
