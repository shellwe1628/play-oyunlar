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

describe('save migration v1 → v2', () => {
  // A real v1 save as the previous build wrote it: four layers, deep sea open, a gold fossil.
  const v1 = {
    counts: { 'topsoil-01': [2, 1, 0, 1], 'topsoil-12': [1, 0, 0, 0], 'iceage-03': [0, 2, 0, 0], 'deepsea-01': [1, 0, 0, 0] },
    dust: 12345,
    levels: { pick: 20, luck: 5, assistant: 10, offline: 2 },
    layer: 3,
    unlocked: 3,
    broken: [120, 80, 40, 5],
    damage: 3,
    combo: 0.5,
    idle: 0,
    glintIn: 12,
    glint: null,
    boost: 0,
    assistantAcc: 0.2,
    rng: 123456,
    sets: [0],
    stats: { taps: 900, rolls: 250, bestOdds: 1200, bestId: 'topsoil-12', playSeconds: 1800 },
    tips: ['odds', 'combo'],
    lastFind: null,
    lastSeen: 1_700_000_000_000,
  };

  it('keeps everything an existing player had and fills the new systems', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ v: 1, data: v1 }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    expect(store.status).toBe('migrated');
    const sim = new DigSim(1, store.data);
    const s = sim.toSave();
    expect(s.counts).toEqual(v1.counts);
    expect(s.dust).toBe(12345);
    expect(s.levels).toEqual(v1.levels);
    expect(s.layer).toBe(3);
    expect(s.unlocked).toBe(3);
    expect(s.broken.slice(0, 4)).toEqual([120, 80, 40, 5]);
    expect(s.broken).toHaveLength(10);
    expect(s.stats).toEqual(v1.stats);
    expect(s.tips).toEqual(v1.tips);
    expect(s.lastSeen).toBe(v1.lastSeen);
    expect(s.rng).toBe(123456);
    // new: the museum is the old collection, best grades and the rarest find become records
    expect([...s.discovered].sort()).toEqual(Object.keys(v1.counts).sort());
    expect(s.best['topsoil-01']).toBe(3);
    expect(s.best['iceage-03']).toBe(1);
    expect(s.deepest).toBe(3);
    expect(s.records.rare[0]).toEqual({ id: 'topsoil-12', odds: 1200, at: 0 });
    expect(s.expedition.count).toBe(0);
    expect(sim.score.total).toBeGreaterThan(0);
  });

  it('a v1 save that sanitizes without the migration step loses nothing either', () => {
    const sim = new DigSim(1, v1);
    expect(sim.discovered('deepsea-01')).toBe(true);
    expect(sim.toSave().broken).toHaveLength(10);
  });
});
