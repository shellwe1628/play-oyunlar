/**
 * Direct (non-statistical) rule tests, written to kill mutants the first suite let through.
 */
import { describe, expect, it } from 'vitest';
import { MatchSim, type ColonySpec } from '../../src/sim/match';
import { generateMap, type GameMap } from '../../src/sim/mapgen';
import { RULES, inkCap } from '../../src/sim/rules';

function stripMap(width: number, starts: number[]): GameMap {
  const land = new Uint8Array(width * 3);
  for (let x = 0; x < width; x++) land[width + x] = 1;
  return { id: 'strip', width, height: 3, land, landCount: width, starts: starts.map((x) => width + x) };
}

const idle: ColonySpec = { kind: 'idle' };
const player: ColonySpec = { kind: 'player' };
const FIXED = { growth: false, shuffleStarts: false };
/** Cell index on the strip's land row. */
const at = (m: GameMap, x: number): number => m.width + x;

describe('8-minute stop', () => {
  it('is 4800 ticks and gives the win to the largest colony', () => {
    expect(RULES.maxTicks).toBe(4800);
    const m = stripMap(40, [2, 20, 37]);
    const sim = new MatchSim(m, 1, [player, idle, idle], FIXED);
    for (let x = 15; x < 26; x++) sim.setOwner(at(m, x), 1); // colony 1 largest
    sim.tickCount = RULES.maxTicks - 2;
    sim.tick();
    expect(sim.phase).toBe('playing');
    sim.tick();
    expect(sim.phase).toBe('lost');
    expect(sim.winner).toBe(1);
    expect(sim.endReason).toBe('time');
  });

  it('breaks an area tie by reserve, and an exact tie never goes to the player', () => {
    const m = stripMap(40, [2, 37]);
    const a = new MatchSim(m, 1, [player, idle], FIXED);
    a.colonies[1]!.reserve = a.colonies[0]!.reserve + 5;
    a.tickCount = RULES.maxTicks - 1;
    a.tick();
    expect(a.winner).toBe(1);
    const b = new MatchSim(m, 1, [player, idle], FIXED);
    b.colonies[0]!.reserve = b.colonies[1]!.reserve + 5;
    b.tickCount = RULES.maxTicks - 1;
    b.tick();
    expect(b.winner).toBe(0);
    const c = new MatchSim(m, 1, [player, idle], FIXED);
    c.tickCount = RULES.maxTicks - 1;
    c.tick();
    expect(c.colonies[0]!.area).toBe(c.colonies[1]!.area);
    expect(c.phase).toBe('lost');
  });
});

describe('elimination', () => {
  it('a dead colony loses its waves and reserve and never grows again', () => {
    const m = stripMap(40, [2, 20, 37]);
    const sim = new MatchSim(m, 1, [player, idle, idle], { shuffleStarts: false });
    sim.colonies[1]!.reserve = 200;
    expect(sim.attack(1, at(m, 17), 50).ok).toBe(true);
    for (let x = 0; x < 40; x++) if (sim.owner[at(m, x)] === 1) sim.setOwner(at(m, x), 0);
    sim.tick();
    expect(sim.colonies[1]!.alive).toBe(false);
    expect(sim.waves.filter((w) => w.owner === 1)).toHaveLength(0);
    expect(sim.colonies[1]!.reserve).toBe(0);
    for (let i = 0; i < 50; i++) sim.tick();
    expect(sim.colonies[1]!.reserve).toBe(0);
  });

  it('the last colony standing wins even with a small share (no player)', () => {
    const m = stripMap(60, [2, 30, 57]);
    const sim = new MatchSim(m, 1, [idle, idle, idle], FIXED);
    for (const id of [1, 2]) for (let x = 0; x < 60; x++) if (sim.owner[at(m, x)] === id) sim.setOwner(at(m, x), -1);
    sim.tick();
    expect(sim.share(0)).toBeLessThan(RULES.winShare);
    expect(sim.phase).toBe('ended');
    expect(sim.winner).toBe(0);
    expect(sim.endReason).toBe('last');
  });

  it('the player losing all land ends the match at once, even with several rivals alive', () => {
    const m = stripMap(60, [2, 30, 57]);
    const sim = new MatchSim(m, 1, [player, idle, idle], FIXED);
    for (let x = 0; x < 60; x++) if (sim.owner[at(m, x)] === 0) sim.setOwner(at(m, x), -1);
    sim.tick();
    expect(sim.phase).toBe('lost');
    expect(sim.winner).toBeNull();
    expect(sim.endReason).toBe('eliminated');
  });

  it('a rival reaching 70 % ends with reason share', () => {
    const m = stripMap(100, [2, 97]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    for (let x = 10; x < 90; x++) sim.setOwner(at(m, x), 1);
    sim.tick();
    expect(sim.phase).toBe('lost');
    expect(sim.winner).toBe(1);
    expect(sim.endReason).toBe('share');
  });
});

describe('attack limits', () => {
  it('at most 8 waves at once per colony', () => {
    const m = stripMap(200, [100, 197]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    sim.colonies[0]!.reserve = 1e6;
    const r: boolean[] = [];
    for (let k = 0; k < 9; k++) r.push(sim.attack(0, at(m, k % 2 ? 103 : 97), 10).ok);
    expect(r.slice(0, 8).every(Boolean)).toBe(true);
    expect(sim.attack(0, at(m, 103), 10)).toEqual({ ok: false, reason: 'busy' });
  });

  it('refuses (no sound-worthy ok) a wave that cannot afford one cell', () => {
    const m = stripMap(40, [2, 37]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    sim.colonies[0]!.reserve = RULES.blankCost * 5; // 10 % of it = half a cell
    const before = sim.colonies[0]!.reserve;
    expect(sim.attack(0, at(m, 5), 10)).toEqual({ ok: false, reason: 'no-ink' });
    expect(sim.colonies[0]!.reserve).toBe(before);
  });

  it('a queued cell that no longer touches the attacker is skipped', () => {
    const m = stripMap(40, [2, 37]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    sim.colonies[0]!.reserve = 100;
    expect(sim.attack(0, at(m, 5), 50).ok).toBe(true);
    sim.setOwner(at(m, 4), 1); // cut the contact
    sim.tick();
    expect(sim.owner[at(m, 5)]).toBe(-1);
  });

  it('a queued cell taken by a third colony is not captured from them', () => {
    const m = stripMap(40, [2, 20, 37]);
    const sim = new MatchSim(m, 1, [player, idle, idle], FIXED);
    sim.colonies[0]!.reserve = 100;
    sim.attack(0, at(m, 5), 50); // blank target
    sim.setOwner(at(m, 5), 2);
    sim.tick();
    expect(sim.owner[at(m, 5)]).toBe(2);
  });

  it('a wave takes at most base + ink/speedInk cells per tick, capped', () => {
    const m = stripMap(400, [2, 397]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    sim.colonies[0]!.reserve = inkCap(5);
    const ink = sim.colonies[0]!.reserve * 0.5;
    sim.attack(0, at(m, 5), 50);
    const a0 = sim.colonies[0]!.area;
    sim.tick();
    const expected = Math.min(RULES.waveSpeedMax, Math.floor(RULES.waveSpeedBase + ink / RULES.waveSpeedInk));
    expect(sim.colonies[0]!.area - a0).toBe(expected);
    const big = new MatchSim(m, 1, [player, idle], FIXED);
    big.colonies[0]!.reserve = 1e5;
    big.attack(0, at(m, 5), 100);
    const b0 = big.colonies[0]!.area;
    big.tick();
    expect(big.colonies[0]!.area - b0).toBe(RULES.waveSpeedMax);
  });
});

describe('ink accounting', () => {
  it('the attacker absorbs exactly half of what the defender loses, never more', () => {
    const m = stripMap(20, [2, 17]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    for (let x = 0; x < 20; x++) sim.setOwner(at(m, x), x < 10 ? 0 : 1);
    sim.colonies[0]!.reserve = 40;
    sim.colonies[1]!.reserve = 20; // density 2: a cell costs 0.8 + 1.3 × 2 = 3.4
    expect(RULES.absorb).toBe(0.5);
    sim.attack(0, at(m, 10), 50); // 20 ink out; 2 cells this tick, wave still running after
    const r0 = sim.colonies[0]!.reserve;
    const d0 = sim.colonies[1]!.reserve;
    sim.tick();
    expect(sim.waves).toHaveLength(1);
    const lost = d0 - sim.colonies[1]!.reserve;
    const gained = sim.colonies[0]!.reserve - r0;
    expect(lost).toBeGreaterThan(0);
    expect(gained).toBeCloseTo(lost * 0.5, 9);
  });

  it('unspent wave ink comes back exactly once', () => {
    const m = stripMap(12, [2, 9]); // blank between them: x 5..6 only
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    sim.colonies[0]!.reserve = 30; // under the cap of 5 cells (32)
    sim.attack(0, at(m, 5), 50); // 15 ink, 2 blank cells reachable
    for (let i = 0; i < 10; i++) sim.tick();
    expect(sim.waves).toHaveLength(0);
    expect(sim.colonies[0]!.reserve).toBeCloseTo(30 - 2 * RULES.blankCost, 9);
  });

  it('reserve never exceeds the cap, also after refunds and absorption', () => {
    const m = stripMap(20, [2, 17]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    for (let x = 0; x < 20; x++) sim.setOwner(at(m, x), x < 10 ? 0 : 1);
    sim.colonies[0]!.reserve = inkCap(10);
    sim.colonies[1]!.reserve = inkCap(10);
    sim.attack(0, at(m, 10), 10);
    sim.colonies[0]!.reserve = sim.cap(0); // full while the wave absorbs the defender's ink
    for (let i = 0; i < 20; i++) {
      sim.tick();
      for (const c of sim.colonies) expect(c.reserve).toBeLessThanOrEqual(sim.cap(c.id) + 1e-9);
    }
  });
});

describe('Blot details', () => {
  it('takes only paper, costs the defender ink, and only the player may use it', () => {
    const m = stripMap(40, [10, 16]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false, shuffleStarts: false, blot: true });
    sim.tickCount = RULES.blotCooldown;
    sim.colonies[1]!.reserve = 30;
    expect(sim.blotReady(1)).toBe(false);
    expect(sim.blot(1, at(m, 13))).toBe(0);
    const before = sim.colonies[1]!.reserve;
    const taken = sim.blot(0, at(m, 13));
    expect(taken).toBeGreaterThan(0);
    for (let x = 0; x < 40; x++) {
      expect(sim.owner[x]).toBe(-1); // gap rows untouched
      expect(sim.owner[2 * 40 + x]).toBe(-1);
    }
    expect(sim.colonies[1]!.reserve).toBeLessThan(before);
  });
});

describe('peak tracking', () => {
  it('flags dropping below half the peak, not earlier', () => {
    const m = stripMap(40, [2, 37]);
    const sim = new MatchSim(m, 1, [player, idle], FIXED);
    for (let x = 0; x < 10; x++) sim.setOwner(at(m, x), 0);
    sim.tick();
    expect(sim.stats[0]!.peakArea).toBe(10);
    for (let x = 6; x < 10; x++) sim.setOwner(at(m, x), -1); // 6 of 10
    sim.tick();
    expect(sim.stats[0]!.droppedBelowHalfPeak).toBe(false);
    sim.setOwner(at(m, 5), -1);
    sim.tick();
    expect(sim.stats[0]!.droppedBelowHalfPeak).toBe(false); // exactly half
    sim.setOwner(at(m, 4), -1);
    sim.tick();
    expect(sim.stats[0]!.droppedBelowHalfPeak).toBe(true);
  });
});

describe('starts', () => {
  it('start assignment is shuffled per match seed', () => {
    const map = generateMap(9, { width: 40, height: 56 }, 4);
    const specs: ColonySpec[] = [player, idle, idle, idle];
    const firsts = new Set<number>();
    for (let s = 1; s <= 12; s++) firsts.add(new MatchSim(map, s, specs).startCells[0]!);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('a fair start gives the player the start with the most room', () => {
    const map = generateMap(9, { width: 40, height: 56 }, 4);
    const specs: ColonySpec[] = [player, idle, idle, idle];
    for (let s = 1; s <= 6; s++) {
      const sim = new MatchSim(map, s, specs, { fairStart: true });
      const room = sim.startRoom();
      expect(room[0]).toBe(Math.max(...room));
    }
  });
});
