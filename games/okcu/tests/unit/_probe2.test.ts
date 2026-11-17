import { appendFileSync } from 'node:fs';
import { createRng } from '@oyun/core/pure';
import { it } from 'vitest';
import { CARELESS, playRun } from '../../src/sim/aimbot';
import { NO_META } from '../../src/sim/meta';
import type { World } from '../../src/sim/world';
const OUT = '/tmp/claude-0/-home-user-play-oyunlar/32165264-d340-52c8-b5cb-d836519fcb6c/scratchpad/okcu-work/probe.txt';
it('probe2', () => {
  for (let i = 0; i < 20; i++) {
    let last: World | null = null;
    let w0 = 0, t0 = 0, s0 = 0, h0 = 0, k0 = 0, hp0 = 0;
    const hits: string[] = [];
    let prevHp = 0;
    const r = playRun(i + 1, createRng(1000 + i + 1), CARELESS, {
      meta: { ...NO_META, bow: 15 },
      each: (w) => {
        if (w.wave !== w0) { w0 = w.wave; t0 = w.time; s0 = w.run.shots; h0 = w.run.hits; k0 = w.run.playerHitsTaken; hp0 = w.player.hp; hits.length = 0; }
        if (w.player.hp < prevHp - 0.5) hits.push(`${Math.round(prevHp - w.player.hp)}@${(w.time - t0).toFixed(1)}`);
        prevHp = w.player.hp;
        last = w;
      },
    });
    const w = last!;
    if (r.reached === 18 || r.reached === 14) appendFileSync(OUT, `seed ${i + 1} reached ${r.reached} hpStart ${Math.round(hp0)} t ${Math.round(w.time - t0)} shots ${w.run.shots - s0} hits ${w.run.hits - h0} dmg ${hits.join(' ')} alive ${w.enemies.filter((e) => e.alive).map((e) => e.type + ':' + Math.round(e.hp) + '/' + e.maxHp).join(',')} cards ${w.cards.length}\n`);
  }
}, 600000);
