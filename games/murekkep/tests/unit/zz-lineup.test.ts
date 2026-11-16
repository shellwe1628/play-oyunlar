import { it } from 'vitest';
import { CAMPAIGN, levelMap, levelOptions, levelSpecs, type BotDef } from '../../src/sim/campaign';
import { MatchSim, type PlayerPolicy } from '../../src/sim/match';
it('lineups', async () => {
  const N = 40;
  const idx = Number(process.env.SHEET);
  const cands = JSON.parse(process.env.CANDS!) as string[];
  const out: string[] = [];
  for (const c of cands) {
    const bots: BotDef[] = c.split(',').map((t) => ({ personality: ({ T: 'turtle', R: 'rusher', O: 'opportunist' } as const)[t[0] as 'T']!, difficulty: Number(t[1]) }));
    const def = { ...CAMPAIGN[idx]!, bots, id: `try-${idx}-${c}` };
    const rate = (p: PlayerPolicy): number => { let w = 0; for (let s = 1; s <= N; s++) { const sim = new MatchSim(levelMap(def), s, levelSpecs(def), levelOptions(def)); sim.autoPolicy = p; sim.autoPlayTicks = 1e9; while (sim.phase === 'playing') sim.tick(); if (sim.phase === 'won') w++; } return Math.round(w / N * 100); };
    out.push(`${c}: impatient ${rate('impatient')}% patient ${rate('patient')}%`);
  }
  (await import('node:fs')).writeFileSync('/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/lineup.txt', out.join('\n'));
}, 600000);
