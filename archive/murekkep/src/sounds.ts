import type { SfxPreset } from '@oyun/core';

/** Synthesized sound effects (no audio files). */
export const SFX = {
  /** A wave leaves: a wet drip. */
  drip: [
    { wave: 'sine', freq: 640, freqEnd: 240, duration: 0.14, gain: 0.22 },
    { wave: 'noise', freq: 2400, duration: 0.05, gain: 0.08 },
  ],
  /** A big capture soaks in: soft filtered noise swell with a low body. */
  soak: [
    { wave: 'noise', freq: 700, duration: 0.55, gain: 0.22, attack: 0.09 },
    { wave: 'sine', freq: 150, freqEnd: 85, duration: 0.45, gain: 0.16, attack: 0.04 },
  ],
  /** A colony is washed out. */
  splash: [
    { wave: 'noise', freq: 3200, duration: 0.32, gain: 0.3 },
    { wave: 'triangle', freq: 360, freqEnd: 110, duration: 0.5, gain: 0.2 },
    { wave: 'noise', freq: 900, delay: 0.12, duration: 0.5, gain: 0.14, attack: 0.06 },
  ],
  /** Blot power. */
  blot: [
    { wave: 'sine', freq: 180, freqEnd: 520, duration: 0.18, gain: 0.25 },
    { wave: 'noise', freq: 1400, delay: 0.06, duration: 0.35, gain: 0.2, attack: 0.03 },
  ],
  /** Tap that could not attack. */
  nope: [{ wave: 'triangle', freq: 200, freqEnd: 170, duration: 0.07, gain: 0.12 }],
  /** Our land is being taken (rate-limited by the scene). */
  hurt: [{ wave: 'sine', freq: 260, freqEnd: 170, duration: 0.12, gain: 0.1 }],
  /** Slider detent. */
  click: [{ wave: 'triangle', freq: 1200, duration: 0.025, gain: 0.06 }],
} as const satisfies Record<string, SfxPreset>;
