import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { DigSim } from '../../src/sim/dig';

const KEY = 'oyun:test:save';

describe('game save store', () => {
  it('persists the whole sim and restores it', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    const sim = new DigSim(4, a.data);
    for (let i = 0; i < 200; i++) sim.tap();
    a.update((d) => Object.assign(d, sim.toSave()));
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(b.status).toBe('loaded');
    expect(new DigSim(1, b.data).toSave()).toEqual(sim.toSave());
  });

  it('recovers from a corrupt primary through the backup', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => (d.dust = 10));
    a.update((d) => (d.dust = 20));
    storage.setItem(KEY, '{"v":1,"data":{"dust":');
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(b.status).toBe('recovered');
    expect(b.data.dust).toBe(10);
  });

  it('rejects data of the wrong shape', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ v: SAVE_VERSION, data: { dust: 'lots', counts: 3 } }) });
    expect(createSaveStore(saveOptions(storage, 'test')).status).toBe('reset');
  });

  it('never overwrites a save from a newer build', () => {
    const raw = JSON.stringify({ v: SAVE_VERSION + 1, data: { dust: 5 } });
    const storage = memoryStorage({ [KEY]: raw });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('newer');
    expect(s.update((d) => (d.dust = 1))).toBe(false);
    expect(storage.getItem(KEY)).toBe(raw);
  });
});
