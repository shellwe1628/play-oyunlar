import { describe, expect, it } from 'vitest';
import { ANOMALY_TYPES, STATION } from '../../src/sim/station';
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
  it('every camera, object and anomaly type has a name', () => {
    const keys = new Set(Object.keys(STRINGS.en));
    for (const cam of STATION) {
      expect(keys.has(`cam.${cam.id}`), cam.id).toBe(true);
      for (const o of cam.objects) expect(keys.has(`obj.${cam.id}.${o.id}`), `${cam.id}.${o.id}`).toBe(true);
    }
    for (const t of ANOMALY_TYPES) expect(keys.has(`type.${t}`), t).toBe(true);
  });
});
