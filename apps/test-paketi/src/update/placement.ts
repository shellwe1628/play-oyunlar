/**
 * Where the banner may go without getting in the way of a game.
 *
 * Every game uses Phaser Scale.FIT with a 720×1280 (9:16) canvas, so on a phone taller than
 * 16:9 (all current ones) there is an empty letterbox above and below the canvas. A banner that
 * fits there is shown there at once, even mid-run: it covers no pixel of the play area, and
 * ui.ts stops its touches from reaching the page (Sparkrise listens on window).
 * Without room (a 16:9 phone) the banner waits until nobody has touched the screen for IDLE_MS
 * and is then drawn over the top of the canvas; it hides again as soon as the player touches
 * the game. Sparkrise cannot be idle that long mid-run (with no finger down the spark veers left
 * into the wall), so the banner shows on its death/title screen, not during a run.
 * The launcher has no canvas: the banner is simply at the top.
 */
export const IDLE_MS = 4000;
export const MARGIN = 4;

export interface PlacementInput {
  viewport: { width: number; height: number };
  /** Safe-area insets (status bar, gesture bar) in CSS px. */
  insets: { top: number; bottom: number };
  /** The game canvas' client rect, or null on a page without a game. */
  canvas: { top: number; bottom: number; left: number; right: number } | null;
  /** Rendered banner height in CSS px. */
  height: number;
  /** Time since the last touch on the page. */
  idleMs: number;
  pointerHeld: boolean;
  /** The player is already using the banner (permission, download, install): never hide it. */
  engaged: boolean;
}

export type Placement = { mode: 'top' | 'letterbox' | 'overlay'; top: number } | { mode: 'wait'; top: 0 };

export function placeBanner(p: PlacementInput): Placement {
  const topEdge = p.insets.top + MARGIN;
  if (!p.canvas) return { mode: 'top', top: topEdge };

  const need = p.height + 2 * MARGIN;
  const below = p.viewport.height - p.insets.bottom - p.canvas.bottom;
  if (below >= need) return { mode: 'letterbox', top: Math.round(p.canvas.bottom + (below - p.height) / 2) };
  const above = p.canvas.top - p.insets.top;
  if (above >= need) return { mode: 'letterbox', top: Math.round(p.insets.top + (above - p.height) / 2) };

  if (p.engaged) return { mode: 'overlay', top: topEdge };
  if (p.pointerHeld || p.idleMs < IDLE_MS) return { mode: 'wait', top: 0 };
  return { mode: 'overlay', top: topEdge };
}
