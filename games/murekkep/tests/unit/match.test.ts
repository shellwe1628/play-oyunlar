import { describe, expect, it } from 'vitest';
import { RULES, growthFactor, growthPerTick, inkCap } from '../../src/sim/rules';
import { MatchSim, type ColonySpec } from '../../src/sim/match';
import { generateMap, type GameMap } from '../../src/sim/mapgen';

/** A hand-built sheet: one row strip of land, useful for exact cost maths. */
function stripMap(width: number, starts: number[]): GameMap {
  const land = new Uint8Array(width * 3);
  for (let x = 0; x < width; x++) land[width + x] = 1; // middle row only
  return { id: 'strip', width, height: 3, land, landCount: width, starts: starts.map((x) => width + x) };
}

const idle: ColonySpec = { kind: 'idle' };
const player: ColonySpec = { kind: 'player' };

describe('growth curve', () => {
  it('peaks near half of the cap and is zero at the cap', () => {
    let bestX = 0;
    let best = -1;
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      const g = growthFactor(x);
      if (g > best) {
        best = g;
        bestX = x;
      }
    }
    expect(bestX).toBeGreaterThanOrEqual(0.45);
    expect(bestX).toBeLessThanOrEqual(0.55);
    expect(growthFactor(1)).toBe(0);
    expect(growthFactor(1.4)).toBe(0);
    // Spending everything is slow but never a dead end.
    expect(growthFactor(0)).toBeGreaterThan(0);
    expect(growthFactor(0)).toBeLessThan(growthFactor(0.5) / 2);
  });

  it('grows faster with more territory, and cap scales with territory', () => {
    expect(inkCap(100)).toBeGreaterThan(inkCap(20));
    const small = growthPerTick(20, inkCap(20) / 2);
    const big = growthPerTick(100, inkCap(100) / 2);
    expect(big).toBeGreaterThan(small);
    expect(growthPerTick(50, inkCap(50))).toBe(0);
  });

  it('a colony left alone grows its reserve toward, but never past, its cap', () => {
    const sim = new MatchSim(stripMap(40, [2, 37]), 1, [idle, idle]);
    for (let i = 0; i < 2000; i++) sim.tick();
    const c = sim.colonies[0]!;
    expect(c.reserve).toBeLessThanOrEqual(sim.cap(0) + 1e-9);
    expect(c.reserve).toBeGreaterThan(sim.cap(0) * 0.95);
  });
});

describe('attack', () => {
  it('only targets land touching the attacker border, not own land', () => {
    const sim = new MatchSim(stripMap(40, [2, 37]), 1, [player, idle]);
    // Start blot is cells within START_RADIUS of the start: in a strip that is x 0..2+r.
    const edge = 2 + RULES.startRadius;
    expect(sim.attack(0, sim.map.width + edge + 1, 30).ok).toBe(true);
    expect(sim.attack(0, sim.map.width + edge + 5, 30).ok).toBe(false); // not touching
    expect(sim.attack(0, sim.map.width + 1, 30).ok).toBe(false); // own cell
    expect(sim.attack(0, 0, 30).ok).toBe(false); // gap
  });

  it('never spends more than the committed share of the reserve', () => {
    const sim = new MatchSim(generateMap(5, { width: 30, height: 42 }, 2), 3, [player, idle]);
    sim.colonies[0]!.reserve = 200;
    const target = sim.attackableCells(0)[0]!;
    const res = sim.attack(0, target, 40);
    expect(res.ok).toBe(true);
    expect(sim.colonies[0]!.reserve).toBeCloseTo(120, 6);
    for (let i = 0; i < 300; i++) sim.tick();
    expect(sim.stats[0]!.inkSpent).toBeGreaterThan(0);
    expect(sim.stats[0]!.inkSpent).toBeLessThanOrEqual(80 + 1e-9);
  });

  it('clamps the commit to 10..100 %', () => {
    const sim = new MatchSim(stripMap(40, [2, 37]), 1, [player, idle]);
    sim.colonies[0]!.reserve = 100;
    const edge = 2 + RULES.startRadius;
    sim.attack(0, sim.map.width + edge + 1, 2);
    expect(sim.colonies[0]!.reserve).toBeCloseTo(90, 6);
  });
});

describe('capture costs', () => {
  it('blank paper costs the flat blank cost', () => {
    const sim = new MatchSim(stripMap(200, [2, 197]), 1, [player, idle], { growth: false });
    sim.colonies[0]!.reserve = 100;
    const edge = 2 + RULES.startRadius;
    sim.attack(0, sim.map.width + edge + 1, 100); // 100 ink into blank paper
    for (let i = 0; i < 400; i++) sim.tick();
    const gained = sim.colonies[0]!.area - (edge + 1);
    expect(gained).toBe(Math.floor(100 / RULES.blankCost));
  });

  it('enemy cells cost by defender density, and the defender loses ink too', () => {
    // Two colonies meet in the middle of a strip; all paper between them is taken.
    const m = stripMap(20, [2, 17]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    for (let x = 0; x < 20; x++) sim.setOwner(m.width + x, x < 10 ? 0 : 1);
    sim.colonies[1]!.reserve = 50; // area 10 → density 5
    sim.colonies[0]!.reserve = 100;
    const density = 50 / 10;
    const cost = RULES.enemyBaseCost + RULES.densityCost * density;
    expect(sim.captureCost(0, m.width + 10)).toBeCloseTo(cost, 6);
    expect(sim.captureCost(0, m.width + 10 + 1)).toBeCloseTo(cost, 6);
    sim.attack(0, m.width + 10, 100);
    sim.tick();
    expect(sim.owner[m.width + 10]).toBe(0);
    // Defender lost its per-cell share of ink for every captured cell; attacker paid per cell.
    const taken = 10 - sim.colonies[1]!.area;
    expect(taken).toBeGreaterThan(0);
    let r = 50;
    let a = 10;
    let paid = 0;
    for (let k = 0; k < taken; k++) {
      const d = r / a;
      paid += RULES.enemyBaseCost + RULES.densityCost * d;
      r -= d * RULES.defenderLoss;
      a -= 1;
    }
    expect(sim.colonies[1]!.reserve).toBeCloseTo(r, 6);
    expect(sim.stats[0]!.inkSpent).toBeCloseTo(paid, 6);
  });

  it('a wave stops when it runs out of ink', () => {
    const m = stripMap(60, [2, 57]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    sim.colonies[0]!.reserve = 10;
    const edge = 2 + RULES.startRadius;
    sim.attack(0, m.width + edge + 1, 100);
    for (let i = 0; i < 200; i++) sim.tick();
    expect(sim.waves).toHaveLength(0);
    expect(sim.colonies[0]!.area).toBe(edge + 1 + Math.floor(10 / RULES.blankCost));
    // Leftover smaller than one cell's cost is returned, not lost.
    expect(sim.colonies[0]!.reserve).toBeLessThan(RULES.blankCost);
  });

  it('a wave advances a few cells per tick, not all at once', () => {
    const m = stripMap(60, [2, 57]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    sim.colonies[0]!.reserve = 40;
    const edge = 2 + RULES.startRadius;
    sim.attack(0, m.width + edge + 1, 100);
    sim.tick();
    const after1 = sim.colonies[0]!.area - (edge + 1);
    expect(after1).toBeGreaterThan(0);
    expect(after1).toBeLessThan(40);
  });
});

describe('elimination and win', () => {
  it('a colony with no cells is eliminated and the player loses', () => {
    const m = stripMap(20, [2, 17]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    for (let x = 0; x < 20; x++) sim.setOwner(m.width + x, x < 1 ? 0 : 1);
    sim.colonies[1]!.reserve = 500;
    sim.attack(1, m.width + 0, 100);
    for (let i = 0; i < 20 && sim.phase === 'playing'; i++) sim.tick();
    expect(sim.colonies[0]!.alive).toBe(false);
    expect(sim.phase).toBe('lost');
    expect(sim.winner).toBe(1);
  });

  it('the last colony standing wins', () => {
    const m = stripMap(20, [2, 10, 17]);
    const sim = new MatchSim(m, 1, [player, idle, idle], { growth: false });
    expect(sim.phase).toBe('playing');
    for (let x = 0; x < 20; x++) sim.setOwner(m.width + x, x < 19 ? 0 : 1);
    sim.colonies[0]!.reserve = 500;
    sim.attack(0, m.width + 19, 100);
    for (let i = 0; i < 20 && sim.phase === 'playing'; i++) sim.tick();
    expect(sim.phase).toBe('won');
    expect(sim.winner).toBe(0);
  });

  it('holding 70 % of the land wins', () => {
    const m = stripMap(100, [2, 97]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    for (let x = 0; x < 69; x++) sim.setOwner(m.width + x, 0);
    sim.tick();
    expect(sim.phase).toBe('playing');
    sim.colonies[0]!.reserve = 5;
    sim.attack(0, m.width + 69, 100);
    for (let i = 0; i < 10; i++) sim.tick();
    expect(sim.share(0)).toBeGreaterThanOrEqual(RULES.winShare);
    expect(sim.phase).toBe('won');
  });

  it('ignores attacks and ticks once the match has ended', () => {
    const m = stripMap(100, [2, 97]);
    const sim = new MatchSim(m, 1, [player, idle], { growth: false });
    for (let x = 0; x < 75; x++) sim.setOwner(m.width + x, 0);
    sim.tick();
    expect(sim.phase).toBe('won');
    const t = sim.tickCount;
    sim.tick();
    expect(sim.tickCount).toBe(t);
    expect(sim.attack(0, m.width + 75, 50).ok).toBe(false);
  });
});

describe('determinism', () => {
  it('same seed → same match', () => {
    const map = generateMap(11, { width: 40, height: 56 }, 4);
    const specs: ColonySpec[] = [
      { kind: 'bot', personality: 'rusher', difficulty: 2 },
      { kind: 'bot', personality: 'turtle', difficulty: 2 },
      { kind: 'bot', personality: 'opportunist', difficulty: 2 },
      { kind: 'bot', personality: 'rusher', difficulty: 1 },
    ];
    const run = (seed: number): string => {
      const sim = new MatchSim(map, seed, specs);
      for (let i = 0; i < 900; i++) sim.tick();
      return `${Array.from(sim.owner).join('')}|${sim.colonies.map((c) => c.reserve.toFixed(6)).join(',')}`;
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });
});
