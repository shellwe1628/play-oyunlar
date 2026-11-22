/**
 * Guards of the modes (sim/modes.ts, world.ts) that each stop one specific leak: every test here
 * fails if its guard is taken out.
 */
import { describe, expect, it } from 'vitest';
import { freshSave, newBank, NO_META, type MetaLevels } from '../../src/sim/meta';
import { allowedMode, finishMode, MODE_CHESTS_PER_DAY, modeChestsLeft, MODES, RUSH_BOSSES } from '../../src/sim/modes';
import { solveShot } from '../../src/sim/aimbot';
import { blitzHp } from '../../src/sim/modes';
import { DAY_SKEW_TOLERANCE, storedDayHolds } from '../../src/sim/shop';
import { TUNING } from '../../src/sim/tuning';
import { advance, createWorld, DRAFT_PER_CHAPTER, jumpToWave, rushJump, shoot, takeEvents, targetPoint, type GameEvent, type World } from '../../src/sim/world';

const meta = (wlevel: number): MetaLevels => ({ ...NO_META, weapon: 'bow', wlevel });
const hard = (mode: 'blitz' | 'bossrush', wlevel = 1, seed = 1): World => createWorld({ seed, meta: meta(wlevel), difficulty: 'hard', mode });

function run(w: World, seconds: number, events: GameEvent[] = [], each?: () => void): GameEvent[] {
  for (let t = 0; t < seconds; t += 1 / 30) {
    each?.();
    advance(w, 1 / 30);
    events.push(...takeEvents(w));
  }
  return events;
}

/** a mode run ended the quick way: one arrow, then standing in the archers' fire */
function quick(mode: 'blitz' | 'bossrush', seed: number): World {
  const w = hard(mode, 1, seed);
  shoot(w, -1.4, 0.2);
  run(w, 200);
  expect(w.phase).toBe('over');
  return w;
}

describe('mode chests and the device clock', { timeout: 300_000 }, () => {
  it('the shop\'s clock rule: a clock set back a day or two starts no new count; a later day does', () => {
    const s = freshSave();
    const take = (day: string, seed: number) => finishMode(s, newBank(s), quick('blitz', seed), day)!.chest;
    // the day's three
    expect([take('2026-11-22', 1), take('2026-11-22', 2), take('2026-11-22', 3)]).toEqual(['wood', 'wood', 'wood']);
    expect(modeChestsLeft(s, '2026-11-22')).toBe(0);
    // the clock set back a day or two (DAY_SKEW_TOLERANCE): the stored day still holds, nothing more
    expect(DAY_SKEW_TOLERANCE).toBe(2);
    for (const back of ['2026-11-21', '2026-11-20']) {
      expect(storedDayHolds('2026-11-22', back)).toBe(true);
      expect(modeChestsLeft(s, back), back).toBe(0);
      expect(take(back, 4), back).toBeNull();
      expect(s.arsenal.modes.chestDay).toBe('2026-11-22');
      expect(s.arsenal.modes.chestsUsed).toBe(3);
    }
    // and forward again to the same day: still none (a day back and forth earns nothing)
    expect(modeChestsLeft(s, '2026-11-22')).toBe(0);
    expect(take('2026-11-22', 5)).toBeNull();
    expect(s.arsenal.chests).toEqual(['wood', 'wood', 'wood']);
    // a later day: three more
    expect(modeChestsLeft(s, '2026-11-23')).toBe(MODE_CHESTS_PER_DAY);
    expect(take('2026-11-23', 6)).toBe('wood');
    expect(s.arsenal.modes).toMatchObject({ chestDay: '2026-11-23', chestsUsed: 1 });
    // back to the 22nd with two still unused on the 23rd: the 23rd's count goes on (never a fresh three)
    expect(modeChestsLeft(s, '2026-11-22')).toBe(2);
    expect(take('2026-11-22', 7)).toBe('wood');
    expect(s.arsenal.modes).toMatchObject({ chestDay: '2026-11-23', chestsUsed: 2 });
    expect(modeChestsLeft(s, '2026-11-23')).toBe(1);
    expect(take('2026-11-23', 8)).toBe('wood');
    expect(modeChestsLeft(s, '2026-11-23')).toBe(0);
    expect(modeChestsLeft(s, '2026-11-22')).toBe(0);
    expect(modeChestsLeft(s, '2026-11-21')).toBe(0);
    expect(s.arsenal.chests.length).toBe(6);
  });

  it('a clock once set far ahead does not lock the chests out: a stored day more than two days ahead is stale', () => {
    const s = freshSave();
    s.arsenal.modes.chestDay = '2027-06-01';
    s.arsenal.modes.chestsUsed = MODE_CHESTS_PER_DAY;
    expect(storedDayHolds('2027-06-01', '2026-11-22')).toBe(false);
    expect(modeChestsLeft(s, '2026-11-22')).toBe(MODE_CHESTS_PER_DAY);
    expect(finishMode(s, newBank(s), quick('blitz', 9), '2026-11-22')!.chest).toBe('wood');
    expect(s.arsenal.modes).toMatchObject({ chestDay: '2026-11-22', chestsUsed: 1 });
    // three days ahead is already stale, two is not
    s.arsenal.modes.chestDay = '2026-11-25';
    s.arsenal.modes.chestsUsed = MODE_CHESTS_PER_DAY;
    expect(modeChestsLeft(s, '2026-11-22')).toBe(MODE_CHESTS_PER_DAY);
    expect(modeChestsLeft(s, '2026-11-23')).toBe(0);
  });

  it('a day key that is not a day gives nothing and stores nothing', () => {
    const s = freshSave();
    for (const bad of ['', 'today', '2026-1-5', '22-11-2026']) {
      expect(modeChestsLeft(s, bad), bad).toBe(0);
      expect(finishMode(s, newBank(s), quick('blitz', 8), bad)!.chest).toBeNull();
    }
    expect(s.arsenal.modes.chestDay).toBe('');
    expect(s.arsenal.chests).toEqual([]);
    expect(modeChestsLeft(s, '2026-11-22')).toBe(MODE_CHESTS_PER_DAY);
  });
});

describe('a mode world takes nothing from the run options that would pay or help', () => {
  it('no chapter start (no drafted hand) and no daily modifier', () => {
    // the same options on a run of chapters: a drafted hand and the fire card
    const run4 = createWorld({ seed: 2, meta: meta(1), difficulty: 'hard', startChapter: 4, mod: 'fire' });
    expect(run4.startChapter).toBe(4);
    expect(run4.cards.length).toBeGreaterThan(DRAFT_PER_CHAPTER);
    expect(run4.cards).toContain('fire');
    for (const mode of MODES) {
      const w = createWorld({ seed: 2, meta: meta(1), difficulty: 'hard', mode, startChapter: 4, mod: 'fire' });
      expect(w.startChapter, mode).toBe(0);
      expect(w.mod, mode).toBeNull();
      expect(w.cards, mode).toEqual([]);
      expect(w.stats.fireDps, mode).toBe(0);
    }
    // the giants modifier would fatten the archers and pay half as much again
    const g = createWorld({ seed: 2, meta: meta(1), difficulty: 'hard', mode: 'blitz', mod: 'giants' });
    for (const e of g.enemies) expect(e.maxHp).toBe(blitzHp('bow', g.stats.dmgMul));
  });

  it('no objective is ever set in a mode, and one that were there would pay nothing', () => {
    // wave 3 of a run of chapters always carries an objective; a mode world sent there gets none
    const plain = createWorld({ seed: 4, meta: meta(20), difficulty: 'hard' });
    jumpToWave(plain, 3);
    expect(plain.objective).not.toBeNull();
    const w = hard('bossrush', 20, 4);
    jumpToWave(w, 3);
    expect(w.objective).toBeNull();
    // forced onto a rush boss's stage and met: the clear pays no objective coins
    rushJump(w, 0);
    w.objective = { kind: 'heads', limit: 999, hit: false, heads: 3, multi: true };
    const boss = w.enemies.find((e) => e.type === 'boss')!;
    const events: GameEvent[] = [];
    for (let tries = 0; tries < 60 && boss.alive; tries++) {
      boss.hp = Math.min(boss.hp, 1);
      const p = targetPoint(boss, 'chest');
      const s = solveShot(w, p.x, p.y, 1.04, 1);
      w.reload = 0;
      shoot(w, s.angle, s.power);
      run(w, 0.75, events, () => {
        w.player.hp = w.player.maxHp = 1e6;
      });
    }
    expect(boss.alive).toBe(false);
    const obj = events.filter((e) => e.t === 'objective');
    expect(obj.length).toBe(1);
    expect(obj[0]).toMatchObject({ ok: true, coins: 0 });
    let ko = 0;
    for (const e of events) if (e.t === 'ko') ko += e.coins;
    expect(w.run.coins).toBe(ko);
    expect(w.run.objectives).toBe(0);
  });
});

describe('a locked mode cannot be started', () => {
  it('allowedMode gives the mode only once it is open (a test run opens anything)', () => {
    const s = freshSave();
    expect(allowedMode(s, 'blitz')).toBeNull();
    expect(allowedMode(s, 'bossrush')).toBeNull();
    expect(allowedMode(s, null)).toBeNull();
    expect(allowedMode(s, undefined)).toBeNull();
    s.runs = 1;
    expect(allowedMode(s, 'blitz')).toBe('blitz');
    expect(allowedMode(s, 'bossrush')).toBeNull();
    s.bosses[0] = 1;
    expect(allowedMode(s, 'bossrush')).toBe('bossrush');
    // the URL's test runs (?mode=) leave the save alone and may open either
    const fresh = freshSave();
    expect(allowedMode(fresh, 'blitz', true)).toBe('blitz');
    expect(allowedMode(fresh, 'bossrush', true)).toBe('bossrush');
    expect(allowedMode(fresh, 'nonsense' as never, true)).toBeNull();
  });
});

describe('boss rush: a beaten boss cannot end the run', { timeout: 120_000 }, () => {
  it('when a boss falls, everything it loosed and is still in the air goes with it', () => {
    // the warden (fans of orbs) and the cinder king (lava rocks falling on the player)
    for (const i of [3, 4]) {
      const w = hard('bossrush', 20, 7 + i);
      rushJump(w, i);
      const boss = w.enemies.find((e) => e.type === 'boss')!;
      const god = () => {
        w.player.hp = w.player.maxHp = 1e6;
      };
      const flying = () => w.arrows.filter((a) => a.active && a.owner === 'enemy' && a.state === 0).length;
      // wait until something of the boss's is in the air
      for (let t = 0; t < 30 && flying() === 0; t += 1 / 30) run(w, 1 / 30, [], god);
      expect(flying(), `boss ${i} has something in the air`).toBeGreaterThan(0);
      // fell it at once (a body hit takes the last of its health), with its missiles still flying
      const events: GameEvent[] = [];
      for (let tries = 0; tries < 80 && boss.alive; tries++) {
        boss.hp = Math.min(boss.hp, 1);
        const p = targetPoint(boss, 'chest');
        const s = solveShot(w, p.x, p.y, 1.04, 1);
        w.reload = 0;
        shoot(w, s.angle, s.power);
        for (let t = 0; t < 0.7 && boss.alive; t += 1 / 30) run(w, 1 / 30, events, god);
      }
      expect(boss.alive, `boss ${i} fell`).toBe(false);
      expect(flying(), `boss ${i}: nothing of its is left in the air`).toBe(0);
      // the player, one hit from a knockout, lives through the pause to the card pick
      w.player.maxHp = w.stats.maxHp;
      w.player.hp = 1;
      run(w, TUNING.clearDelay + 0.5, events);
      expect(events.some((e) => e.t === 'playerHit' || e.t === 'dying')).toBe(false);
      expect(w.player.alive).toBe(true);
      expect(w.phase).toBe(i < RUSH_BOSSES - 1 ? 'cards' : 'over');
    }
  });
});
