import { describe, expect, it } from 'vitest';
import { STEP_PX } from '../../src/sim/constants';
import { bpmFor, notesAt, stepsBetween, type NoteEvent } from '../../src/sim/music';

describe('beat tied to scroll speed', () => {
  it('one beat is always BEAT_PX of climb, so tempo follows speed', () => {
    expect(bpmFor(512)).toBeCloseTo(120, 6);
    expect(bpmFor(1024)).toBeCloseTo(240, 6);
  });

  it('lists the 16th steps between two heights with their delay from now', () => {
    const out: { step: number; delay: number }[] = [];
    stepsBetween(100, 100 + STEP_PX * 3, 500, (step, delay) => out.push({ step, delay }));
    expect(out.map((o) => o.step)).toEqual([2, 3, 4]);
    expect(out[0]!.delay).toBeCloseTo((128 - 100) / 500, 9);
  });

  it('never lists a step twice across consecutive windows', () => {
    const seen: number[] = [];
    let y = 0;
    for (let i = 0; i < 50; i++) {
      const next = y + 37.3;
      stepsBetween(y, next, 500, (s) => seen.push(s));
      y = next;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
});

describe('patterns', () => {
  const at = (step: number, intensity: number): NoteEvent[] => {
    const out: NoteEvent[] = [];
    notesAt(0, step, intensity, (e) => out.push({ ...e }));
    return out;
  };
  it('kick on every beat at any intensity', () => {
    for (const s of [0, 4, 8, 12, 16, 20]) expect(at(s, 0).some((e) => e.inst === 'kick'), `step ${s}`).toBe(true);
    expect(at(1, 0).some((e) => e.inst === 'kick')).toBe(false);
  });
  it('layers add with intensity: bass from 1, arp from 2, clap from 3', () => {
    const insts = (i: number): Set<string> => {
      const s = new Set<string>();
      for (let st = 0; st < 64; st++) for (const e of at(st, i)) s.add(e.inst);
      return s;
    };
    expect(insts(0).has('bass')).toBe(false);
    expect(insts(1).has('bass')).toBe(true);
    expect(insts(1).has('arp')).toBe(false);
    expect(insts(2).has('arp')).toBe(true);
    expect(insts(3).has('clap')).toBe(true);
  });
  it('is deterministic', () => {
    expect(at(37, 3)).toEqual(at(37, 3));
  });
});
