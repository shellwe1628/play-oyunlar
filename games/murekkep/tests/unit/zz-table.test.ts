import { it } from 'vitest';
import { CAMPAIGN, levelMap, levelOptions, levelSpecs } from '../../src/sim/campaign';
import { MatchSim, type PlayerPolicy } from '../../src/sim/match';
it('table', async () => {
  const N = Number(process.env.N ?? 40);
  const rows: string[] = [];
  for (const def of CAMPAIGN) {
    const cell = (p: PlayerPolicy): string => {
      let w = 0; const lens: number[] = [];
      for (let s = 1; s <= N; s++) {
        const sim = new MatchSim(levelMap(def), s, levelSpecs(def), levelOptions(def));
        sim.autoPolicy = p; sim.autoPlayTicks = 1e9;
        while (sim.phase === 'playing') sim.tick();
        if (sim.phase === 'won') w++; lens.push(sim.tickCount / 10);
      }
      lens.sort((a, b) => a - b);
      return `${p} ${Math.round((w / N) * 100)}% (med ${lens[N >> 1]}s)`;
    };
    rows.push(`${def.id} ${cell('impatient')} | ${cell('patient')}`);
  }
  (await import('node:fs')).writeFileSync('/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/table.txt', rows.join('\n'));
}, 300000);
