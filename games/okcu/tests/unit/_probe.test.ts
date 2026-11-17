import { appendFileSync } from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/okcu-work/probe.txt';
import { createRng } from '@oyun/core/pure';
import { it } from 'vitest';
import { CARELESS, CAREFUL, SLOW_HUMAN, playRun } from '../../src/sim/aimbot';
import { NO_META } from '../../src/sim/meta';

const N = Number(process.env.N ?? 16);
const BOW = Number(process.env.BOW ?? 0);
it('probe', () => {
  for (const [name, p] of [['slow', SLOW_HUMAN], ['careless', CARELESS], ['careful', CAREFUL]] as const) {
    if (process.env.ONLY && process.env.ONLY !== name) continue;
    const t0 = Date.now();
    const r = Array.from({ length: N }, (_, i) => playRun(i + 1, createRng(1000 + i + 1), p, { meta: { ...NO_META, bow: BOW } }));
    const reached = r.map((x) => x.reached).sort((a, b) => a - b);
    appendFileSync(OUT, [name, 'bow', BOW, 'reached', reached.join(','), 'median', reached[Math.floor(N / 2)], 'coins', Math.round(r.reduce((a, b) => a + b.coins, 0) / N), 'time', Math.round(r.reduce((a, b) => a + b.time, 0) / N), 'ms', Date.now() - t0].join(' ') + '\n');
  }
}, 600000);
