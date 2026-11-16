import { it } from 'vitest';
import { CAMPAIGN, FULL_SIZE, levelMap, levelSpecs } from '../../src/sim/campaign';
import { generateMap } from '../../src/sim/mapgen';
import { MatchSim, PERSONALITIES, type ColonySpec } from '../../src/sim/match';

it('explore', async () => {
  const out: string[] = [];
  // bot vs bot
  const wins: Record<string, number> = { turtle: 0, rusher: 0, opportunist: 0 };
  const games: Record<string, number> = { turtle: 0, rusher: 0, opportunist: 0 };
  const lens: number[] = []; let timeouts = 0;
  for (let s = 1; s <= 60; s++) {
    const n = 3 + (s % 3);
    const specs: ColonySpec[] = [];
    for (let i = 0; i < n; i++) specs.push({ kind: 'bot', personality: PERSONALITIES[(i + s) % 3]!, difficulty: 2 });
    const map = generateMap(1000 + s, FULL_SIZE, n);
    const sim = new MatchSim(map, s, specs);
    while (sim.phase === 'playing') sim.tick();
    lens.push(sim.tickCount / 10); if (sim.tickCount >= 4800) timeouts++;
    for (const sp of specs) if (sp.kind === 'bot') games[sp.personality]!++;
    const w = sim.winner; if (w !== null) { const sp = specs[w]!; if (sp.kind === 'bot') wins[sp.personality]!++; }
  }
  lens.sort((a, b) => a - b);
  out.push(`bvb wins ${JSON.stringify(wins)} games ${JSON.stringify(games)} len p10 ${lens[6]} med ${lens[30]} p90 ${lens[54]} timeouts ${timeouts}`);
  for (const def of CAMPAIGN) {
    let w = 0; const l: number[] = [];
    for (let s = 1; s <= 24; s++) {
      const sim = new MatchSim(levelMap(def), s, levelSpecs(def));
      sim.autoPlayTicks = 1e9;
      while (sim.phase === 'playing') sim.tick();
      if (sim.phase === 'won') w++; l.push(Math.round(sim.tickCount / 10));
    }
    out.push(`${def.id} naive wins ${w}/24 lens ${l.join(',')}`);
  }
  (await import('node:fs')).writeFileSync('/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/explore.txt', out.join('\n'));
}, 120000);
