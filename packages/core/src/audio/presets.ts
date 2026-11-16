/** Sound effects as data (pure). The synth in ./synth.ts renders them with WebAudio. */
export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export interface Voice {
  wave: Wave;
  /** Start frequency in Hz. For 'noise' it is the low-pass cutoff. */
  freq: number;
  /** End frequency (exponential glide). Defaults to freq. */
  freqEnd?: number;
  /** Seconds after the trigger. Default 0. */
  delay?: number;
  /** Seconds from attack start to silence. */
  duration: number;
  /** Peak gain 0..0.6 (headroom: several sounds overlap). */
  gain: number;
  /** Attack in seconds. Default 0.005 (no click). */
  attack?: number;
}

export type SfxPreset = readonly Voice[];

export const SFX_PRESETS = {
  /** UI press / generic tap */
  tap: [{ wave: 'triangle', freq: 660, freqEnd: 520, duration: 0.06, gain: 0.25 }],
  /** soft pop: UI appear, small success */
  pop: [{ wave: 'sine', freq: 420, freqEnd: 900, duration: 0.09, gain: 0.3 }],
  /** coin / point pickup: two-note chime */
  coin: [
    { wave: 'square', freq: 988, duration: 0.07, gain: 0.12 },
    { wave: 'square', freq: 1319, delay: 0.07, duration: 0.2, gain: 0.12 },
  ],
  /** impact: noise burst + falling thump */
  hit: [
    { wave: 'noise', freq: 1800, duration: 0.12, gain: 0.35 },
    { wave: 'sine', freq: 180, freqEnd: 55, duration: 0.16, gain: 0.5 },
  ],
  /** round won: rising arpeggio */
  win: [
    { wave: 'triangle', freq: 523, duration: 0.14, gain: 0.25 },
    { wave: 'triangle', freq: 659, delay: 0.09, duration: 0.14, gain: 0.25 },
    { wave: 'triangle', freq: 784, delay: 0.18, duration: 0.14, gain: 0.25 },
    { wave: 'triangle', freq: 1047, delay: 0.27, duration: 0.4, gain: 0.28 },
  ],
  /** round lost: falling slide */
  lose: [
    { wave: 'sawtooth', freq: 392, freqEnd: 196, duration: 0.42, gain: 0.12 },
    { wave: 'triangle', freq: 330, freqEnd: 150, delay: 0.12, duration: 0.5, gain: 0.22 },
  ],
} as const satisfies Record<string, SfxPreset>;

export type SfxName = keyof typeof SFX_PRESETS;

export function presetDuration(preset: SfxPreset): number {
  return Math.max(...preset.map((v) => (v.delay ?? 0) + v.duration));
}

/** Settings slider (0..1) → linear gain. Squared so the audible change spreads over the travel. */
export function sliderToGain(slider: number): number {
  const s = Math.min(1, Math.max(0, slider));
  return s * s;
}
