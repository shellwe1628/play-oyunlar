import { it } from 'vitest';
import { CAMPAIGN, levelMap, levelSpecs } from '../../src/sim/campaign';
import { MatchSim } from '../../src/sim/match';
it('c8', async () => {
  const out: string[] = [];
  for (const idx of [7]) {
    const def = CAMPAIGN[idx]!;
    for (let s = 1; s <= 12; s++) {
      const sim = new MatchSim(levelMap(def), s, levelSpecs(def));
      sim.autoPlayTicks = 1e9;
      const trace: string[] = [];
      while (sim.phase === 'playing') { sim.tick(); if (sim.tickCount % 300 === 0) trace.push(sim.colonies.map((c) => Math.round(sim.share(c.id) * 100)).join('/')); }
      out.push(`${def.id} s${s} ${sim.phase} t=${sim.tickCount / 10} winner=${sim.winner} | ${trace.join('  ')}`);
    }
  }
  (await import('node:fs')).writeFileSync('/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/c8.txt', out.join('\n'));
}, 60000);
