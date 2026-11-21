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

describe('counted nouns', () => {
  it('pick the singular form for exactly 1 and the plural otherwise', async () => {
    const { countKey } = await import('../../src/sim/format');
    expect(countKey('n.taps', 1)).toBe('n.taps.one');
    expect(countKey('n.taps', 0)).toBe('n.taps');
    expect(countKey('n.taps', 2)).toBe('n.taps');
    expect(countKey('n.taps', 1.4)).toBe('n.taps');
  });

  it('every counted noun has a real English singular and both languages carry {n}', () => {
    const en = STRINGS.en as Record<string, string>;
    const tr = STRINGS.tr as Record<string, string>;
    const expected: Record<string, [string, string]> = {
      'n.taps': ['2 taps', '1 tap'],
      'n.blocks': ['2 blocks', '1 block'],
      'n.fossils': ['2 fossils', '1 fossil'],
      'n.finds': ['2 finds', '1 find'],
    };
    for (const [key, [plural, single]] of Object.entries(expected)) {
      expect(en[key]?.replace('{n}', '2')).toBe(plural);
      expect(en[`${key}.one`]?.replace('{n}', '1')).toBe(single);
      expect(tr[key]).toContain('{n}');
      expect(tr[`${key}.one`]).toContain('{n}');
    }
    // no sentence may hard-code a plural noun after a number placeholder
    for (const [key, text] of Object.entries(en)) if (!key.startsWith('n.')) expect(text, key).not.toMatch(/\{\w+\} (taps|blocks|fossils|finds)\b/);
  });
});
