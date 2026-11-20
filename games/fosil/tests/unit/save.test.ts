import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { LAYERS } from '../../src/sim/data';
import { DigSim, NEWS_TIP, type DigSave } from '../../src/sim/dig';

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
    expect(s.broken).toHaveLength(LAYERS.length);
    expect(s.stats).toEqual({ ...v1.stats, cores: 0, echoes: 0 });
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
    const sim = new DigSim(1, v1 as unknown as Partial<DigSave>);
    expect(sim.discovered('deepsea-01')).toBe(true);
    expect(sim.toSave().broken).toHaveLength(LAYERS.length);
  });
});

describe('save migration v2 → v3 (three new layers)', () => {
  // A late v2 player: First Seas reached, one expedition behind them, mid-way through a boss.
  const firstSeas = LAYERS.findIndex((l) => l.id === 'firstseas');
  const v2 = (() => {
    const sim = new DigSim(7);
    const d = sim.toSave() as unknown as Record<string, unknown>;
    return {
      ...d,
      counts: { 'topsoil-01': [3, 2, 1, 4], 'firstseas-12': [1, 0, 0, 0], 'magma-05': [0, 1, 0, 0] },
      discovered: ['topsoil-01', 'firstseas-12', 'magma-05', 'deepsea-12'],
      best: { 'topsoil-01': 3, 'firstseas-12': 0, 'magma-05': 1, 'deepsea-12': 2 },
      dust: 4.2e11,
      levels: { pick: 70, luck: 11, assistant: 22, offline: 5 },
      layer: firstSeas,
      unlocked: firstSeas,
      deepest: firstSeas,
      broken: [10, 20, 30, 40, 50, 60, 70, 80, 90, 39],
      block: { kind: 'boss', timer: -1 },
      damage: 1234,
      fragments: 10,
      expedition: { count: 1, runStart: 9000, best: 12000 },
      quests: ['finds-10', 'depth-10', 'expeditions-1'],
      golds: 3,
      stats: { taps: 50_000, rolls: 9_000, bestOdds: 1_000_000, bestId: 'firstseas-12', playSeconds: 30_000 },
      tips: ['odds', 'boss', 'expedition'],
      records: { rare: [{ id: 'firstseas-12', odds: 1_000_000, at: 1_700_000_000_000 }], sets: { '0': 200 }, layerStart: [0, 60, 300, 900, 1500, 2400, 3300, 4200, 5100, 6300] },
    };
  })();

  it('keeps every bit of progress, grows the per-layer arrays and announces the new layers', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ v: 2, data: v2 }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    expect(store.status).toBe('migrated');
    const sim = new DigSim(1, store.data);
    const s = sim.toSave();
    expect(s.counts).toEqual(v2.counts);
    expect([...s.discovered].sort()).toEqual([...v2.discovered].sort());
    expect(s.best).toEqual(v2.best);
    expect(s.dust).toBe(v2.dust);
    expect(s.levels).toEqual(v2.levels);
    expect(s.layer).toBe(firstSeas);
    expect(s.unlocked).toBe(firstSeas);
    expect(s.deepest).toBe(firstSeas);
    expect(s.broken).toHaveLength(LAYERS.length);
    expect(s.broken.slice(0, 10)).toEqual(v2.broken);
    expect(s.broken.slice(10)).toEqual([0, 0, 0]);
    expect(s.block.kind).toBe('boss');
    expect(s.damage).toBe(1234);
    expect(s.fragments).toBe(10);
    expect(s.expedition).toEqual(v2.expedition);
    expect(s.quests).toEqual(v2.quests);
    expect(s.golds).toBe(3);
    expect(s.stats).toEqual({ ...v2.stats, cores: 0, echoes: 0 });
    expect(s.records.rare).toEqual(v2.records.rare);
    expect(s.records.layerStart).toEqual(v2.records.layerStart);
    // the news tip is still to come, everything else they had seen stays seen
    expect(s.tips).toEqual(v2.tips);
    expect(sim.tipSeen(NEWS_TIP)).toBe(false);
    expect(sim.score.total).toBeGreaterThan(0);
  });

  it('the new layers are the next goal: locked until their power, expedition moves to the Time Rift', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ v: 2, data: v2 }) });
    const sim = new DigSim(1, createSaveStore(saveOptions(storage, 'test')).data);
    expect(sim.unlocked).toBe(firstSeas);
    expect(sim.digPower).toBeLessThan(sim.unlockPowerOf(firstSeas + 1));
    expect(sim.canExpedition).toBe(false);
  });

  it('a brand-new dig never gets the news tip', () => {
    expect(new DigSim(3).tipSeen(NEWS_TIP)).toBe(true);
  });
});
