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
