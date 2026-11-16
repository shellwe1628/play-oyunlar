import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../src/strings';

describe('strings', () => {
  it('every key has a non-empty Turkish and English text', () => {
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(STRINGS.en[key].trim(), key).not.toBe('');
      expect(STRINGS.tr[key].trim(), key).not.toBe('');
    }
  });
  it('tr and en use the same {placeholders}', () => {
    const ph = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(ph(STRINGS.tr[key]), key).toEqual(ph(STRINGS.en[key]));
    }
  });
});

describe('content strings', () => {
  it('names every fossil, layer, tier and grade in both languages, with unique fossil names', async () => {
    const { FOSSILS, LAYERS, TIERS, GRADE_COUNT } = await import('../../src/sim/data');
    const en = STRINGS.en as Record<string, string>;
    const tr = STRINGS.tr as Record<string, string>;
    const keys = [
      ...FOSSILS.map((f) => `fossil.${f.id}`),
      ...LAYERS.map((l) => `layer.${l.id}`),
      ...TIERS.map((t) => `tier.${t.id}`),
      ...Array.from({ length: GRADE_COUNT }, (_, g) => `grade.${g}`),
    ];
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(tr[k], k).toBeTruthy();
    }
    for (const table of [en, tr]) {
      const names = FOSSILS.map((f) => table[`fossil.${f.id}`]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
