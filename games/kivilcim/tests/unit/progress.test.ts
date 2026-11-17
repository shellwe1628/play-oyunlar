import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import {
  buySkin,
  defaults,
  endlessUnlocked,
  equipSkin,
  levelToPlay,
  recordDaily,
  recordEndless,
  recordLevelRun,
  shouldShowInterstitial,
  type SaveData,
} from '../../src/sim/progress';
import { SHAPES, TRAILS } from '../../src/sim/skins';

const fresh = (): SaveData => defaults();

describe('level progress', () => {
  it('starts with level 1 unlocked and nothing else', () => {
    const d = fresh();
    expect(d.unlocked).toBe(1);
    expect(levelToPlay(d)).toBe(1);
    expect(d.levels).toHaveLength(10);
    expect(d.gems).toBe(0);
  });

  it('keeps the best percentage and counts attempts', () => {
    const d = fresh();
    expect(recordLevelRun(d, 1, { percent: 40, gemMask: 0, finished: false }).newBest).toBe(true);
    expect(recordLevelRun(d, 1, { percent: 25, gemMask: 0, finished: false }).newBest).toBe(false);
    expect(recordLevelRun(d, 1, { percent: 40, gemMask: 0, finished: false }).newBest).toBe(false); // a tie is not a new best
    expect(d.levels[0]!.best).toBe(40);
    expect(d.levels[0]!.attempts).toBe(3);
  });

  it('finishing unlocks the next level, which becomes the level to play', () => {
    const d = fresh();
    const r = recordLevelRun(d, 1, { percent: 100, gemMask: 0b011, finished: true });
    expect(r.unlocked).toBe(2);
    expect(d.unlocked).toBe(2);
    expect(d.levels[0]!.done).toBe(true);
    expect(levelToPlay(d)).toBe(2);
  });

  it('gems are banked once each: re-collecting the same gem pays nothing', () => {
    const d = fresh();
    expect(recordLevelRun(d, 1, { percent: 50, gemMask: 0b001, finished: false }).gemsGained).toBe(1);
    expect(recordLevelRun(d, 1, { percent: 100, gemMask: 0b011, finished: true }).gemsGained).toBe(1);
    expect(recordLevelRun(d, 1, { percent: 100, gemMask: 0b111, finished: true }).gemsGained).toBe(1);
    expect(d.gems).toBe(3);
    expect(d.levels[0]!.gemMask).toBe(0b111);
  });

  it('never unlocks past level 10, and level 10 stays the level to play once all are done', () => {
    const d = fresh();
    for (let id = 1; id <= 10; id++) recordLevelRun(d, id, { percent: 100, gemMask: 0, finished: true });
    expect(d.unlocked).toBe(10);
    expect(levelToPlay(d)).toBe(10);
  });

  it('endless unlocks after level 3 is finished', () => {
    const d = fresh();
    for (let id = 1; id <= 2; id++) recordLevelRun(d, id, { percent: 100, gemMask: 0, finished: true });
    expect(endlessUnlocked(d)).toBe(false);
    recordLevelRun(d, 3, { percent: 100, gemMask: 0, finished: true });
    expect(endlessUnlocked(d)).toBe(true);
  });
});

describe('endless and daily records', () => {
  it('keeps the best endless height and banks endless gems', () => {
    const d = fresh();
    expect(recordEndless(d, 120, 2).newBest).toBe(true);
    expect(recordEndless(d, 80, 1).newBest).toBe(false);
    expect(d.endlessBest).toBe(120);
    expect(d.gems).toBe(3);
  });

  it('daily best resets on a new date; the streak counts consecutive days', () => {
    const d = fresh();
    expect(recordDaily(d, '2026-11-15', 50).streak).toBe(1);
    expect(recordDaily(d, '2026-11-15', 40).best).toBe(50);
    expect(recordDaily(d, '2026-11-16', 30)).toMatchObject({ best: 30, streak: 2 });
    expect(recordDaily(d, '2026-11-17', 10).streak).toBe(3);
    expect(recordDaily(d, '2026-11-19', 10).streak).toBe(1); // missed a day
  });

  it('daily gems pay once per gem per date, however often the shaft is retried', () => {
    const d = fresh();
    for (let k = 0; k < 5; k++) recordDaily(d, '2026-11-17', 10 + k, [0, 3]);
    expect(d.gems).toBe(2);
    expect(recordDaily(d, '2026-11-17', 5, [3, 4]).gemsGained).toBe(1);
    expect(d.gems).toBe(3);
    expect(recordDaily(d, '2026-11-18', 5, [0]).gemsGained).toBe(1); // a new day, a new shaft
  });

  it('a daily run never touches the endless record', () => {
    const d = fresh();
    recordDaily(d, '2026-11-17', 28, [1]);
    expect(d.endlessBest).toBe(0);
  });

  it('the streak survives month and year ends', () => {
    const d = fresh();
    recordDaily(d, '2026-12-31', 5);
    expect(recordDaily(d, '2027-01-01', 5).streak).toBe(2);
  });
});

describe('skins', () => {
  it('has eight shapes and eight trails; the first of each is free and equipped', () => {
    expect(SHAPES).toHaveLength(8);
    expect(TRAILS).toHaveLength(8);
    const d = fresh();
    expect(d.skin.shape).toBe(0);
    expect(d.skin.trail).toBe(0);
    expect(d.skin.ownedShapes & 1).toBe(1);
    expect(d.skin.ownedTrails & 1).toBe(1);
  });

  it('buying costs gems, needs enough of them, and equips the purchase', () => {
    const d = fresh();
    const price = SHAPES[1]!.price;
    expect(buySkin(d, 'shape', 1)).toBe('poor');
    d.gems = price + 2;
    expect(buySkin(d, 'shape', 1)).toBe('bought');
    expect(d.gems).toBe(2);
    expect(d.skin.shape).toBe(1);
    expect(buySkin(d, 'shape', 1)).toBe('owned');
    expect(d.gems).toBe(2);
  });

  it('only owned skins can be equipped', () => {
    const d = fresh();
    expect(equipSkin(d, 'trail', 3)).toBe(false);
    d.gems = 999;
    buySkin(d, 'trail', 3);
    equipSkin(d, 'trail', 0);
    expect(d.skin.trail).toBe(0);
    expect(equipSkin(d, 'trail', 3)).toBe(true);
    expect(d.skin.trail).toBe(3);
  });

  it('something is affordable after level 1 (three gems)', () => {
    expect(Math.min(...SHAPES.slice(1).map((x) => x.price), ...TRAILS.slice(1).map((x) => x.price))).toBeLessThanOrEqual(3);
  });

  it('prices rise: there is always something more to want', () => {
    for (const list of [SHAPES, TRAILS]) {
      for (let i = 2; i < list.length; i++) expect(list[i]!.price).toBeGreaterThan(list[i - 1]!.price);
    }
  });
});

describe('interstitial pacing', () => {
  it('at most once every three finished levels, never otherwise', () => {
    const shown = [1, 2, 3, 4, 5, 6, 7].map((n) => shouldShowInterstitial(n));
    expect(shown).toEqual([false, false, true, false, false, true, false]);
  });
});

describe('game save', () => {
  it('persists progress through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => void recordLevelRun(d, 1, { percent: 100, gemMask: 1, finished: true }));
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(b.data.unlocked).toBe(2);
    expect(b.data.gems).toBe(1);
  });

  it('migrates a template-era v1 save to fresh progress', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { best: 7, rounds: 3 } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('migrated');
    expect(s.data.unlocked).toBe(1);
    expect(SAVE_VERSION).toBe(2);
  });

  it('rejects a corrupt save and falls back to defaults', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: { unlocked: 'x' } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.unlocked).toBe(1);
  });

  it('clamps out-of-range values instead of trusting them', () => {
    const bad = { ...fresh(), unlocked: 40, gems: -5, skin: { shape: 99, trail: -1, ownedShapes: 1, ownedTrails: 1 } };
    bad.levels[0] = { best: 150, attempts: -2, gemMask: 255, done: true };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: bad }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.unlocked).toBe(10);
    expect(s.data.gems).toBe(0);
    expect(s.data.skin.shape).toBe(0);
    expect(s.data.skin.trail).toBe(0);
    expect(s.data.levels[0]).toEqual({ best: 100, attempts: 0, gemMask: 7, done: true });
  });

  it('fills fields missing from an older v2 save with defaults', () => {
    const d = fresh() as Partial<SaveData>;
    delete d.daily;
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: d }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.daily.streak).toBe(0);
  });
});
