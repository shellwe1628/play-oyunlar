/** Synthesized sound effects (data only; core's synth plays them). */
import type { SfxPreset } from '@oyun/core/pure';

export const SFX = {
  /** one tick of the string creaking while drawing (pitch rises with power) */
  creak: [
    { wave: 'sawtooth', freq: 140, freqEnd: 120, duration: 0.05, gain: 0.05 },
    { wave: 'noise', freq: 900, duration: 0.03, gain: 0.05 },
  ],
  /** release: string snap */
  snap: [
    { wave: 'square', freq: 520, freqEnd: 140, duration: 0.07, gain: 0.16 },
    { wave: 'noise', freq: 5200, duration: 0.05, gain: 0.22 },
    { wave: 'sine', freq: 90, freqEnd: 60, duration: 0.09, gain: 0.25 },
  ],
  /** arrow whistle in flight */
  whistle: [
    { wave: 'sine', freq: 1900, freqEnd: 1100, duration: 0.42, gain: 0.045, attack: 0.04 },
    { wave: 'noise', freq: 2600, duration: 0.3, gain: 0.04, attack: 0.05 },
  ],
  /** meaty thunk into a body */
  thunk: [
    { wave: 'sine', freq: 210, freqEnd: 55, duration: 0.16, gain: 0.55 },
    { wave: 'noise', freq: 1400, duration: 0.07, gain: 0.32 },
    { wave: 'square', freq: 120, freqEnd: 70, duration: 0.06, gain: 0.08 },
  ],
  /** arrow into wood/earth */
  thock: [
    { wave: 'triangle', freq: 380, freqEnd: 170, duration: 0.08, gain: 0.28 },
    { wave: 'noise', freq: 2200, duration: 0.05, gain: 0.16 },
  ],
  /** arrow on metal shield */
  clang: [
    { wave: 'square', freq: 1240, freqEnd: 900, duration: 0.18, gain: 0.08 },
    { wave: 'triangle', freq: 1870, freqEnd: 1500, duration: 0.25, gain: 0.08 },
    { wave: 'noise', freq: 6000, duration: 0.05, gain: 0.15 },
  ],
  /** headshot ping */
  ping: [
    { wave: 'sine', freq: 1568, duration: 0.5, gain: 0.22 },
    { wave: 'sine', freq: 2349, delay: 0.03, duration: 0.45, gain: 0.14 },
    { wave: 'triangle', freq: 3136, delay: 0.06, duration: 0.3, gain: 0.06 },
  ],
  /** knockout: a squeaky boing */
  boing: [
    { wave: 'triangle', freq: 300, freqEnd: 760, duration: 0.12, gain: 0.2 },
    { wave: 'triangle', freq: 760, freqEnd: 240, delay: 0.12, duration: 0.22, gain: 0.16 },
  ],
  /** poof into feathers */
  poof: [
    { wave: 'noise', freq: 3200, duration: 0.25, gain: 0.25, attack: 0.01 },
    { wave: 'sine', freq: 500, freqEnd: 1100, duration: 0.1, gain: 0.15 },
  ],
  /** player gets hit */
  ouch: [
    { wave: 'square', freq: 330, freqEnd: 160, duration: 0.14, gain: 0.12 },
    { wave: 'sine', freq: 160, freqEnd: 50, duration: 0.2, gain: 0.5 },
    { wave: 'noise', freq: 1000, duration: 0.1, gain: 0.25 },
  ],
  /** coin lands on the counter */
  tick: [{ wave: 'square', freq: 1760, freqEnd: 2100, duration: 0.05, gain: 0.07 }],
  /** card slams down */
  slam: [
    { wave: 'sine', freq: 130, freqEnd: 45, duration: 0.22, gain: 0.5 },
    { wave: 'noise', freq: 900, duration: 0.12, gain: 0.3 },
  ],
  /** card picked */
  pick: [
    { wave: 'triangle', freq: 660, duration: 0.08, gain: 0.2 },
    { wave: 'triangle', freq: 990, delay: 0.06, duration: 0.08, gain: 0.2 },
    { wave: 'triangle', freq: 1320, delay: 0.12, duration: 0.2, gain: 0.22 },
  ],
  /** bomb explodes */
  boom: [
    { wave: 'noise', freq: 700, duration: 0.5, gain: 0.45 },
    { wave: 'sine', freq: 110, freqEnd: 30, duration: 0.45, gain: 0.55 },
  ],
  /** apple crunch + heal chime */
  crunch: [
    { wave: 'noise', freq: 4000, duration: 0.09, gain: 0.25 },
    { wave: 'sine', freq: 880, freqEnd: 1320, delay: 0.05, duration: 0.18, gain: 0.18 },
  ],
  /** enemy starts drawing: a short creak */
  enemyDraw: [{ wave: 'sawtooth', freq: 110, freqEnd: 150, duration: 0.16, gain: 0.035 }],
  /** enemy release */
  enemySnap: [
    { wave: 'square', freq: 420, freqEnd: 120, duration: 0.06, gain: 0.08 },
    { wave: 'noise', freq: 4200, duration: 0.04, gain: 0.1 },
  ],
  /** a bomb's fuse is lit */
  fuse: [{ wave: 'noise', freq: 6000, duration: 0.25, gain: 0.07 }],
  /** shield bubble blocks */
  bubble: [
    { wave: 'sine', freq: 600, freqEnd: 1400, duration: 0.14, gain: 0.2 },
    { wave: 'sine', freq: 1400, freqEnd: 900, delay: 0.1, duration: 0.12, gain: 0.12 },
  ],
  /** a too-short drag: soft click, nothing fired */
  cancel: [{ wave: 'triangle', freq: 300, freqEnd: 250, duration: 0.05, gain: 0.08 }],
  /** wave start drum */
  drum: [
    { wave: 'sine', freq: 90, freqEnd: 50, duration: 0.2, gain: 0.45 },
    { wave: 'sine', freq: 90, freqEnd: 50, delay: 0.16, duration: 0.22, gain: 0.5 },
  ],
  /** boss arrives */
  roar: [
    { wave: 'sawtooth', freq: 120, freqEnd: 70, duration: 0.6, gain: 0.12 },
    { wave: 'sine', freq: 60, freqEnd: 40, duration: 0.6, gain: 0.4 },
  ],
} as const satisfies Record<string, SfxPreset>;
