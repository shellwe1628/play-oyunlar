import type { SfxPreset } from '@oyun/core/pure';

/** Synthesized sounds (no audio files). Played with audio.playPreset(SFX.x, { pitch }). */
export const SFX = {
  /** pick hitting rock: short filtered noise + low knock */
  dig: [
    { wave: 'noise', freq: 2400, duration: 0.05, gain: 0.22 },
    { wave: 'triangle', freq: 190, freqEnd: 120, duration: 0.07, gain: 0.28 },
  ],
  /** block breaks apart */
  crack: [
    { wave: 'noise', freq: 1400, duration: 0.18, gain: 0.32 },
    { wave: 'sine', freq: 140, freqEnd: 60, duration: 0.2, gain: 0.4 },
    { wave: 'noise', freq: 4000, delay: 0.03, duration: 0.08, gain: 0.12 },
  ],
  /** common find: tick */
  tick: [{ wave: 'square', freq: 1320, freqEnd: 1500, duration: 0.05, gain: 0.08 }],
  /** 1 in 100+: rising chime */
  chime: [
    { wave: 'triangle', freq: 784, duration: 0.16, gain: 0.22 },
    { wave: 'triangle', freq: 988, delay: 0.08, duration: 0.16, gain: 0.22 },
    { wave: 'triangle', freq: 1319, delay: 0.16, duration: 0.4, gain: 0.24 },
    { wave: 'sine', freq: 2637, delay: 0.16, duration: 0.5, gain: 0.06 },
  ],
  /** card flip whoosh */
  flip: [{ wave: 'noise', freq: 3200, freqEnd: 900, duration: 0.14, gain: 0.14 }],
  /** 1 in 10,000+: long chime over a swell */
  longChime: [
    { wave: 'sine', freq: 262, freqEnd: 523, duration: 1.4, gain: 0.12, attack: 0.5 },
    { wave: 'triangle', freq: 523, delay: 0.1, duration: 0.5, gain: 0.2 },
    { wave: 'triangle', freq: 659, delay: 0.28, duration: 0.5, gain: 0.2 },
    { wave: 'triangle', freq: 784, delay: 0.46, duration: 0.5, gain: 0.2 },
    { wave: 'triangle', freq: 1047, delay: 0.64, duration: 1.4, gain: 0.24 },
    { wave: 'sine', freq: 2093, delay: 0.64, duration: 1.6, gain: 0.08 },
    { wave: 'sine', freq: 3136, delay: 0.9, duration: 1.2, gain: 0.04 },
  ],
  /** the odds number slamming in */
  slam: [
    { wave: 'sine', freq: 110, freqEnd: 40, duration: 0.45, gain: 0.5 },
    { wave: 'noise', freq: 900, duration: 0.25, gain: 0.3 },
  ],
  /** glint appears / is tapped */
  glint: [
    { wave: 'sine', freq: 2093, duration: 0.12, gain: 0.1 },
    { wave: 'sine', freq: 2637, delay: 0.06, duration: 0.2, gain: 0.1 },
  ],
  /** fusion */
  fuse: [
    { wave: 'square', freq: 523, duration: 0.08, gain: 0.1 },
    { wave: 'square', freq: 1047, delay: 0.08, duration: 0.16, gain: 0.1 },
  ],
  /** upgrade bought */
  buy: [
    { wave: 'triangle', freq: 660, duration: 0.07, gain: 0.2 },
    { wave: 'triangle', freq: 880, delay: 0.06, duration: 0.07, gain: 0.2 },
    { wave: 'triangle', freq: 1320, delay: 0.12, duration: 0.14, gain: 0.2 },
  ],
  /** layer unlocked / set complete fanfare */
  fanfare: [
    { wave: 'triangle', freq: 392, duration: 0.15, gain: 0.22 },
    { wave: 'triangle', freq: 523, delay: 0.12, duration: 0.15, gain: 0.22 },
    { wave: 'triangle', freq: 659, delay: 0.24, duration: 0.15, gain: 0.22 },
    { wave: 'triangle', freq: 784, delay: 0.36, duration: 0.6, gain: 0.26 },
  ],
  /** combo fever starts: a rising roar and a bright stab */
  fever: [
    { wave: 'sawtooth', freq: 110, freqEnd: 440, duration: 0.5, gain: 0.12, attack: 0.1 },
    { wave: 'noise', freq: 1800, freqEnd: 5000, duration: 0.45, gain: 0.12 },
    { wave: 'square', freq: 880, delay: 0.42, duration: 0.12, gain: 0.12 },
    { wave: 'square', freq: 1175, delay: 0.5, duration: 0.25, gain: 0.12 },
  ],
  /** charging a hard vein: a low hum (pitch rises with the charge) */
  charge: [{ wave: 'triangle', freq: 220, freqEnd: 330, duration: 0.12, gain: 0.12 }],
  /** a fully charged strike on a vein: a heavy clang */
  clang: [
    { wave: 'square', freq: 330, freqEnd: 110, duration: 0.18, gain: 0.2 },
    { wave: 'noise', freq: 6000, duration: 0.1, gain: 0.2 },
    { wave: 'sine', freq: 1760, delay: 0.02, duration: 0.3, gain: 0.08 },
  ],
  /** boss phase broken / boss appears: a deep gong */
  gong: [
    { wave: 'sine', freq: 98, freqEnd: 82, duration: 1.4, gain: 0.45 },
    { wave: 'triangle', freq: 196, duration: 1, gain: 0.15 },
    { wave: 'sine', freq: 587, delay: 0.02, duration: 0.8, gain: 0.05 },
  ],
  /** cave-in rumble */
  rumble: [
    { wave: 'noise', freq: 300, duration: 0.7, gain: 0.35 },
    { wave: 'sine', freq: 60, freqEnd: 40, duration: 0.7, gain: 0.4 },
  ],
  /** relic fragment / relic assembled: crystalline sparkle */
  relic: [
    { wave: 'sine', freq: 1568, duration: 0.2, gain: 0.12 },
    { wave: 'sine', freq: 2093, delay: 0.08, duration: 0.25, gain: 0.12 },
    { wave: 'sine', freq: 3136, delay: 0.16, duration: 0.4, gain: 0.08 },
  ],
  /** rank up: a bigger fanfare */
  rankUp: [
    { wave: 'triangle', freq: 523, duration: 0.14, gain: 0.22 },
    { wave: 'triangle', freq: 659, delay: 0.12, duration: 0.14, gain: 0.22 },
    { wave: 'triangle', freq: 784, delay: 0.24, duration: 0.14, gain: 0.22 },
    { wave: 'triangle', freq: 1047, delay: 0.36, duration: 0.8, gain: 0.26 },
    { wave: 'square', freq: 523, delay: 0.36, duration: 0.8, gain: 0.06 },
    { wave: 'sine', freq: 2093, delay: 0.5, duration: 0.9, gain: 0.06 },
  ],
} as const satisfies Record<string, SfxPreset>;
