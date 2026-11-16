import { it } from 'vitest';
import { CAMPAIGN, levelMap, levelOptions, levelSpecs } from '../../src/sim/campaign';
import { MatchSim } from '../../src/sim/match';
it('trace', async () => {
  const out: string[] = [];
  const def = CAMPAIGN[Number(process.env.SHEET ?? 0)]!;
  for (let s = 1; s <= 4; s++) {
    const sim = new MatchSim(levelMap(def), s, levelSpecs(def), levelOptions(def));
    sim.autoPolicy = (process.env.POL as 'impatient') ?? 'impatient'; sim.autoPlayTicks = 1e9;
    const tr: string[] = [];
    while (sim.phase === 'playing') { sim.tick(); if (sim.tickCount % 50 === 0) tr.push(sim.colonies.map((c) => `${Math.round(sim.share(c.id) * 100)}:${Math.round(c.reserve)}/${Math.round(sim.cap(c.id))}`).join(' ') + ` b${Math.round(sim.blankArea() / sim.map.landCount * 100)}`); }
    out.push(`s${s} ${sim.phase} ${sim.endReason} t${sim.tickCount / 10}\n  ${tr.join('\n  ')}`);
  }
  (await import('node:fs')).writeFileSync('/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/trace.txt', out.join('\n'));
}, 60000);
