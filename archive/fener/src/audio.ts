/**
 * Synthesized sound for Lantern Shift: sfx presets (data) and the ambient bed (drone + sea wash)
 * built on the core music bus. No audio files.
 */
import type { Audio, SfxPreset } from '@oyun/core';

export const SFX = {
  /** Relay click when switching cameras. */
  click: [
    { wave: 'square', freq: 2400, freqEnd: 1200, duration: 0.025, gain: 0.12 },
    { wave: 'noise', freq: 5000, duration: 0.05, gain: 0.12, delay: 0.01 },
  ],
  /** Short switch flicker. */
  flicker: [{ wave: 'noise', freq: 7000, duration: 0.14, gain: 0.08 }],
  /** Picking an object on the feed. */
  select: [{ wave: 'triangle', freq: 880, freqEnd: 990, duration: 0.07, gain: 0.16 }],
  /** Correct report: soft confirming two-note tone. */
  confirm: [
    { wave: 'sine', freq: 660, duration: 0.16, gain: 0.22 },
    { wave: 'sine', freq: 990, delay: 0.1, duration: 0.32, gain: 0.2 },
    { wave: 'noise', freq: 6000, duration: 0.18, gain: 0.06 },
  ],
  /** Correct type too: a third, higher note. */
  confirmBonus: [{ wave: 'triangle', freq: 1320, delay: 0.22, duration: 0.3, gain: 0.12 }],
  /** False report: harsh static. */
  falseReport: [
    { wave: 'noise', freq: 9000, duration: 0.7, gain: 0.32, attack: 0.002 },
    { wave: 'square', freq: 90, freqEnd: 60, duration: 0.5, gain: 0.12 },
  ],
  /** Night 1 only: a faint cue that something changed somewhere. */
  spawnCue: [{ wave: 'sine', freq: 233, freqEnd: 196, duration: 0.9, gain: 0.07, attack: 0.15 }],
  /** On the hour. */
  hour: [
    { wave: 'triangle', freq: 392, duration: 0.6, gain: 0.14, attack: 0.01 },
    { wave: 'sine', freq: 784, duration: 0.5, gain: 0.05 },
  ],
  /** Third anomaly: warning pulse. */
  warn: [{ wave: 'sawtooth', freq: 140, freqEnd: 120, duration: 0.35, gain: 0.08, attack: 0.03 }],
  /** Brink: the station is slipping. */
  brink: [
    { wave: 'sawtooth', freq: 110, freqEnd: 70, duration: 1.0, gain: 0.14, attack: 0.05 },
    { wave: 'noise', freq: 1200, duration: 1.0, gain: 0.12, attack: 0.2 },
  ],
} as const satisfies Record<string, SfxPreset>;

export type SfxKey = keyof typeof SFX;

export function sfx(audio: Audio, key: SfxKey, volume = 1): void {
  audio.playPreset(SFX[key], { volume, jitter: key === 'click' ? 0.6 : 0.1 });
}

/** Low drone + filtered-noise sea wash on the music bus. Start after the audio unlock. */
export class Ambience {
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private gain: GainNode | null = null;

  constructor(private readonly audio: Audio) {}

  start(): void {
    const ctx = this.audio.context;
    const out = this.audio.musicOutput;
    if (!ctx || !out || this.gain) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(1, now + 2.5);
    master.connect(out);
    this.gain = master;

    // Drone: two detuned low sines through a lowpass.
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 220;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneLp.connect(droneGain).connect(master);
    for (const f of [55, 82.6, 110.4]) {
      const o = ctx.createOscillator();
      o.type = f > 100 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.connect(droneLp);
      o.start(now);
      this.sources.push(o);
    }

    // Sea wash: looped noise, bandpassed, swelling with a slow LFO.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 520;
    const wash = ctx.createGain();
    wash.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(wash.gain);
    src.connect(bp).connect(wash).connect(master);
    src.start(now);
    lfo.start(now);
    this.sources.push(src, lfo);
    this.nodes.push(droneLp, droneGain, bp, wash, lfoGain, master);
  }

  stop(): void {
    const ctx = this.audio.context;
    if (!ctx || !this.gain) return;
    const t = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + 0.4);
    for (const s of this.sources) s.stop(t + 0.45);
    const nodes = this.nodes;
    this.sources = [];
    this.nodes = [];
    this.gain = null;
    setTimeout(() => nodes.forEach((n) => n.disconnect()), 600);
  }
}
