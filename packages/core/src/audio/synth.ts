import type { StorageAdapter } from '../storage';
import { SFX_PRESETS, sliderToGain, type SfxName, type SfxPreset, type Voice } from './presets';

export type Bus = 'music' | 'sfx';

export interface PlayOptions {
  /** Semitone shift, e.g. +2 for a rising combo. */
  pitch?: number;
  /** 0..1 multiplier. */
  volume?: number;
  /** Random pitch jitter in semitones (cosmetic, uses Math.random). Default 0.4. */
  jitter?: number;
}

export interface Audio {
  /** False when WebAudio does not exist; every call is then a no-op. */
  readonly available: boolean;
  readonly muted: boolean;
  /** Create/resume the AudioContext. Must run inside a user gesture; createGame wires this. */
  unlock(): void;
  play(name: SfxName, opts?: PlayOptions): void;
  /** Play a custom preset (same data shape as SFX_PRESETS). */
  playPreset(preset: SfxPreset, opts?: PlayOptions): void;
  setMuted(muted: boolean): void;
  /** Returns the new muted state. */
  toggleMute(): boolean;
  /** Bus slider 0..1 (persisted). */
  volume(bus: Bus): number;
  setVolume(bus: Bus, slider: number): void;
  /** Suspend/resume the context (platform pause, ads). */
  suspend(): void;
  resume(): void;
  /** Music bus input for game-made music nodes; null until unlocked or without WebAudio. */
  readonly musicOutput: AudioNode | null;
  readonly context: AudioContext | null;
}

export interface AudioOptions {
  storage: StorageAdapter;
  /** Storage key for settings. Convention: `oyun:<game-id>:audio`. */
  key: string;
  /** Override for tests; return null for "no WebAudio". */
  createContext?: () => AudioContext | null;
  /** Max simultaneous voices; extra sounds are dropped. Default 16. */
  maxVoices?: number;
}

interface Settings {
  muted: boolean;
  music: number;
  sfx: number;
}

function readSettings(storage: StorageAdapter, key: string): Settings {
  const fallback: Settings = { muted: false, music: 1, sfx: 1 };
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      muted: typeof p.muted === 'boolean' ? p.muted : false,
      music: typeof p.music === 'number' ? p.music : 1,
      sfx: typeof p.sfx === 'number' ? p.sfx : 1,
    };
  } catch {
    return fallback;
  }
}

function defaultContext(): AudioContext | null {
  const w = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

/** WebAudio synth: master ← music, sfx buses. Context is created lazily on unlock(). */
export function createAudio(opts: AudioOptions): Audio {
  const settings = readSettings(opts.storage, opts.key);
  const createContext = opts.createContext ?? defaultContext;
  const maxVoices = opts.maxVoices ?? 16;
  // Real contexts are created lazily (unlock); until then "available" means "WebAudio exists".
  let available = opts.createContext ? true : typeof globalThis.AudioContext !== 'undefined';
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let buses: Record<Bus, GainNode> | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;
  let suspended = false;

  const persist = (): void => {
    try {
      opts.storage.setItem(opts.key, JSON.stringify(settings));
    } catch {
      /* settings are a convenience */
    }
  };

  const applyGains = (): void => {
    if (!ctx || !master || !buses) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.015);
    buses.music.gain.setTargetAtTime(sliderToGain(settings.music), now, 0.015);
    buses.sfx.gain.setTargetAtTime(sliderToGain(settings.sfx), now, 0.015);
  };

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    if (!available) return null;
    ctx = createContext();
    if (!ctx) {
      available = false;
      return null;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    buses = { music: ctx.createGain(), sfx: ctx.createGain() };
    buses.music.connect(master);
    buses.sfx.connect(master);
    master.gain.value = settings.muted ? 0 : 1;
    buses.music.gain.value = sliderToGain(settings.music);
    buses.sfx.gain.value = sliderToGain(settings.sfx);
    const len = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const playVoice = (c: AudioContext, out: AudioNode, v: Voice, rate: number, vol: number): void => {
    if (voices >= maxVoices) return;
    const start = c.currentTime + (v.delay ?? 0);
    const attack = v.attack ?? 0.005;
    const end = start + v.duration;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain * vol), start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out);
    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const n = c.createBufferSource();
      n.buffer = noise;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = v.freq;
      n.connect(lp);
      lp.connect(env);
      src = n;
    } else {
      const o = c.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.freq * rate, start);
      if (v.freqEnd !== undefined && v.freqEnd !== v.freq) {
        o.frequency.exponentialRampToValueAtTime(v.freqEnd * rate, end);
      }
      o.connect(env);
      src = o;
    }
    voices++;
    src.onended = () => {
      voices--;
      env.disconnect();
    };
    src.start(start);
    src.stop(end + 0.02);
  };

  const playPreset = (preset: SfxPreset, po: PlayOptions = {}): void => {
    if (settings.muted || suspended) return;
    const c = ctx;
    if (!c || !buses || c.state !== 'running') return;
    const jitter = po.jitter ?? 0.4;
    const semis = (po.pitch ?? 0) + (Math.random() * 2 - 1) * jitter;
    const rate = 2 ** (semis / 12);
    const vol = Math.min(1, Math.max(0, po.volume ?? 1));
    try {
      for (const v of preset) playVoice(c, buses.sfx, v, rate, vol);
    } catch {
      /* audio must never break gameplay */
    }
  };

  const setMuted = (m: boolean): void => {
    settings.muted = m;
    persist();
    applyGains();
  };

  return {
    get available() {
      return available;
    },
    get muted() {
      return settings.muted;
    },
    get musicOutput() {
      return buses?.music ?? null;
    },
    get context() {
      return ctx;
    },
    unlock() {
      const c = ensure();
      if (c && c.state !== 'running' && !suspended) void c.resume().catch(() => undefined);
    },
    play(name, po) {
      playPreset(SFX_PRESETS[name], po);
    },
    playPreset,
    setMuted,
    toggleMute() {
      setMuted(!settings.muted);
      return settings.muted;
    },
    volume(bus) {
      return settings[bus];
    },
    setVolume(bus, slider) {
      settings[bus] = Math.min(1, Math.max(0, slider));
      persist();
      applyGains();
    },
    suspend() {
      suspended = true;
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    },
    resume() {
      suspended = false;
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    },
  };
}
