/**
 * Seeded batch balance: many bot-vs-bot matches and two scripted player policies on the campaign
 * sheets. These numbers are the evidence recorded in GAME.md "Built"; if a tuning change breaks
 * them, retune rather than loosen the bounds.
 */
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, FULL_SIZE, levelMap, levelOptions, levelSpecs } from '../../src/sim/campaign';
import { generateMap } from '../../src/sim/mapgen';
import { MatchSim, PERSONALITIES, type ColonySpec, type Personality, type PlayerPolicy } from '../../src/sim/match';
import { RULES } from '../../src/sim/rules';

const BVB_GAMES = 150;

function botVsBot(): { wins: Record<Personality, number>; games: Record<Personality, number>; seconds: number[]; timeouts: number } {
  const wins = { turtle: 0, rusher: 0, opportunist: 0 };
  const games = { turtle: 0, rusher: 0, opportunist: 0 };
  const seconds: number[] = [];
  let timeouts = 0;
  for (let s = 1; s <= BVB_GAMES; s++) {
    const n = 3 + (s % 3); // 3..5 colonies, personalities rotated so each gets every slot
    const specs: ColonySpec[] = [];
    for (let i = 0; i < n; i++) specs.push({ kind: 'bot', personality: PERSONALITIES[(i + s) % 3]!, difficulty: 2 });
    const sim = new MatchSim(generateMap(1000 + s, FULL_SIZE, n), s, specs);
    while (sim.phase === 'playing') sim.tick();
    seconds.push(sim.tickCount / RULES.tickHz);
    if (sim.tickCount >= RULES.maxTicks) timeouts++;
    for (const sp of specs) if (sp.kind === 'bot') games[sp.personality]++;
    const w = sim.winner === null ? null : specs[sim.winner]!;
    if (w?.kind === 'bot') wins[w.personality]++;
  }
  return { wins, games, seconds: seconds.sort((a, b) => a - b), timeouts };
}

/** Win rate (0..1) of a built-in player policy on campaign sheet `index` over `seeds` matches. */
function winRate(index: number, policy: PlayerPolicy, seeds: number): number {
  const def = CAMPAIGN[index]!;
  let won = 0;
  for (let s = 1; s <= seeds; s++) {
    const sim = new MatchSim(levelMap(def), s, levelSpecs(def), levelOptions(def));
    sim.autoPolicy = policy;
    sim.autoPlayTicks = Number.MAX_SAFE_INTEGER;
    while (sim.phase === 'playing') sim.tick();
    if (sim.phase === 'won') won++;
  }
  return won / seeds;
}

describe('balance (seeded batch)', () => {
  const bvb = botVsBot();

  it('every bot personality both wins some and loses some; none dominates', () => {
    for (const p of PERSONALITIES) {
      const share = bvb.wins[p] / BVB_GAMES;
      expect(share, `${p} share of all wins`).toBeGreaterThanOrEqual(0.15);
      expect(share, `${p} share of all wins`).toBeLessThanOrEqual(0.5);
      expect(bvb.wins[p], `${p} loses`).toBeLessThan(bvb.games[p] * 0.6);
    }
  });

  it('full-sheet matches mostly last 2–4 minutes of game time', () => {
    const median = bvb.seconds[Math.floor(bvb.seconds.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(120);
    expect(median).toBeLessThanOrEqual(240);
    expect(bvb.timeouts / BVB_GAMES).toBeLessThanOrEqual(0.12);
  });

  // Targets from the playtest round: a gentle first win and a smooth ramp.
  const SEEDS = 40;
  it('impatient player (never waits for the sweet spot) wins the first three sheets', () => {
    expect(winRate(0, 'impatient', SEEDS)).toBeGreaterThanOrEqual(0.9);
    expect(winRate(1, 'impatient', SEEDS)).toBeGreaterThanOrEqual(0.7);
    expect(winRate(2, 'impatient', SEEDS)).toBeGreaterThanOrEqual(0.5);
  });

  it('patient player (sweet spot, blank first) ramps from sure wins to a real challenge', () => {
    for (const i of [0, 1, 2]) expect(winRate(i, 'patient', SEEDS), `sheet ${i + 1}`).toBeGreaterThanOrEqual(0.9);
    expect(winRate(4, 'patient', SEEDS)).toBeGreaterThanOrEqual(0.6);
    const last = winRate(7, 'patient', SEEDS);
    expect(last).toBeGreaterThanOrEqual(0.25);
    expect(last).toBeLessThanOrEqual(0.45);
  });
});
