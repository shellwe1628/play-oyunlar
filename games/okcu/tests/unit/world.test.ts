import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CARELESS, CAREFUL, playRun, solveShot } from '../../src/sim/aimbot';
import { addVelocity, maxStickError } from '../../src/sim/body';
import { CARDS, statsFor, type CardId } from '../../src/sim/cards';
import { PT } from '../../src/sim/ragdoll';
import { TUNING } from '../../src/sim/tuning';
import { enemyAccuracy } from '../../src/sim/waves';
import {
  addExtraCard,
  advance,
  advanceKeep,
  aliveEnemies,
  createWorld,
  enemyAimSolution,
  pickCard,
  reroll,
  revive,
  shoot,
  targetPoint,
  type GameEvent,
  type World,
} from '../../src/sim/world';

function run(w: World, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    advance(w, 1 / 60);
    all.push(...w.events);
  }
  return all;
}

/** A perfect shot at a point of the first live enemy. */
function aimAtEnemy(w: World, where: 'head' | 'chest' = 'chest', loft = 1.18) {
  const e = aliveEnemies(w)[0]!;
  const p = targetPoint(e, where);
  return solveShot(w, p.x, p.y - (where === 'head' ? 6 : 0), loft);
}

function withCards(cards: CardId[], seed = 3): World {
  const w = createWorld({ seed });
  w.cards.push(...cards);
  w.stats = statsFor(w.cards, w.meta);
  return w;
}

describe('flow', () => {
  it('the title is the first shot: shooting in the title starts wave 1', () => {
    const w = createWorld({ seed: 1 });
    expect(w.phase).toBe('title');
    expect(w.enemies.length).toBe(1);
    run(w, 2);
    expect(w.enemies[0]!.brain).toBe('wait'); // nobody shoots at the title
    expect(w.run.enemyShots).toBe(0);
    const s = aimAtEnemy(w);
    expect(shoot(w, s.angle, s.power)).toBe(true);
    expect(w.phase).toBe('play');
    expect(w.wave).toBe(1);
  });

  it('clearing a wave offers three cards; picking one starts the next wave', () => {
    const w = createWorld({ seed: 2 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 3);
    expect(ev.some((e) => e.t === 'ko')).toBe(true);
    expect(ev.some((e) => e.t === 'waveClear')).toBe(true);
    expect(w.phase).toBe('cards');
    expect(w.offer.length).toBe(3);
    expect(reroll(w)).toBe(true);
    expect(reroll(w)).toBe(false); // one reroll without the upgrade
    expect(addExtraCard(w)).toBe(true);
    expect(w.offer.length).toBe(4);
    const card = w.offer[3]!;
    expect(pickCard(w, 3)).toBe(true);
    expect(w.cards).toContain(card);
    expect(w.wave).toBe(2);
    expect(w.phase).toBe('play');
    expect(w.enemies.length).toBe(2);
  });

  it('death → over; revive once with half health', () => {
    const w = createWorld({ seed: 5 });
    shoot(w, -0.2, 0.1); // a miss starts the run
    w.player.hp = 1;
    // stand still and let the wave-1 archer shoot until it lands one
    for (let i = 0; i < 60 * 40 && w.phase !== 'over'; i++) advance(w, 1 / 60);
    expect(w.phase).toBe('over');
    expect(w.player.alive).toBe(false);
    expect(revive(w)).toBe(true);
    expect(w.player.alive).toBe(true);
    expect(w.player.hp).toBe(Math.ceil(w.player.maxHp / 2));
    expect(w.phase).toBe('play');
    w.player.hp = 0.5;
    for (let i = 0; i < 60 * 40 && w.phase !== 'over'; i++) advance(w, 1 / 60);
    expect(revive(w)).toBe(false);
  });
});

describe('knockouts', () => {
  it('a headshot knocks out a regular archer and asks for slow motion', () => {
    const w = createWorld({ seed: 7 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.5);
    const hit = ev.find((e) => e.t === 'hit');
    expect(hit && hit.t === 'hit' && hit.part).toBe('head');
    expect(hit && hit.t === 'hit' && hit.slowmo).toBe(true);
    expect(ev.find((e) => e.t === 'ko')).toMatchObject({ cause: 'head' });
  });

  it('falling off a ledge counts as a knockout', () => {
    const w = createWorld({ seed: 8 });
    shoot(w, -0.2, 0.05);
    const e = w.enemies[0]!;
    const L = w.ledges[e.ledge]!;
    // shove the stance past the edge, as repeated leg hits do
    e.anchorX = L.x + L.w + 30;
    e.body.pin[PT.footF] = 0;
    e.body.pin[PT.footB] = 0;
    e.falling = TUNING.dt;
    const ev = run(w, 3);
    expect(ev.find((x) => x.t === 'ko')).toMatchObject({ cause: 'fall' });
    expect(e.alive).toBe(false);
  });

  it('leg hits shove an archer toward the edge', () => {
    const w = createWorld({ seed: 9 });
    const e = w.enemies[0]!;
    const before = e.anchorX;
    const b = e.body;
    const shin = { x: (b.x[PT.kneeB]! + b.x[PT.footB]!) / 2, y: (b.y[PT.kneeB]! + b.y[PT.footB]!) / 2 };
    const s = solveShot(w, shin.x, shin.y);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1);
    const hit = ev.find((x) => x.t === 'hit');
    expect(hit && hit.t === 'hit' && hit.part).toBe('leg');
    expect(e.anchorX).toBeGreaterThan(before);
  });

  it('knocked-out archers poof into feathers and their arrows go with them', () => {
    const w = createWorld({ seed: 2 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 6);
    expect(ev.some((e) => e.t === 'poof')).toBe(true);
    expect(w.arrows.some((a) => a.active && a.state === 2 && a.host === w.enemies[0]?.id)).toBe(false);
  });

  it('arrows stick in what they hit and ride along with the body', () => {
    const w = createWorld({ seed: 11 });
    const s = aimAtEnemy(w, 'chest');
    shoot(w, s.angle, s.power);
    run(w, 0.8);
    const stuck = w.arrows.find((a) => a.active && a.state === 2);
    expect(stuck).toBeDefined();
    const e = w.enemies[0]!;
    const dx0 = stuck!.x - e.body.x[PT.neck]!;
    const dy0 = stuck!.y - e.body.y[PT.neck]!;
    addVelocity(e.body, PT.neck, 300, 0, TUNING.dt);
    run(w, 0.1);
    // still near the same spot of the body
    expect(Math.hypot(stuck!.x - e.body.x[PT.neck]! - dx0, stuck!.y - e.body.y[PT.neck]! - dy0)).toBeLessThan(40);
  });
});

describe('cards in play', () => {
  const count = (w: World) => w.arrows.filter((a) => a.active && a.owner === 'player').length;
  it('double fires a second arrow a beat later; split fans out', () => {
    const w = withCards(['double', 'split']);
    shoot(w, -0.6, 0.4);
    expect(count(w)).toBe(3);
    run(w, 0.2);
    expect(count(w)).toBe(6);
  });
  it('heavy arrows deal more damage', () => {
    const plain = createWorld({ seed: 3 });
    const heavy = withCards(['heavy']);
    for (const w of [plain, heavy]) {
      const s = aimAtEnemy(w, 'chest');
      shoot(w, s.angle, s.power);
    }
    const a = run(plain, 1).find((e) => e.t === 'hit');
    const b = run(heavy, 1).find((e) => e.t === 'hit');
    expect(a && a.t === 'hit' && b && b.t === 'hit').toBe(true);
    if (a?.t === 'hit' && b?.t === 'hit') expect(b.dmg).toBeCloseTo(a.dmg * 1.3, 1);
  });
  it('fire arrows burn for a few seconds', () => {
    const w = withCards(['fire']);
    w.enemies[0]!.hp = 1000;
    const s = aimAtEnemy(w, 'chest');
    shoot(w, s.angle, s.power);
    const ev = run(w, 3);
    expect(ev.filter((e) => e.t === 'burn').length).toBeGreaterThanOrEqual(4);
  });
  it('piercing arrows pass through; bouncing arrows bounce off ledges', () => {
    const p = withCards(['pierce']);
    p.enemies[0]!.hp = 1000;
    const s = aimAtEnemy(p, 'chest');
    shoot(p, s.angle, s.power);
    run(p, 0.8);
    expect(p.arrows.some((a) => a.active && a.state === 2)).toBe(false);
    const b = withCards(['bounce']);
    shoot(b, 0.9, 0.3); // straight down into the player's own ledge
    const ev = run(b, 1);
    expect(ev.some((e) => e.t === 'bounce')).toBe(true);
  });
  it('the shield eats one hit per wave; vampire heals on hits', () => {
    const w = withCards(['shield', 'vampire']);
    w.shieldLeft = 1;
    shoot(w, -0.2, 0.05);
    const hp0 = w.player.hp;
    let blocked = false;
    for (let i = 0; i < 60 * 30 && !blocked; i++) {
      advance(w, 1 / 60);
      blocked = w.events.some((e) => e.t === 'blocked');
    }
    expect(blocked).toBe(true);
    expect(w.player.hp).toBe(hp0);
    w.player.hp = 50;
    w.reload = 0;
    const s = aimAtEnemy(w, 'chest');
    shoot(w, s.angle, s.power);
    const ev = run(w, 1);
    expect(ev.some((e) => e.t === 'heal')).toBe(true);
  });
  it('apples heal when shot; magnet makes them bigger targets and worth more', () => {
    const w = withCards(['magnet']);
    shoot(w, -0.2, 0.05);
    w.player.hp = 40;
    w.appleTimer = 0;
    advance(w, 1 / 60);
    const ap = w.apples.find((a) => a.active)!;
    expect(ap).toBeDefined();
    ap.vx = 0;
    w.reload = 0;
    // a point 40 px off the apple still connects with the magnet card
    const s = solveShot(w, ap.x, ap.y + 40);
    shoot(w, s.angle, s.power);
    let heal = 0;
    for (let i = 0; i < 120; i++) {
      advance(w, 1 / 60);
      for (const e of w.events) if (e.t === 'apple') heal = e.heal;
    }
    expect(heal).toBe(Math.round(TUNING.appleHeal * 1.6));
  });
});

describe('enemies', () => {
  it('enemy aim solves land on the player when there is no error', () => {
    const w = createWorld({ seed: 4 });
    const e = w.enemies[0]!;
    const sol = enemyAimSolution(w, e);
    expect(Number.isFinite(sol.angle)).toBe(true);
    expect(Math.cos(sol.angle)).toBeLessThan(0); // shooting left
  });

  it('enemy accuracy by wave: hit rate on a standing player rises with the wave', () => {
    const rate = (wave: number): number => {
      let hits = 0;
      let shots = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld({ seed });
        w.wave = wave;
        shoot(w, -0.2, 0.05);
        w.player.hp = 1e9;
        w.player.maxHp = 1e9;
        for (let i = 0; i < 60 * 25; i++) {
          advance(w, 1 / 60);
          for (const ev of w.events) if (ev.t === 'playerHit') hits++;
        }
        shots += w.run.enemyShots;
      }
      return hits / shots;
    };
    const r1 = rate(1);
    const r12 = rate(12);
    expect(enemyAccuracy(1).angle).toBeGreaterThan(enemyAccuracy(12).angle);
    expect(r1).toBeGreaterThan(0.15); // wave 1 is not harmless …
    expect(r1).toBeLessThan(0.75); // … but misses a fair share
    expect(r12).toBeGreaterThan(r1);
  }, 60_000);
});

describe('determinism and stability', () => {
  it('same seed and same inputs give the same run', () => {
    const play = () => {
      const w = createWorld({ seed: 42 });
      const rng = createRng(9);
      const log: string[] = [];
      for (let i = 0; i < 60 * 30; i++) {
        if (i % 50 === 0) shoot(w, -0.3 - rng.next() * 0.6, rng.next());
        if (w.phase === 'cards') pickCard(w, 0);
        advance(w, 1 / 60);
        for (const e of w.events) log.push(JSON.stringify(e));
      }
      return { log, hp: w.player.hp, wave: w.wave, x: Array.from(w.player.body.x) };
    };
    expect(play()).toEqual(play());
  });

  it('a long brawl keeps every ragdoll intact', () => {
    const w = createWorld({ seed: 6 });
    const rng = createRng(3);
    for (let i = 0; i < 60 * 120; i++) {
      if (i % 20 === 0) shoot(w, -0.2 - rng.next() * 0.9, rng.next());
      if (w.phase === 'cards') pickCard(w, 0);
      if (w.phase === 'over') break;
      advanceKeep(w, 1 / 60);
      w.events.length = 0;
      for (const a of [w.player, ...w.enemies]) {
        expect(maxStickError(a.body)).toBeLessThan(0.25);
        expect(Number.isFinite(a.body.x[0]!)).toBe(true);
      }
    }
  });
});

describe('balance (scripted players over many seeds)', () => {
  const SEEDS = 30;
  const runs = (p: typeof CARELESS) => Array.from({ length: SEEDS }, (_, i) => playRun(i + 1, createRng(1000 + i + 1), p));
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

  it('careless player (rough aim, 25 % power error): clears wave 1 nearly always, reaches about wave 3–5', () => {
    const r = runs(CARELESS);
    const waves = r.map((x) => x.wave);
    expect(waves.filter((x) => x >= 2).length / SEEDS).toBeGreaterThanOrEqual(0.9);
    expect(median(waves)).toBeGreaterThanOrEqual(3);
    expect(median(waves)).toBeLessThanOrEqual(6);
    expect(r.filter((x) => x.firstKoShot >= 1 && x.firstKoShot <= 3).length / SEEDS).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('careful player (solves the arc, small error): reaches about wave 10–15', () => {
    const r = runs(CAREFUL);
    const waves = r.map((x) => x.wave);
    expect(median(waves)).toBeGreaterThanOrEqual(10);
    expect(median(waves)).toBeLessThanOrEqual(15);
    expect(r.every((x) => x.firstKoShot >= 1 && x.firstKoShot <= 3)).toBe(true);
    expect(Math.max(...waves)).toBeLessThan(40); // no endless runs
  }, 120_000);
});

describe('late game', () => {
  it('when every card is maxed the run goes straight on to the next wave', () => {
    const w = createWorld({ seed: 12 });
    const all: CardId[] = [];
    for (const [id, c] of Object.entries(CARDS)) for (let i = 0; i < c.max; i++) all.push(id as CardId);
    w.cards.push(...all);
    w.stats = statsFor(w.cards, w.meta);
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    run(w, 4);
    expect(w.phase).toBe('play');
    expect(w.wave).toBe(2);
  });
});
