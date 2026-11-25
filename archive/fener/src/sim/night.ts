/** Shift constants and per-night tuning (pure). */

export const SHIFT = {
  /** Real seconds per in-game hour. */
  hourSeconds: 35,
  /** 00:00 → 06:00. */
  hours: 6,
  /** Seconds at the start with no spawns: flip through cameras and memorise. */
  grace: 15,
  /** This many active anomalies at once loses the night. */
  maxActive: 4,
  /** Blind time after a false report. */
  staticSeconds: 8,
  /** How long the "second wind" offer waits before the station is lost. */
  brinkSeconds: 8,
  points: {
    /** Right object. */
    object: 100,
    /** Right type as well. */
    type: 50,
    /** Up to this much extra for a quick report, falling to 0 at `speedWindow` seconds. */
    speed: 50,
    speedWindow: 20,
    /** Reaching 06:00. */
    dawn: 300,
  },
  /** Real-world first night of campaign and the number of nights. */
  nights: 7,
  /** Difficulty used by the daily shift. */
  dailyNight: 4,
} as const;

export const SHIFT_SECONDS = SHIFT.hours * SHIFT.hourSeconds;

export interface NightParams {
  night: number;
  /** Seconds between spawns, uniform in [min, max). */
  spawnMin: number;
  spawnMax: number;
  /** Minimum distance a moved object (or a duplicate) sits from its baseline, view px. */
  moveMin: number;
  /** Minimum RGB distance (0..441) of a recolour. */
  colorMin: number;
  /** Minimum relative size change: max(s, 1/s) - 1. */
  scaleMin: number;
  /** Faint sound when something changes (first night only). */
  audioCue: boolean;
  /** Intruders allowed. */
  intruders: boolean;
  /** Opacity of intruder drawings: they fade into the room on later nights. */
  intruderAlpha: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function nightParams(night: number): NightParams {
  const n = Math.min(SHIFT.nights, Math.max(1, Math.round(night)));
  const t = (n - 1) / (SHIFT.nights - 1);
  return {
    night: n,
    spawnMin: lerp(14, 6.5, t),
    spawnMax: lerp(22, 11, t),
    moveMin: lerp(90, 38, t),
    colorMin: lerp(170, 80, t),
    scaleMin: lerp(0.45, 0.22, t),
    audioCue: n === 1,
    intruders: n >= 3,
    intruderAlpha: lerp(0.95, 0.6, t),
  };
}
