import { describe, expect, it } from 'vitest';
import { SFX_PRESETS, presetDuration, sliderToGain } from '../src/audio/presets';
import { createAudio } from '../src/audio/synth';
import { memoryStorage } from '../src/storage';

describe('sfx presets', () => {
  it('include the five design-doc sounds plus UI pop', () => {
    for (const name of ['tap', 'coin', 'hit', 'win', 'lose', 'pop'] as const) {
      expect(SFX_PRESETS[name]).toBeDefined();
    }
  });
  it('are short and within safe ranges', () => {
    for (const [name, preset] of Object.entries(SFX_PRESETS)) {
      expect(preset.length, name).toBeGreaterThan(0);
      expect(presetDuration(preset), name).toBeLessThanOrEqual(1.6);
      for (const v of preset) {
        expect(v.duration, name).toBeGreaterThan(0);
        expect(v.gain, name).toBeGreaterThan(0);
        expect(v.gain, name).toBeLessThanOrEqual(0.6); // headroom when several overlap
        if (v.wave !== 'noise') {
          expect(v.freq, name).toBeGreaterThanOrEqual(40);
          expect(v.freq, name).toBeLessThanOrEqual(8000);
        }
      }
    }
  });
});

describe('sliderToGain', () => {
  it('squares the slider and clamps', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(0.5)).toBe(0.25);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(2)).toBe(1);
    expect(sliderToGain(-1)).toBe(0);
  });
});

describe('audio without WebAudio (node, old browsers)', () => {
  it('plays nothing and never throws', () => {
    const audio = createAudio({ storage: memoryStorage(), key: 'k', createContext: () => null });
    expect(() => audio.play('tap')).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    expect(audio.available).toBe(false);
  });

  it('persists mute across instances', () => {
    const storage = memoryStorage();
    const a = createAudio({ storage, key: 'oyun:x:audio', createContext: () => null });
    expect(a.muted).toBe(false);
    a.setMuted(true);
    const b = createAudio({ storage, key: 'oyun:x:audio', createContext: () => null });
    expect(b.muted).toBe(true);
    expect(b.toggleMute()).toBe(false);
    expect(createAudio({ storage, key: 'oyun:x:audio', createContext: () => null }).muted).toBe(false);
  });

  it('persists bus volumes and ignores corrupt settings', () => {
    const storage = memoryStorage({ 'oyun:x:audio': '{oops' });
    const a = createAudio({ storage, key: 'oyun:x:audio', createContext: () => null });
    expect(a.muted).toBe(false);
    a.setVolume('music', 0.3);
    const b = createAudio({ storage, key: 'oyun:x:audio', createContext: () => null });
    expect(b.volume('music')).toBe(0.3);
    expect(b.volume('sfx')).toBe(1);
  });
});
