/**
 * Game-time policy. Pure, no Phaser.
 *
 * Phaser 4.2.1 `TimeStep.smoothDelta` clamps every frame delta to 1000/60 ms while the window is
 * not focused and for 120 frames (`fps.panicMax`) after start, focus and tab-visible, then
 * averages the last 10 deltas and replaces any delta over 200 ms (`fps.min` 5) with an older
 * one. In a focused window on a 60 Hz display that is harmless. Under automation (headless
 * Chromium on a loaded machine, ~12 fps) it made game time run at 1/5 of the wall clock.
 *
 * So when the page is automated or in test mode, core replaces the smoothing with
 * `realTimeDelta`: each frame advances game time by its real duration, capped at MAX_FRAME_MS.
 */

/** Largest delta one frame may pass to scenes, ms (Phaser's own cap: 1000 / fps.min 5). */
export const MAX_FRAME_MS = 200;

/** True when game time must follow the wall clock: automated browser or `?test=1`. */
export function followsRealTime(env: { webdriver: boolean | undefined; test: boolean }): boolean {
  return env.webdriver === true || env.test;
}

/** Real frame delta, clamped to 0..max ms (non-finite → 0). */
export function realTimeDelta(rawMs: number, max: number = MAX_FRAME_MS): number {
  if (!Number.isFinite(rawMs) || rawMs <= 0) return 0;
  return Math.min(rawMs, max);
}

/**
 * Split one frame of `seconds` into slices of at most `maxStep` seconds (same total), so a sim
 * stepped once per slice neither tunnels on a long frame nor loses time. Bad max → one slice.
 */
export function splitStep(seconds: number, maxStep: number): number[] {
  if (!Number.isFinite(seconds) || seconds <= 0) return [];
  if (!(maxStep > 0)) return [seconds];
  const slices: number[] = [];
  let left = seconds;
  while (left > 1e-12) {
    const s = Math.min(left, maxStep);
    slices.push(s);
    left -= s;
  }
  return slices;
}
