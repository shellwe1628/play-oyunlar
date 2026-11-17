import { it } from 'vitest';
import { appendFileSync } from 'fs';
import { runPolicy } from './policy';
const OUT = '/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/exp.txt';
it('exp', () => {
  for (const p of (process.env.PROF ?? 'fast').split(',') as ('fast' | 'casual')[]) {
    const t0 = Date.now();
    const r = runPolicy(Number(process.env.SEED ?? 1), Number(process.env.MIN ?? 480), p, { every: Number(process.env.EVERY ?? 10) });
    appendFileSync(OUT, `${p} wall ${Date.now() - t0}ms unlock ${r.unlockAt.map((x) => (x === null ? '-' : (x / 60).toFixed(0))).join(' ')} exp ${r.expeditionsAt.map((x) => (x / 60).toFixed(0)).join(',')} gapH ${r.maxGapHour.toFixed(0)}\n${r.timeline.join('\n')}\n`);
  }
}, 3600000);
