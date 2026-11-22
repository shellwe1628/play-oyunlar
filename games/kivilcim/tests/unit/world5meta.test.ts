import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { LEVEL_COUNT, WORLD_COUNT } from '../../src/sim/levels';
import { ACHIEVEMENTS, progressScore, RANKS, rankOf, scoreParts, settle, STAR_FINISH, STAR_GEMS, totalStars, WORLD_CLEAR_GEMS, WORLD_STAR_REQ } from '../../src/sim/meta';
import { defaults, endlessUnlocked, levelOpen, levelToPlay, recordDive, recordEndless, recordLevelRun, worldUnlocked, type SaveData } from '../../src/sim/progress';
import { TRAILS } from '../../src/sim/skins';

/**
 * A save exactly as the 40-level build (before world 5 and Dive mode) wrote it: version 3, forty
 * level records, no dive fields, `unlocked` stuck at 40 because there was no level 41 to reach.
 * Kept as text: this is what is sitting in players' storage.
 */
const OLD_SAVE = [
  '{"v":3,"data":{"unlocked":40,"levels":[{"best":100,"attempts":4,"gemMask":7,"done":true,"stars":7,"bestDate":"2026-11-01"},{"best":100,"attempts":11,"',
  'gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-02"},{"best":100,"attempts":18,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-03"},{"best"',
  ':100,"attempts":25,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-04"},{"best":100,"attempts":9,"gemMask":7,"done":true,"stars":7,"bestDate":"2',
  '026-11-05"},{"best":100,"attempts":16,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-06"},{"best":100,"attempts":23,"gemMask":7,"done":true,"st',
  'ars":3,"bestDate":"2026-11-07"},{"best":100,"attempts":7,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-08"},{"best":100,"attempts":14,"gemMask',
  '":7,"done":true,"stars":7,"bestDate":"2026-11-09"},{"best":100,"attempts":21,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-10"},{"best":100,"a',
  'ttempts":5,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-11"},{"best":100,"attempts":12,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-',
  '12"},{"best":100,"attempts":19,"gemMask":7,"done":true,"stars":7,"bestDate":"2026-11-13"},{"best":100,"attempts":26,"gemMask":7,"done":true,"stars":3,',
  '"bestDate":"2026-11-14"},{"best":100,"attempts":10,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-15"},{"best":100,"attempts":17,"gemMask":7,"d',
  'one":true,"stars":3,"bestDate":"2026-11-16"},{"best":100,"attempts":24,"gemMask":7,"done":true,"stars":7,"bestDate":"2026-11-17"},{"best":100,"attempt',
  's":8,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-18"},{"best":100,"attempts":15,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-19"},{',
  '"best":100,"attempts":22,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-20"},{"best":100,"attempts":6,"gemMask":7,"done":true,"stars":7,"bestDa',
  'te":"2026-11-01"},{"best":100,"attempts":13,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-02"},{"best":100,"attempts":20,"gemMask":7,"done":tr',
  'ue,"stars":3,"bestDate":"2026-11-03"},{"best":100,"attempts":4,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-04"},{"best":100,"attempts":11,"g',
  'emMask":7,"done":true,"stars":7,"bestDate":"2026-11-05"},{"best":100,"attempts":18,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-06"},{"best":',
  '100,"attempts":25,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-07"},{"best":100,"attempts":9,"gemMask":7,"done":true,"stars":3,"bestDate":"20',
  '26-11-08"},{"best":100,"attempts":16,"gemMask":7,"done":true,"stars":7,"bestDate":"2026-11-09"},{"best":100,"attempts":23,"gemMask":7,"done":true,"sta',
  'rs":3,"bestDate":"2026-11-10"},{"best":100,"attempts":61,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-20"},{"best":100,"attempts":62,"gemMask',
  '":3,"done":true,"stars":1,"bestDate":"2026-11-20"},{"best":100,"attempts":63,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11-20"},{"best":100,"a',
  'ttempts":64,"gemMask":3,"done":true,"stars":1,"bestDate":"2026-11-20"},{"best":100,"attempts":65,"gemMask":7,"done":true,"stars":3,"bestDate":"2026-11',
  '-20"},{"best":100,"attempts":66,"gemMask":3,"done":true,"stars":1,"bestDate":"2026-11-20"},{"best":100,"attempts":67,"gemMask":7,"done":true,"stars":3',
  ',"bestDate":"2026-11-20"},{"best":100,"attempts":68,"gemMask":3,"done":true,"stars":1,"bestDate":"2026-11-20"},{"best":100,"attempts":88,"gemMask":5,"',
  'done":true,"stars":1,"bestDate":"2026-11-21"},{"best":100,"attempts":143,"gemMask":1,"done":true,"stars":1,"bestDate":"2026-11-21"}],"gems":73,"skin":',
  '{"shape":3,"trail":21,"ownedShapes":11,"ownedTrails":2097455},"endlessBest":1642,"endlessDate":"2026-11-18","daily":{"date":"2026-11-21","best":388,"s',
  'treak":5,"lastDate":"2026-11-21","gems":[0,2,5],"bestStreak":9,"days":14,"paid":"2026-11-21","history":[{"date":"2026-11-20","best":301},{"date":"2026',
  '-11-21","best":388}]},"finishes":61,"played":true,"tutorial":true,"achievements":89983,"rankSeen":7,"cues":255,"stats":{"attempts":1904,"bestEdge":7,"',
  'bestFlow":5}}}',
].join('');

const old = (): { v: number; data: Record<string, unknown> & { levels: Record<string, unknown>[] } } => JSON.parse(OLD_SAVE) as never;
const load = (text = OLD_SAVE): ReturnType<typeof createSaveStore<SaveData>> => createSaveStore(saveOptions(memoryStorage({ 'oyun:test:save': text }), 'test'));

describe('a save from before world 5 loads with nothing lost', () => {
  it('is read as it is (same version, no reset), and grows to fifty levels', () => {
    const s = load();
    expect(SAVE_VERSION).toBe(3);
    expect(s.status).toBe('loaded');
    expect(old().data.levels).toHaveLength(40);
    expect(s.data.levels).toHaveLength(50);
    expect(LEVEL_COUNT).toBe(50);
    expect(WORLD_COUNT).toBe(5);
  });

  it('keeps every level record of worlds 1-4 exactly; the ten new ones are blank', () => {
    const d = load().data;
    const before = old().data.levels;
    for (let i = 0; i < 40; i++) expect(d.levels[i], `level ${i + 1}`).toEqual(before[i]);
    for (let i = 40; i < 50; i++) expect(d.levels[i], `level ${i + 1}`).toEqual({ best: 0, attempts: 0, gemMask: 0, done: false, stars: 0, bestDate: '' });
  });

  it('keeps the wallet, skins, records, the daily streak, feats, rank and cues', () => {
    const d = load().data;
    const o = old().data;
    expect(d.gems).toBe(73);
    expect(d.skin).toEqual(o.skin);
    expect(d.skin.trail).toBe(21); // the world 4 trail is still worn
    expect([d.endlessBest, d.endlessDate]).toEqual([1642, '2026-11-18']);
    expect(d.daily).toEqual(o.daily);
    expect([d.finishes, d.played, d.tutorial, d.achievements, d.rankSeen, d.cues]).toEqual([61, true, true, o.achievements, 7, 255]);
    expect(d.stats).toEqual(o.stats);
    expect(totalStars(d)).toBe(82);
  });

  it('gains the new fields at their defaults', () => {
    const d = load().data;
    expect([d.diveBest, d.diveDate]).toEqual([0, '']);
  });

  it('level 40 was already beaten: level 41 is reached without beating the boss again', () => {
    const d = load().data;
    expect(old().data.unlocked).toBe(40);
    expect(d.levels[39]!.done).toBe(true);
    expect(d.unlocked).toBe(41);
    // World 5 still asks for its stars: this save has 82, the gate is 80.
    expect(totalStars(d)).toBeGreaterThanOrEqual(80);
    expect(worldUnlocked(d, 5)).toBe(true);
    expect(levelToPlay(d)).toBe(41);
  });

  it('settling and saving again changes nothing a player had (gems only ever go up)', () => {
    const storage = memoryStorage({ 'oyun:test:save': OLD_SAVE });
    const store = createSaveStore(saveOptions(storage, 'test'));
    let gained = -1;
    store.update((d) => void (gained = settle(d).gems));
    expect(gained).toBeGreaterThanOrEqual(0);
    const again = createSaveStore(saveOptions(storage, 'test'));
    expect(again.status).toBe('loaded');
    expect(again.data.gems).toBe(73 + gained);
    expect(again.data.levels.slice(0, 40)).toEqual(old().data.levels);
    expect(again.data.achievements & (old().data.achievements as number)).toBe(old().data.achievements);
    expect(again.data.skin.ownedTrails & (1 << 21)).not.toBe(0);
    expect(again.data.levels).toHaveLength(50);
  });

  it('level 40 reached but not beaten: nothing moves, and world 5 stays locked', () => {
    const o = old();
    // The same save one boss earlier: level 40 tried 143 times, best 87 %.
    o.data.levels[39] = { best: 87, attempts: 143, gemMask: 1, done: false, stars: 0, bestDate: '2026-11-21' };
    const d = load(JSON.stringify(o)).data;
    expect(d.unlocked).toBe(40);
    expect(d.levels[39]).toEqual({ best: 87, attempts: 143, gemMask: 1, done: false, stars: 0, bestDate: '2026-11-21' });
    expect(totalStars(d)).toBe(81); // enough stars, but the boss still stands
    expect(worldUnlocked(d, 5)).toBe(false);
    expect(levelOpen(d, 41)).toBe(false);
    expect(levelToPlay(d)).toBe(40);
    expect(d.levels.slice(40).every((l) => !l.done && l.attempts === 0 && l.stars === 0)).toBe(true);
  });

  it('level 40 beaten with fewer than 80 stars: level 41 is reached but world 5 stays locked until the stars are there', () => {
    const o = old();
    // The same save with fewer stars: two on levels 1-18, one on levels 19-30 (62 in all with world 4's).
    for (let i = 0; i < 30; i++) o.data.levels[i] = { ...o.data.levels[i], stars: i < 18 ? 3 : 1 };
    const d = load(JSON.stringify(o)).data;
    const stars = totalStars(d);
    expect(stars).toBe(18 * 2 + 12 + 14);
    expect(stars).toBeGreaterThanOrEqual(60); // world 4 is open
    expect(stars).toBeLessThan(80); // world 5 is not
    expect(d.levels[39]!.done).toBe(true);
    expect(d.unlocked).toBe(41);
    expect(worldUnlocked(d, 5)).toBe(false);
    expect(levelOpen(d, 41)).toBe(false);
    expect(levelToPlay(d)).toBe(40);
    // Earning the missing stars on old levels opens it, with no boss to beat again.
    let id = 19;
    while (totalStars(d) < 80) recordLevelRun(d, id++, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 });
    expect(worldUnlocked(d, 5)).toBe(true);
    expect(levelToPlay(d)).toBe(41);
  });

  it('a save that had not reached level 40 is not pushed forward', () => {
    const o = old();
    o.data.unlocked = 23;
    for (let i = 22; i < 40; i++) o.data.levels[i] = { best: i === 22 ? 71 : 0, attempts: i === 22 ? 9 : 0, gemMask: 0, done: false, stars: 0, bestDate: '' };
    const d = load(JSON.stringify(o)).data;
    expect(d.unlocked).toBe(23);
    expect(d.levels[22]!.best).toBe(71);
  });
});

describe('world 5 on the ladder', () => {
  const twoStars = (upTo: number): SaveData => {
    const d = defaults();
    // Finish + all gems, with a near miss: exactly two stars a level.
    for (let id = 1; id <= upTo; id++) recordLevelRun(d, id, { percent: 100, gemMask: 7, finished: true, nearMisses: 2 });
    return d;
  };

  it('the star gates continue: 15, 36, 60, then 80 for world 5; clear bonuses 20 to 60', () => {
    expect([...WORLD_STAR_REQ]).toEqual([0, 15, 36, 60, 80]);
    expect([...WORLD_CLEAR_GEMS]).toEqual([20, 30, 40, 50, 60]);
    for (let w = 2; w <= WORLD_COUNT; w++) {
      expect(WORLD_STAR_REQ[w - 1]!).toBeGreaterThan(WORLD_STAR_REQ[w - 2]!);
      // Two stars on every level played so far always opens the next world.
      expect(WORLD_STAR_REQ[w - 1]!).toBeLessThanOrEqual(2 * 10 * (w - 1));
    }
  });

  it('a player with two stars per level opens world 5 by beating level 40', () => {
    const d = twoStars(39);
    expect(totalStars(d)).toBe(78);
    expect(worldUnlocked(d, 5)).toBe(false);
    recordLevelRun(d, 40, { percent: 100, gemMask: 7, finished: true, nearMisses: 2 });
    expect(totalStars(d)).toBe(80);
    expect(d.unlocked).toBe(41);
    expect(worldUnlocked(d, 5)).toBe(true);
    expect(levelOpen(d, 41)).toBe(true);
    expect(levelToPlay(d)).toBe(41);
  });

  it('with fewer stars level 41 waits for them (beating the boss alone is not enough)', () => {
    const d = defaults();
    for (let id = 1; id <= 40; id++) recordLevelRun(d, id, { percent: 100, gemMask: 0, finished: true, nearMisses: 1 });
    expect(totalStars(d)).toBe(40);
    expect(d.unlocked).toBe(41);
    expect(levelOpen(d, 41)).toBe(false);
    // Forty stars open world 3 (36) but not world 4 (60): the level to play is back at 30.
    expect(levelToPlay(d)).toBe(30);
  });

  it('never unlocks past level 50; the last boss pays its world clear once', () => {
    const d = twoStars(49);
    expect(recordLevelRun(d, 50, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 }).worldGems).toBe(60);
    expect(recordLevelRun(d, 50, { percent: 100, gemMask: 7, finished: true, nearMisses: 0 }).worldGems).toBe(0);
    expect(d.unlocked).toBe(50);
    expect(d.levels[49]!.stars).toBe(7);
    expect(d.levels[49]!.stars & (STAR_FINISH | STAR_GEMS)).toBe(STAR_FINISH | STAR_GEMS);
  });

  it('beating level 50 is a feat and earns the Maelstrom trail; older feats and trails keep their slots', () => {
    expect(ACHIEVEMENTS.slice(0, 20).map((a) => a.id)).toEqual([
      'first', 'world1', 'world2', 'world3', 'world4', 'stars30', 'stars60', 'stars100', 'clean5', 'gems1',
      'endless500', 'endless1500', 'endless3000', 'daily3', 'daily7', 'edge5', 'flow', 'collector', 'blaze', 'stubborn',
    ]);
    expect(ACHIEVEMENTS.slice(20).map((a) => a.id)).toEqual(['world5', 'dive500', 'dive1500']);
    expect(TRAILS.slice(18, 22).map((t) => t.id)).toEqual(['champion', 'devotion', 'flawless', 'voidwalker']);
    expect(TRAILS[22]).toMatchObject({ id: 'maelstrom', tier: 'earned', price: 0, unlock: { achievement: 'world5' } });
    expect(TRAILS).toHaveLength(23);
    const d = twoStars(49);
    settle(d);
    expect(d.skin.ownedTrails & (1 << 22)).toBe(0);
    recordLevelRun(d, 50, { percent: 100, gemMask: 0, finished: true, nearMisses: 3 });
    const g = settle(d);
    expect(g.achievements).toContain(20);
    expect(g.trails).toContain(22);
    expect(d.skin.ownedTrails & (1 << 22)).not.toBe(0);
  });

  it('rank thresholds did not move', () => {
    expect(RANKS.map((r) => r.min)).toEqual([0, 60, 150, 280, 450, 650, 900, 1200, 1550, 1950, 2400, 2900]);
  });
});

describe('Dive mode records', () => {
  it('keeps its own best height and date, apart from Endless', () => {
    const d = defaults();
    expect(recordDive(d, 312, 0, '2026-11-22')).toMatchObject({ newBest: true, prevBest: 0 });
    expect(recordDive(d, 250, 0, '2026-11-23').newBest).toBe(false);
    expect([d.diveBest, d.diveDate]).toEqual([312, '2026-11-22']);
    expect(d.endlessBest).toBe(0);
    recordEndless(d, 900, 0, '2026-11-23');
    expect([d.diveBest, d.endlessBest]).toEqual([312, 900]);
    expect(recordDive(d, 312, 0).newBest).toBe(false); // a tie is not a new best
  });

  it('pays like Endless: gems taken, plus one per 250 m, and counts as an attempt', () => {
    const d = defaults();
    const r = recordDive(d, 780, 4, '2026-11-22');
    expect(r.milestoneGems).toBe(3);
    expect(d.gems).toBe(4 + 3);
    expect(d.stats.attempts).toBe(1);
    const e = defaults();
    expect(recordEndless(e, 780, 4, '2026-11-22').milestoneGems).toBe(r.milestoneGems);
    expect(e.gems).toBe(d.gems);
  });

  it('unlocks with Endless (after level 3)', () => {
    const d = defaults();
    expect(endlessUnlocked(d)).toBe(false);
    for (let id = 1; id <= 3; id++) recordLevelRun(d, id, { percent: 100, gemMask: 0, finished: true });
    expect(endlessUnlocked(d)).toBe(true);
  });

  it('has two feats, and counts toward the score beside the endless best (capped)', () => {
    const d = defaults();
    recordDive(d, 520, 0);
    let g = settle(d);
    expect(g.achievements).toEqual([ACHIEVEMENTS.findIndex((a) => a.id === 'dive500')]);
    recordDive(d, 1500, 0);
    g = settle(d);
    expect(g.achievements).toEqual([ACHIEVEMENTS.findIndex((a) => a.id === 'dive1500')]);
    expect(scoreParts(d).endless).toBe(150);
    recordEndless(d, 730, 0);
    expect(scoreParts(d).endless).toBe(73 + 150);
    recordDive(d, 9000, 0);
    recordEndless(d, 9000, 0);
    expect(scoreParts(d).endless).toBe(400 + 200);
    expect(rankOf(progressScore(d))).toBeGreaterThan(0);
  });

  it('survives a save and a reload', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => void recordDive(d, 444, 1, '2026-11-22'));
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect([b.data.diveBest, b.data.diveDate, b.data.gems]).toEqual([444, '2026-11-22', 2]);
  });
});
