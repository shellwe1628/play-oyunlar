// Sparkrise has no sfx.ts: its sounds are core presets (coin, win, pop, hit) plus a few presets
// written inline in games/kivilcim/src/scenes/GameScene.ts. These are those inline presets,
// copied as data (same numbers) so the promo's sound render can play them through core's synth.
export const SFX = {
  /** death: thud + noise + buzz (GameScene, the crash) */
  death: [
    { wave: 'sine', freq: 150, freqEnd: 32, duration: 0.42, gain: 0.6 },
    { wave: 'noise', freq: 900, duration: 0.3, gain: 0.45 },
    { wave: 'square', freq: 90, freqEnd: 40, duration: 0.18, gain: 0.12 },
  ],
  /** speed / size / flip gate (GameScene, a gate crossed; the 'fast' pitch) */
  gate: [
    { wave: 'noise', freq: 4000, duration: 0.22, gain: 0.25 },
    { wave: 'triangle', freq: 400, freqEnd: 1100, duration: 0.2, gain: 0.25 },
  ],
  gateSlow: [
    { wave: 'noise', freq: 4000, duration: 0.22, gain: 0.25 },
    { wave: 'triangle', freq: 700, freqEnd: 300, duration: 0.2, gain: 0.25 },
  ],
  /** finish ring burst */
  ring: [{ wave: 'sine', freq: 300, freqEnd: 1400, duration: 0.18, gain: 0.25 }],
  /** near miss tick (pitch rises with the edge combo) */
  edge: [{ wave: 'square', freq: 1100, freqEnd: 1700, duration: 0.06, gain: 0.1 }],
  /** rank-up / fanfare */
  rankUp: [
    { wave: 'triangle', freq: 523, freqEnd: 1046, duration: 0.25, gain: 0.3 },
    { wave: 'triangle', freq: 784, freqEnd: 1568, duration: 0.35, gain: 0.25 },
  ],
} as const;
