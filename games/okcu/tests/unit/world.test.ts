import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CARELESS, CAREFUL, SLOW_HUMAN, playRun, solveShot, type Profile } from '../../src/sim/aimbot';
import { addVelocity, maxStickError, velX, velY } from '../../src/sim/body';
import { CARDS, statsFor, type CardId } from '../../src/sim/cards';
import { HELMET_HEAD_MUL, PLAYER_DAMAGE } from '../../src/sim/combat';
import { NO_META } from '../../src/sim/meta';
import { PT } from '../../src/sim/ragdoll';
import { TUNING } from '../../src/sim/tuning';
import { enemyAccuracy, enemyDamageMul } from '../../src/sim/waves';
import {
  addExtraCard,
  advance,
  aliveEnemies,
  createWorld,
  enemyAimSolution,
  jumpToWave,
  MAX_ADVANCE,
  pickCard,
  reroll,
  revive,
  shoot,
  takeEvents,
  targetPoint,
  type Archer,
  type GameEvent,
  type World,
} from '../../src/sim/world';

/** Step `seconds` at 60 Hz and return every event, each exactly once. */
function run(w: World, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    advance(w, 1 / 60);
    all.push(...takeEvents(w));
  }
  return all;
}

function of<T extends GameEvent['t']>(ev: GameEvent[], t: T): Extract<GameEvent, { t: T }>[] {
  return ev.filter((e) => e.t === t) as Extract<GameEvent, { t: T }>[];
}

/** A perfect shot at a point of the first live enemy. */
function aimAtEnemy(w: World, where: 'head' | 'chest' = 'chest', loft = 1.18) {
  const e = aliveEnemies(w)[0]!;
  const p = targetPoint(e, where);
  return solveShot(w, p.x, p.y - (where === 'head' ? 6 : 0), loft);
}

function shootAt(w: World, x: number, y: number, loft = 1.18): void {
  w.reload = 0;
  const s = solveShot(w, x, y, loft);
  expect(shoot(w, s.angle, s.power)).toBe(true);
}

function withCards(cards: CardId[], seed = 3): World {
  const w = createWorld({ seed });
  w.cards.push(...cards);
  w.stats = statsFor(w.cards, w.meta);
  return w;
}

/** Keep enemies from shooting back while a test aims at them. */
function calm(w: World): void {
  for (const e of w.enemies) e.timer = 999;
}

function mid(e: Archer, a: number, b: number): { x: number; y: number } {
  return { x: (e.body.x[a]! + e.body.x[b]!) / 2, y: (e.body.y[a]! + e.body.y[b]!) / 2 };
}

describe('event lifetime', () => {
  it("a shot's event survives the step after it and is delivered exactly once", () => {
    const w = createWorld({ seed: 1 });
    const s = aimAtEnemy(w);
    shoot(w, s.angle, s.power);
    advance(w, 1 / 60); // the scene steps after handling input
    const first = takeEvents(w);
    expect(of(first, 'shot').length).toBe(1);
    expect(of(first, 'waveStart')).toEqual([{ t: 'waveStart', wave: 1 }]);
    advance(w, 1 / 60);
    expect(of(takeEvents(w), 'shot').length).toBe(0);
  });

  it('wave 1 is announced once, when the first arrow flies (not at the title)', () => {
    const w = createWorld({ seed: 2 });
    expect(of(run(w, 1), 'waveStart').length).toBe(0);
    shoot(w, -0.2, 0.05);
    expect(of(run(w, 1), 'waveStart').length).toBe(1);
  });

  it('a long frame advances the sim by at most MAX_ADVANCE', () => {
    const w = createWorld({ seed: 2 });
    advance(w, 10);
    expect(MAX_ADVANCE).toBe(0.25);
    expect(w.time).toBeCloseTo(0.25, 2);
  });
});

describe('flow', () => {
  it('the title is the first shot: shooting in the title starts wave 1', () => {
    const w = createWorld({ seed: 1 });
    expect(w.phase).toBe('title');
    expect(w.enemies.length).toBe(1);
    run(w, 2);
    expect(w.run.enemyShots).toBe(0); // nobody shoots at the title
    const s = aimAtEnemy(w);
    expect(shoot(w, s.angle, s.power)).toBe(true);
    expect(w.phase).toBe('play');
    expect(w.wave).toBe(1);
  });

  it('the first target varies per run but stays close', () => {
    const spots = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld({ seed });
      const e = w.enemies[0]!;
      spots.add(`${Math.round(e.anchorX / 10)},${Math.round(e.anchorY / 10)}`);
      expect(e.anchorX).toBeLessThan(620);
      expect(e.anchorX).toBeGreaterThan(380);
      expect(e.anchorY + 52 * e.scale).toBeLessThanOrEqual(846);
    }
    expect(spots.size).toBeGreaterThanOrEqual(8);
  });

  it('clearing a wave offers three cards; one reroll; one extra card; picking starts the next wave', () => {
    const w = createWorld({ seed: 2 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 3.5);
    expect(of(ev, 'ko').length).toBe(1);
    expect(of(ev, 'waveClear').length).toBe(1);
    expect(w.phase).toBe('cards');
    expect(w.offer.length).toBe(3);
    expect(reroll(w)).toBe(true);
    expect(reroll(w)).toBe(false);
    expect(addExtraCard(w)).toBe(true);
    expect(addExtraCard(w)).toBe(false);
    expect(w.offer.length).toBe(4);
    const card = w.offer[3]!;
    expect(pickCard(w, 3)).toBe(true);
    expect(w.cards).toEqual([card]);
    expect(w.wave).toBe(2);
    expect(w.phase).toBe('play');
    expect(w.enemies.length).toBe(2);
  });

  it('wave clear heals exactly TUNING.waveClearHeal', () => {
    const w = createWorld({ seed: 2 });
    w.player.hp = 50;
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    run(w, 1.5);
    expect(TUNING.waveClearHeal).toBe(18);
    expect(w.player.hp).toBe(68);
  });

  it('permanent upgrades apply at world creation: starting card, second reroll, starting health', () => {
    const w = createWorld({ seed: 4, meta: { ...NO_META, starter: 1, reroll: 1, hp: 2 } });
    expect(w.cards.length).toBe(1);
    expect(w.rerollsLeft).toBe(2);
    expect(w.player.maxHp).toBe(130 + (w.cards[0] === 'vitality' ? 25 : 0));
    const plain = createWorld({ seed: 4 });
    expect(plain.cards.length).toBe(0);
    expect(plain.rerollsLeft).toBe(1);
    expect(plain.player.maxHp).toBe(100);
  });

  it('death → over; revive once with half health', () => {
    const w = createWorld({ seed: 5 });
    shoot(w, -0.2, 0.05);
    w.player.hp = 1;
    for (let i = 0; i < 60 * 60 && w.phase !== 'over'; i++) run(w, 1 / 60);
    expect(w.phase).toBe('over');
    expect(w.player.alive).toBe(false);
    expect(revive(w)).toBe(true);
    expect(w.player.alive).toBe(true);
    expect(w.player.hp).toBe(Math.ceil(w.player.maxHp / 2));
    expect(w.phase).toBe('play');
    w.player.hp = 0.5;
    for (let i = 0; i < 60 * 60 && w.phase !== 'over'; i++) run(w, 1 / 60);
    expect(revive(w)).toBe(false);
  });

  it('when every card is maxed the run goes straight on to the next wave', () => {
    const all: CardId[] = [];
    for (const [id, c] of Object.entries(CARDS)) for (let i = 0; i < c.max; i++) all.push(id as CardId);
    const w = withCards(all, 12);
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    run(w, 4);
    expect(w.phase).toBe('play');
    expect(w.wave).toBe(2);
  });
});

describe('hits and knockouts (through the real hit path)', () => {
  it('a headshot knocks out a regular archer and asks for slow motion; it pays the headshot bonus', () => {
    const w = createWorld({ seed: 7 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.5);
    const hit = of(ev, 'hit')[0]!;
    expect(hit.part).toBe('head');
    expect(hit.slowmo).toBe(true);
    const ko = of(ev, 'ko')[0]!;
    expect(ko.cause).toBe('head');
    expect(ko.coins).toBe(5); // 3 + floor(1/2) + 2 headshot bonus
  });

  it('a body knockout pays 3 coins on wave 1; the coin upgrade scales knockouts and wave clears', () => {
    const plain = createWorld({ seed: 7 });
    const rich = createWorld({ seed: 7, meta: { ...NO_META, coins: 2 } });
    for (const w of [plain, rich]) {
      const s = aimAtEnemy(w, 'chest');
      shoot(w, s.angle, s.power);
    }
    const a = run(plain, 1.5);
    const b = run(rich, 1.5);
    expect(of(a, 'hit')[0]!.part).toBe('body');
    expect(of(a, 'ko')[0]!.coins).toBe(3);
    expect(of(b, 'ko')[0]!.coins).toBe(Math.round(3 * 1.4));
    expect(of(a, 'waveClear')[0]!.coins).toBe(3);
    expect(of(b, 'waveClear')[0]!.coins).toBe(Math.round(3 * 1.4));
  });

  it('a helmeted veteran survives a headshot and loses exactly 64 health', () => {
    const w = createWorld({ seed: 7 });
    const e = w.enemies[0]!;
    e.helmet = true;
    e.hp = e.maxHp = 500;
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.5);
    const hit = of(ev, 'hit')[0]!;
    expect(hit.part).toBe('head');
    expect(hit.ko).toBe(false);
    expect(e.alive).toBe(true);
    expect(e.hp).toBeCloseTo(500 - 40 * HELMET_HEAD_MUL, 5);
  });

  it('wave-14+ enemies really spawn with helmets', () => {
    let helmets = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const w = createWorld({ seed });
      jumpToWave(w, 19);
      helmets += w.enemies.filter((e) => e.helmet).length;
    }
    expect(helmets).toBeGreaterThan(5);
  });

  it('an arm hit spoils that archer’s aim by exactly 0.05 rad', () => {
    const w = createWorld({ seed: 9 });
    calm(w);
    const e = w.enemies[0]!;
    e.aim = Math.PI - 0.25; // bow arm reaching down-left toward the player
    run(w, 1); // let the pose settle
    shootAt(w, e.body.x[PT.handF]! - 2, e.body.y[PT.handF]!);
    const hit = of(run(w, 1), 'hit')[0]!;
    expect(hit.part).toBe('arm');
    expect(e.aimPenalty).toBeCloseTo(0.05, 6);
  });

  it('a leg hit staggers and shoves the stance toward the arrow', () => {
    const w = createWorld({ seed: 9 });
    calm(w);
    const e = w.enemies[0]!;
    e.hp = e.maxHp = 500;
    const before = e.anchorX;
    const shin = mid(e, PT.kneeB, PT.footB);
    shootAt(w, shin.x, shin.y);
    let hit: Extract<GameEvent, { t: 'hit' }> | undefined;
    for (let i = 0; i < 90 && !hit; i++) hit = of(run(w, 1 / 60), 'hit')[0];
    expect(hit?.part).toBe('leg');
    expect(e.stagger).toBeGreaterThan(0.3);
    expect(e.anchorX - before).toBeCloseTo(TUNING.legShove, 5);
  });

  it('a leg hit next to the edge topples the archer: falling off counts as a knockout', () => {
    const w = createWorld({ seed: 9 });
    calm(w);
    const e = w.enemies[0]!;
    e.hp = e.maxHp = 500;
    const L = w.ledges[e.ledge]!;
    e.anchorX = e.stanceX = L.x + L.w - 18;
    run(w, 1); // settle on the new spot
    const shin = mid(e, PT.kneeB, PT.footB);
    shootAt(w, shin.x, shin.y);
    const ev = run(w, 3);
    expect(of(ev, 'hit')[0]?.part).toBe('leg');
    expect(of(ev, 'ko')[0]?.cause).toBe('fall');
    expect(e.alive).toBe(false);
  });

  it('knocked-out archers sometimes dangle from a ledge corner', () => {
    let dangles = 0;
    for (let seed = 1; seed <= 6 && dangles === 0; seed++) {
      const w = createWorld({ seed });
      const rng = createRng(seed);
      for (let i = 0; i < 60 * 90 && w.phase !== 'over'; i++) {
        if (w.phase === 'cards') pickCard(w, 0);
        if (i % 40 === 0) {
          const t = aliveEnemies(w)[0];
          if (t && (w.phase === 'title' || w.phase === 'play')) {
            const p = targetPoint(t, rng.chance(0.5) ? 'head' : 'chest');
            const s = solveShot(w, p.x, p.y);
            shoot(w, s.angle, s.power);
          }
        }
        run(w, 1 / 60);
        for (const e of w.enemies) if (!e.alive && e.dangle >= 0) dangles++;
      }
    }
    expect(dangles).toBeGreaterThan(0);
  });

  it('a knocked-out body takes no more damage (arrows still stick and shove it)', () => {
    const w = createWorld({ seed: 2 });
    const s = aimAtEnemy(w, 'head', 1.04);
    shoot(w, s.angle, s.power);
    for (let i = 0; i < 120 && w.run.kos === 0; i++) run(w, 1 / 60);
    const e = w.enemies[0]!;
    expect(e.alive).toBe(false);
    const after: GameEvent[] = [];
    for (let k = 0; k < 3; k++) {
      const p = targetPoint(e, 'chest');
      shootAt(w, p.x, p.y);
      after.push(...run(w, 0.5));
    }
    expect(of(after, 'hit').length).toBe(0);
    expect(of(after, 'ko').length).toBe(0);
    expect(of(after, 'bodyThunk').length).toBeGreaterThanOrEqual(1);
    expect(w.run.kos).toBe(1);
    expect(e.hp).toBe(0);
  });

  it('at most 10 arrows stay stuck in one body', () => {
    const w = createWorld({ seed: 11 });
    calm(w);
    const e = w.enemies[0]!;
    e.hp = e.maxHp = 1e9;
    for (let i = 0; i < 14; i++) {
      const p = targetPoint(e, 'chest');
      shootAt(w, p.x, p.y);
      run(w, 0.6);
    }
    expect(TUNING.stuckPerBody).toBe(10);
    expect(w.arrows.filter((a) => a.active && a.state === 2 && a.host === e.id).length).toBe(10);
  });

  it('arrows stick in what they hit and ride along with the body', () => {
    const w = createWorld({ seed: 11 });
    calm(w);
    w.enemies[0]!.hp = 1e9;
    const s = aimAtEnemy(w, 'chest');
    shoot(w, s.angle, s.power);
    run(w, 0.8);
    const stuck = w.arrows.find((a) => a.active && a.state === 2)!;
    expect(stuck).toBeDefined();
    const e = w.enemies[0]!;
    const dx0 = stuck.x - e.body.x[PT.neck]!;
    const dy0 = stuck.y - e.body.y[PT.neck]!;
    addVelocity(e.body, PT.neck, 300, 0, TUNING.dt);
    run(w, 0.1);
    expect(Math.hypot(stuck.x - e.body.x[PT.neck]! - dx0, stuck.y - e.body.y[PT.neck]! - dy0)).toBeLessThan(40);
  });

  it('a player arrow cannot pass through a ledge to hit an archer', () => {
    const w = createWorld({ seed: 11 });
    calm(w);
    const s = aimAtEnemy(w, 'chest');
    // a wall right in front of the archer
    const e = w.enemies[0]!;
    w.ledges.push({ x: e.anchorX - 90, y: 0, w: 30, h: 1100 });
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.2);
    expect(of(ev, 'hit').length).toBe(0);
    expect(of(ev, 'thunk').length).toBe(1);
  });

  it('an enemy arrow cannot pass through a ledge to hit the player', () => {
    const w = createWorld({ seed: 11 });
    shoot(w, -1.4, 0.1); // starts the run
    w.ledges.push({ x: 250, y: 0, w: 30, h: 1020 }); // wall between the archers
    const ev = run(w, 8);
    expect(of(ev, 'enemyShot').length).toBeGreaterThan(0);
    expect(of(ev, 'playerHit').length).toBe(0);
    expect(of(ev, 'thunk').filter((t) => t.owner === 'enemy').length).toBeGreaterThan(0);
  });

  it('a player arrow pops a bomb in flight', () => {
    const w = createWorld({ seed: 3 });
    calm(w);
    const b = w.arrows.find((a) => !a.active)!;
    Object.assign(b, { active: true, owner: 'enemy', kind: 'bomb', state: 0, x: 400, y: 600, vx: 0, vy: -400, life: 6, seq: 999 });
    shootAt(w, 400, 560);
    const ev = run(w, 1);
    const pop = of(ev, 'bomb')[0]!;
    expect(pop.popped).toBe(true);
    expect(pop.hurt).toBe(false);
    expect(b.active).toBe(false);
  });

  it('a planted shield breaks after two arrows and gets knocked away', () => {
    const w = createWorld({ seed: 3 });
    jumpToWave(w, 3);
    calm(w);
    const e = w.enemies[0]!;
    expect(e.type).toBe('shield');
    const sh = e.shield!;
    const mx = (sh.x[0]! + sh.x[1]!) / 2;
    const my = (sh.y[0]! + sh.y[1]!) * 0.5 + 10;
    shootAt(w, mx, my);
    const a = run(w, 1);
    expect(of(a, 'shieldHit')).toMatchObject([{ broke: false }]);
    shootAt(w, mx, my);
    const b = run(w, 1);
    expect(of(b, 'shieldHit')).toMatchObject([{ broke: true }]);
    expect(e.shieldOn).toBe(false);
    expect(e.alive).toBe(true);
  });

  it('heavy arrows shove harder (×1.35 impulse)', () => {
    const speed = (cards: CardId[]) => {
      const w = withCards(cards, 11);
      calm(w);
      const e = w.enemies[0]!;
      e.hp = 1e9;
      const s = aimAtEnemy(w, 'chest');
      shoot(w, s.angle, s.power);
      for (let i = 0; i < 120; i++) {
        run(w, 1 / 120);
        if (w.arrows.some((a) => a.active && a.state === 2)) break;
      }
      return Math.hypot(velX(e.body, PT.neck, TUNING.dt), velY(e.body, PT.neck, TUNING.dt));
    };
    expect(speed(['heavy']) / speed([])).toBeGreaterThan(1.2);
  });
});

describe('the player takes hits', () => {
  it('an enemy arrow does the table damage times the wave multiplier', () => {
    const w = createWorld({ seed: 6 });
    shoot(w, -1.4, 0.1);
    w.player.hp = w.player.maxHp = 1e6;
    const ev = run(w, 20);
    const hits = of(ev, 'playerHit');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.dmg).toBeCloseTo(PLAYER_DAMAGE[h.part] * enemyDamageMul(1), 6);
  });

  it("a wave's first volley never lands a headshot", () => {
    let firstHead = 0;
    let firsts = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const w = createWorld({ seed });
      jumpToWave(w, 2);
      w.player.hp = w.player.maxHp = 1e6;
      const ev = run(w, 4);
      const shots = of(ev, 'enemyShot').length;
      const hits = of(ev, 'playerHit');
      if (shots > 0 && hits.length > 0) {
        firsts += 1;
        if (hits[0]!.part === 'head') firstHead += 1;
      }
    }
    expect(firsts).toBeGreaterThan(5);
    expect(firstHead).toBe(0);
  });

  it('the bubble card blocks one hit per wave; snack hits heal on hits', () => {
    const w = withCards(['shield', 'vampire']);
    w.shieldLeft = 1;
    shoot(w, -1.4, 0.05);
    const hp0 = w.player.hp;
    let blocked = false;
    for (let i = 0; i < 60 * 30 && !blocked; i++) blocked = of(run(w, 1 / 60), 'blocked').length > 0;
    expect(blocked).toBe(true);
    expect(w.player.hp).toBe(hp0);
    expect(w.shieldLeft).toBe(0);
    w.player.hp = 50;
    const s = aimAtEnemy(w, 'chest');
    w.reload = 0;
    shoot(w, s.angle, s.power);
    const heals = of(run(w, 1), 'heal');
    expect(heals.some((h) => h.amount === 3)).toBe(true);
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
  it('heavy arrows deal 1.3× damage', () => {
    const plain = createWorld({ seed: 3 });
    const heavy = withCards(['heavy']);
    for (const w of [plain, heavy]) {
      const s = aimAtEnemy(w, 'chest');
      shoot(w, s.angle, s.power);
    }
    const a = of(run(plain, 1), 'hit')[0]!;
    const b = of(run(heavy, 1), 'hit')[0]!;
    expect(a.dmg).toBe(40);
    expect(b.dmg).toBeCloseTo(52, 5);
  });
  it('fire arrows burn: 14 dps for 3 s in 0.5 s ticks', () => {
    const w = withCards(['fire']);
    calm(w);
    w.enemies[0]!.hp = 1000;
    const s = aimAtEnemy(w, 'chest');
    shoot(w, s.angle, s.power);
    const burns = of(run(w, 4), 'burn');
    expect(burns.length).toBe(6);
    expect(burns[0]!.dmg).toBe(7);
  });
  it('piercing arrows pass through; bouncing arrows bounce off ledges', () => {
    const p = withCards(['pierce']);
    p.enemies[0]!.hp = 1000;
    const s = aimAtEnemy(p, 'chest');
    shoot(p, s.angle, s.power);
    run(p, 0.8);
    expect(p.arrows.some((a) => a.active && a.state === 2)).toBe(false);
    const b = withCards(['bounce']);
    shoot(b, 0.9, 0.3);
    expect(of(run(b, 1), 'bounce').length).toBe(1);
  });
  it('apples heal when shot; magnet makes them bigger targets and worth 40', () => {
    const w = withCards(['magnet']);
    shoot(w, -1.4, 0.05);
    w.player.hp = 40;
    w.appleTimer = 0;
    run(w, 1 / 60);
    const ap = w.apples.find((a) => a.active)!;
    expect(ap).toBeDefined();
    ap.vx = 0;
    shootAt(w, ap.x, ap.y + 40);
    let heal = 0;
    for (let i = 0; i < 120; i++) for (const e of of(run(w, 1 / 60), 'apple')) heal = e.heal;
    expect(heal).toBe(40);
  });
});

describe('enemies', () => {
  it('enemy aim solves shoot left at the player', () => {
    const w = createWorld({ seed: 4 });
    const sol = enemyAimSolution(w, w.enemies[0]!);
    expect(Number.isFinite(sol.angle)).toBe(true);
    expect(Math.cos(sol.angle)).toBeLessThan(0);
  });

  it('enemy accuracy by wave: hit rate on a standing player rises with the wave', () => {
    const rate = (wave: number): number => {
      let hits = 0;
      let shots = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld({ seed });
        jumpToWave(w, wave);
        w.player.hp = w.player.maxHp = 1e9;
        for (const ev of run(w, 25)) if (ev.t === 'playerHit') hits++;
        shots += w.run.enemyShots;
      }
      return hits / shots;
    };
    const r1 = rate(1);
    const r12 = rate(12);
    expect(enemyAccuracy(1).angle).toBeGreaterThan(enemyAccuracy(12).angle);
    expect(r1).toBeGreaterThan(0.1);
    expect(r1).toBeLessThan(0.6);
    expect(r12).toBeGreaterThan(r1 + 0.15);
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
        for (const e of run(w, 1 / 60)) log.push(JSON.stringify(e));
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
      run(w, 1 / 60);
      for (const a of [w.player, ...w.enemies]) {
        expect(maxStickError(a.body)).toBeLessThan(0.25);
        expect(Number.isFinite(a.body.x[0]!)).toBe(true);
      }
    }
  });
});

describe('balance (scripted players over many seeds)', () => {
  const SEEDS = 30;
  const runs = (p: Profile) => Array.from({ length: SEEDS }, (_, i) => playRun(i + 1, createRng(1000 + i + 1), p));
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const firstKoWithin3 = (r: { firstKoShot: number }[]) => r.filter((x) => x.firstKoShot >= 1 && x.firstKoShot <= 3).length / SEEDS;

  it('slow human (a shot every 2.5–3 s, 0.08 rad error): clears wave 3 in ≥ 90 %, median wave 4–6', () => {
    const r = runs(SLOW_HUMAN);
    const waves = r.map((x) => x.wave);
    expect(waves.filter((w) => w >= 4).length / SEEDS).toBeGreaterThanOrEqual(0.9);
    expect(median(waves)).toBeGreaterThanOrEqual(4);
    expect(median(waves)).toBeLessThanOrEqual(6);
    expect(firstKoWithin3(r)).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('careless player (rough aim, 25 % power error): clears wave 1 nearly always, reaches about wave 3–5', () => {
    const r = runs(CARELESS);
    const waves = r.map((x) => x.wave);
    expect(waves.filter((x) => x >= 2).length / SEEDS).toBeGreaterThanOrEqual(0.9);
    expect(median(waves)).toBeGreaterThanOrEqual(3);
    expect(median(waves)).toBeLessThanOrEqual(6);
    expect(firstKoWithin3(r)).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('careful player (solves the arc, small error): reaches about wave 10–15', () => {
    const r = runs(CAREFUL);
    const waves = r.map((x) => x.wave);
    expect(median(waves)).toBeGreaterThanOrEqual(10);
    expect(median(waves)).toBeLessThanOrEqual(15);
    expect(firstKoWithin3(r)).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...waves)).toBeLessThan(40);
  }, 120_000);
});
