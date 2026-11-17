/**
 * Step sequencer on core's music bus (core ships no music player: candidate for core).
 * Steps are positions in the shaft (sim/music.ts), so the beat follows scroll speed exactly:
 * each frame the scene passes the spark's height and speed, and every 16th step inside the
 * look-ahead window is scheduled on the AudioContext clock. Voices are short-lived native nodes.
 */
import type { Audio } from '@oyun/core';
import { notesAt, stepsBetween, type NoteEvent } from '../sim/music';

const LOOKAHEAD_S = 0.14;

export class Music {
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private scheduledY = 0;
  private running = false;
  theme = 0;
  intensity = 0;

  constructor(private readonly audio: Audio) {}

  private ensure(): AudioContext | null {
    const ctx = this.audio.context;
    const out = this.audio.musicOutput;
    if (!ctx || !out || ctx.state !== 'running') return null;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.55;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 18000;
      this.bus.connect(this.filter);
      this.filter.connect(out);
      const len = Math.floor(ctx.sampleRate * 0.3);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  /** Start (or restart) from height y. */
  start(y: number): void {
    this.running = true;
    this.scheduledY = y;
    const ctx = this.ensure();
    if (ctx && this.filter) this.filter.frequency.setTargetAtTime(18000, ctx.currentTime, 0.05);
  }

  stop(muffle = true): void {
    this.running = false;
    const ctx = this.audio.context;
    if (ctx && this.filter && muffle) this.filter.frequency.setTargetAtTime(300, ctx.currentTime, 0.04);
  }

  /** Muffle while a menu is up, open fully when playing. */
  setMuffled(m: boolean): void {
    const ctx = this.audio.context;
    if (ctx && this.filter) this.filter.frequency.setTargetAtTime(m ? 900 : 18000, ctx.currentTime, 0.08);
  }

  /** Output latency, so visuals can pulse in step with what is heard. */
  latency(): number {
    const ctx = this.audio.context;
    return ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
  }

  /** Schedule steps between the last scheduled height and y + speed·lookahead. */
  tick(y: number, speed: number, frameS: number): void {
    if (!this.running || speed <= 0) return;
    const ctx = this.ensure();
    if (!ctx) {
      this.scheduledY = Math.max(this.scheduledY, y);
      return;
    }
    const ahead = y + speed * Math.max(LOOKAHEAD_S, frameS * 1.5);
    if (this.scheduledY < y) this.scheduledY = y;
    if (ahead <= this.scheduledY) return;
    this.tCtx = ctx;
    this.tBase = ctx.currentTime;
    this.tFrom = this.scheduledY;
    this.tY = y;
    this.tSpeed = speed;
    stepsBetween(this.scheduledY, ahead, speed, this.onStep);
    this.scheduledY = ahead;
  }

  // Pre-bound callbacks: tick() allocates nothing.
  private tCtx: AudioContext | null = null;
  private tBase = 0;
  private tFrom = 0;
  private tY = 0;
  private tSpeed = 1;
  private tAt = 0;
  private readonly onNote = (e: NoteEvent): void => {
    if (this.tCtx) this.voice(this.tCtx, e, this.tAt);
  };
  private readonly onStep = (step: number, delay: number): void => {
    const at = this.tBase + delay + (this.tFrom - this.tY) / this.tSpeed;
    this.tAt = Math.max(this.tBase, at);
    notesAt(this.theme, step, this.intensity, this.onNote);
  };

  private voice(ctx: AudioContext, e: NoteEvent, t: number): void {
    const bus = this.bus;
    if (!bus) return;
    try {
      switch (e.inst) {
        case 'kick': {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(160, t);
          o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.9 * e.vel, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
          o.connect(g).connect(bus);
          o.start(t);
          o.stop(t + 0.28);
          break;
        }
        case 'hat':
        case 'clap': {
          const n = ctx.createBufferSource();
          n.buffer = this.noise;
          const f = ctx.createBiquadFilter();
          f.type = e.inst === 'hat' ? 'highpass' : 'bandpass';
          f.frequency.value = e.inst === 'hat' ? 7000 : 1500;
          const g = ctx.createGain();
          const len = e.inst === 'hat' ? 0.05 : 0.16;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime((e.inst === 'hat' ? 0.22 : 0.42) * e.vel, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          n.connect(f).connect(g).connect(bus);
          n.start(t);
          n.stop(t + len + 0.02);
          break;
        }
        case 'bass': {
          const o = ctx.createOscillator();
          const f = ctx.createBiquadFilter();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = 440 * 2 ** ((e.midi - 69) / 12);
          f.type = 'lowpass';
          f.frequency.setValueAtTime(1400, t);
          f.frequency.exponentialRampToValueAtTime(220, t + 0.16);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.32 * e.vel, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.connect(f).connect(g).connect(bus);
          o.start(t);
          o.stop(t + 0.22);
          break;
        }
        case 'arp': {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.value = 440 * 2 ** ((e.midi - 69) / 12);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.07 * e.vel, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
          o.connect(g).connect(bus);
          o.start(t);
          o.stop(t + 0.12);
          break;
        }
      }
    } catch {
      /* audio never breaks gameplay */
    }
  }
}
