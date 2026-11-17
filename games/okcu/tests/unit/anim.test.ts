import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { animate, blinking, newAnimOut, posePoint, posePoints, type AnimInput, type Kind } from '../../src/anim/anim';
import { themeIndex, THEMES } from '../../src/anim/themes';
import { CARELESS, planShot } from '../../src/sim/aimbot';
import { PT } from '../../src/sim/ragdoll';
import { advance, canShoot, createWorld, pickCard, shoot, takeEvents, type Archer, type World } from '../../src/sim/world';

function input(kind: Kind, t: number, over: Partial<AnimInput> = {}): AnimInput {
  return { kind, id: 3, alive: true, t, scale: 1.25, facing: kind === 'player' ? 1 : -1, draw: 0, brain: 'wait', sinceHit: 99, sinceRelease: 99, sinceLand: 99, sinceCheer: 99, sinceTaunt: 99, hp: 1, lookX: 0, lookY: 0, title: false, mood: 0, ...over };
}

/** Sample one channel of the animation over `secs` seconds. */
function sample(kind: Kind, secs: number, pick: (o: ReturnType<typeof newAnimOut>) => number, over: Partial<AnimInput> = {}): number[] {
  const o = newAnimOut();
  const out: number[] = [];
  for (let t = 0; t < secs; t += 1 / 30) {
    animate(input(kind, t, over), o);
    out.push(pick(o));
  }
  return out;
}
const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

describe('animation layer (pure)', () => {
  it('is deterministic and stays within sane bounds for any state', () => {
    const rng = createRng(5);
    const kinds: Kind[] = ['player', 'archer', 'shield', 'jumper', 'bomber', 'boss'];
    const a = newAnimOut();
    const b = newAnimOut();
    for (let i = 0; i < 4000; i++) {
      const inp = input(kinds[i % kinds.length]!, rng.range(0, 100), {
        id: rng.int(0, 50),
        draw: rng.chance(0.3) ? rng.next() : 0,
        sinceHit: rng.range(0, 3),
        sinceRelease: rng.range(0, 1),
        sinceLand: rng.range(0, 2),
        sinceCheer: rng.range(0, 2),
        sinceTaunt: rng.range(0, 2),
        hp: rng.next(),
        title: rng.chance(0.2),
        mood: rng.int(-1, 1),
      });
      animate(inp, a);
      animate(inp, b);
      expect(a).toEqual(b);
      expect(Math.abs(a.lean)).toBeLessThan(0.45);
      expect(a.sy).toBeGreaterThan(0.6);
      expect(a.sy).toBeLessThan(1.4);
      // (several reactions can stack, e.g. a title stretch during a cheer)
      for (const v of [a.dx, a.dy, a.headX, a.headY, a.handFX, a.handFY, a.handBX, a.handBY, a.footFY, a.footBY]) expect(Math.abs(v)).toBeLessThanOrEqual(64 * 1.25);
    }
  });

  it('blinks briefly and rarely', () => {
    let shut = 0;
    let n = 0;
    for (let t = 0; t < 60; t += 1 / 60) {
      n++;
      if (blinking(7, t)) shut++;
    }
    expect(shut / n).toBeGreaterThan(0.02);
    expect(shut / n).toBeLessThan(0.12);
  });

  it('each archer type moves its own way (recognisable from motion alone)', () => {
    // jumper: constant bounce, the biggest vertical motion
    const jumpY = range(sample('jumper', 4, (o) => o.dy));
    const archerY = range(sample('archer', 4, (o) => o.dy));
    expect(jumpY).toBeGreaterThan(archerY * 2);
    // archer: the only one tapping a foot
    expect(range(sample('archer', 4, (o) => o.footFY))).toBeGreaterThan(4);
    expect(range(sample('jumper', 4, (o) => o.footFY))).toBe(0);
    // shield: ducks behind the shield (sinks)
    expect(Math.max(...sample('shield', 6, (o) => o.dy))).toBeGreaterThan(10);
    // bomber: juggles
    expect(Math.max(...sample('bomber', 3, (o) => o.juggle))).toBeGreaterThan(30);
    expect(Math.max(...sample('archer', 3, (o) => o.juggle))).toBe(-1);
    // boss: stomps
    expect(Math.max(...sample('boss', 8, (o) => o.stomp))).toBe(1);
    // player at the title: tests the string and stretches
    expect(Math.max(...sample('player', 8, (o) => o.drawOverride, { title: true }))).toBeGreaterThan(0.4);
    expect(Math.min(...sample('player', 8, (o) => o.handFY, { title: true }))).toBeLessThan(-30);
  });

  it('reacts: squint while drawing, follow-through, flinch then dizzy, scared, cheer, taunt, roar', () => {
    const o = newAnimOut();
    animate(input('archer', 1, { draw: 0.8 }), o);
    expect(o.eyes === 'squint' || o.eyes === 'blink').toBe(true);
    expect(o.scarfLift).toBeCloseTo(0.8);
    animate(input('player', 1, { sinceRelease: 0.15 }), o);
    expect(o.lean).toBeGreaterThan(0.05);
    animate(input('archer', 1, { sinceHit: 0.1 }), o);
    expect(o.eyes).toBe('closed');
    animate(input('archer', 1, { sinceHit: 0.6 }), o);
    expect(o.eyes).toBe('dizzy');
    expect(o.dizzy).toBeGreaterThan(0.9);
    animate(input('player', 1, { hp: 0.2 }), o);
    expect(o.sweat).toBe(true);
    animate(input('player', 1, { sinceCheer: 0.22 }), o);
    expect(o.dy).toBeLessThan(-20);
    expect(o.mouth).toBe('grin');
    animate(input('bomber', 1, { sinceTaunt: 0.3 }), o);
    expect(o.laugh).toBe(true);
    animate(input('boss', 1, { sinceLand: 0.8 }), o);
    expect(o.mouth).toBe('roar');
    animate(input('archer', 1, { sinceLand: 0.1 }), o);
    expect(o.sy).toBeLessThan(1);
    animate(input('player', 1, { alive: false }), o);
    expect(o.dx + o.dy + o.lean).toBe(0);
  });

  it('posePoints keeps the feet planted under lean and squash, and never touches the body', () => {
    const w = createWorld({ seed: 1 });
    const b = w.player.body;
    const bx = Array.from(b.x);
    const by = Array.from(b.y);
    const o = newAnimOut();
    o.lean = 0.2;
    o.sx = 1.1;
    o.sy = 0.8;
    const vx = new Float64Array(11);
    const vy = new Float64Array(11);
    posePoints(b.x, b.y, b.n, o, vx, vy);
    const fx = (bx[PT.footF]! + bx[PT.footB]!) / 2;
    const fy = (by[PT.footF]! + by[PT.footB]!) / 2;
    expect((vx[PT.footF]! + vx[PT.footB]!) / 2).toBeCloseTo(fx, 6);
    expect((vy[PT.footF]! + vy[PT.footB]!) / 2).toBeCloseTo(fy, 6);
    expect(vy[PT.head]).not.toBeCloseTo(by[PT.head]!, 1);
    expect(Array.from(b.x)).toEqual(bx);
    expect(Array.from(b.y)).toEqual(by);
    const p = { x: 0, y: 0 };
    posePoint(b.x, b.y, o, bx[PT.neck]!, by[PT.neck]!, p);
    expect(p.x).toBeCloseTo(vx[PT.neck]!, 6);
    expect(p.y).toBeCloseTo(vy[PT.neck]!, 6);
  });
});

describe('themes', () => {
  it('each chapter is its own world; endless changes world every seven waves', () => {
    expect([1, 7, 8, 14, 15, 22, 28, 29, 36, 43, 50, 57].map((w) => themeIndex(w))).toEqual([0, 0, 1, 1, 2, 3, 3, 0, 1, 2, 3, 0]);
    expect(THEMES.map((t) => t.id)).toEqual(['meadow', 'snow', 'desert', 'night']);
  });
});

describe('animations never change the sim', () => {
  /** A seeded careless run; with `anim`, every archer is animated every step like the renderer does. */
  function play(anim: boolean): { log: string; world: string } {
    const w: World = createWorld({ seed: 77 });
    const rng = createRng(77);
    const o = newAnimOut();
    const vx = new Float64Array(11);
    const vy = new Float64Array(11);
    const log: string[] = [];
    let wait = 0;
    const animateAll = (t: number) => {
      const each = (a: Archer) => {
        animate(input((a.type === 'player' || a.type === 'archer' || a.type === 'shield' || a.type === 'jumper' || a.type === 'bomber' || a.type === 'boss' ? a.type : 'archer'), t, { id: a.id, alive: a.alive, draw: a.draw, sinceHit: a.hurt, hp: a.hp / a.maxHp, facing: a.facing, scale: a.scale, brain: a.brain }), o);
        posePoints(a.body.x, a.body.y, a.body.n, o, vx, vy);
      };
      each(w.player);
      for (const e of w.enemies) each(e);
    };
    for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) {
      if (w.phase === 'cards') pickCard(w, 0);
      if (canShoot(w) && (w.phase === 'title' || w.phase === 'play')) {
        wait += 1 / 60;
        if (wait > 0.6 || w.phase === 'title') {
          const s = planShot(w, rng, CARELESS);
          if (s && shoot(w, s.angle, s.power)) wait = 0;
        }
      }
      advance(w, 1 / 60);
      if (anim) animateAll(w.time);
      for (const e of takeEvents(w)) log.push(JSON.stringify(e));
    }
    const world = JSON.stringify({ wave: w.wave, phase: w.phase, hp: w.player.hp, run: w.run, x: Array.from(w.player.body.x), ex: w.enemies.map((e) => Array.from(e.body.x)) });
    return { log: log.join('\n'), world };
  }

  it('a seeded run plays out identically with the animation layer on and off', () => {
    const off = play(false);
    const on = play(true);
    expect(on.log.length).toBeGreaterThan(1000);
    expect(on.world).toBe(off.world);
    expect(on.log).toBe(off.log);
  }, 60_000);
});
