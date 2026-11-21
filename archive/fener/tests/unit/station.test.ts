import { describe, expect, it } from 'vitest';
import { logbookKeys, STATION, VIEW } from '../../src/sim/station';

describe('station data', () => {
  it('has four distinct cameras with 10–14 objects each', () => {
    expect(STATION.map((c) => c.style)).toEqual(['lamp', 'stairs', 'dock', 'kitchen']);
    for (const cam of STATION) {
      expect(cam.objects.length, cam.id).toBeGreaterThanOrEqual(10);
      expect(cam.objects.length, cam.id).toBeLessThanOrEqual(14);
    }
  });
  it('ids are unique per camera, objects fit inside the view, every object supports a type', () => {
    for (const cam of STATION) {
      const ids = [...cam.objects.map((o) => o.id), ...cam.intruders.map((s) => s.id)];
      expect(new Set(ids).size, cam.id).toBe(ids.length);
      for (const o of [...cam.objects, ...cam.intruders]) {
        expect(o.x - o.w / 2, `${cam.id}/${o.id}`).toBeGreaterThanOrEqual(0);
        expect(o.x + o.w / 2, `${cam.id}/${o.id}`).toBeLessThanOrEqual(VIEW);
        expect(o.y - o.h / 2, `${cam.id}/${o.id}`).toBeGreaterThanOrEqual(0);
        expect(o.y + o.h / 2, `${cam.id}/${o.id}`).toBeLessThanOrEqual(VIEW);
      }
      for (const o of cam.objects) expect(o.types.length, o.id).toBeGreaterThan(0);
    }
  });
  it("'state' objects declare their initial state", () => {
    for (const cam of STATION) for (const o of cam.objects) if (o.types.includes('state')) expect(o.on, o.id).toBeTypeOf('boolean');
  });
  it('logbook keys are unique and cover objects and intruder spots', () => {
    const keys = logbookKeys();
    expect(new Set(keys).size).toBe(keys.length);
    const n = STATION.reduce((s, c) => s + c.objects.reduce((t, o) => t + o.types.length, 0) + c.intruders.length, 0);
    expect(keys).toHaveLength(n);
  });
});
