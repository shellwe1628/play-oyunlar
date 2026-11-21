import { describe, expect, it } from 'vitest';
import { bowDamage } from '../../src/sim/bow';
import { ARMORED_RESIST, ENEMY_DAMAGE, HARD_HEAD_MUL, resolveHit } from '../../src/sim/combat';
import { createRng } from '@oyun/core/pure';
import { CARD_IDS, CARD_WEAPONS, HARD_BOW_POW, cardFits, drawOffer, statsFor, type CardId } from '../../src/sim/cards';
import { NO_META } from '../../src/sim/meta';
import { CAREFUL, playRun, solveShot } from '../../src/sim/aimbot';
import { CHAPTERS, chapterStart, ENDLESS_WAVE, STAGES, stageDef, stageEnemies } from '../../src/sim/chapters';
import { velX } from '../../src/sim/body';
import { PLAYER_LEDGE, PLAYER_X, TUNING } from '../../src/sim/tuning';
import { arrowSpeed, BOOM, createWorld, playerOrigin, ROCKET, rocketRadius, shoot, advance, jumpToWave, takeEvents, targetPoint, type World } from '../../src/sim/world';
import { WEAPON_IDS, WEAPONS, bowEquivalent, levelForBow, weaponDamage, weaponPerks } from '../../src/sim/weapons';

describe('weapons', () => {
  it('weapon damage runs 1.00 → 3.30 over levels 1…20, monotonic', () => {
    expect(weaponDamage(1)).toBe(1);
    expect(weaponDamage(20)).toBeCloseTo(3.3, 2);
    for (let l = 2; l <= 20; l++) expect(weaponDamage(l)).toBeGreaterThan(weaponDamage(l - 1));
  });
  it('old bow levels map to a level with at least the same damage', () => {
    for (let n = 0; n <= 25; n++) expect(weaponDamage(levelForBow(n))).toBeGreaterThanOrEqual(bowDamage(n) - 1e-9);
    expect(levelForBow(0)).toBe(1);
    expect(levelForBow(25)).toBe(20);
    expect(bowEquivalent(20)).toBe(25);
    for (let n = 0; n <= 25; n++) expect(bowEquivalent(levelForBow(n))).toBeGreaterThanOrEqual(n);
  });
  it('every weapon except the bow is unlocked by a different boss', () => {
    const bosses = WEAPON_IDS.filter((id) => id !== 'bow').map((id) => WEAPONS[id].unlockBoss);
    expect(new Set(bosses).size).toBe(5);
  });
  it('sling head hit equals a chest hit under the hard rules; others keep the head bonus', () => {
    expect(WEAPONS.sling.headMul * ENEMY_DAMAGE.head * HARD_HEAD_MUL).toBeCloseTo(ENEMY_DAMAGE.body, 9);
    for (const id of WEAPON_IDS) if (id !== 'sling') expect(WEAPONS[id].headMul).toBe(1);
    expect(WEAPONS.crossbow.windMul).toBe(0.4);
  });
  it('perks are neutral at level 1 and never decrease', () => {
    for (const id of WEAPON_IDS) {
      const p1 = weaponPerks(id, 1);
      expect(p1.pierce).toBe(WEAPONS[id].pierce);
      expect(p1.bounces).toBe(WEAPONS[id].bounces);
      expect(p1.reloadMul).toBe(1);
      expect(p1.returnSpeedMul).toBe(1);
      expect(p1.blastRadiusMul).toBe(1);
      for (let l = 2; l <= 20; l++) {
        const a = weaponPerks(id, l - 1);
        const b = weaponPerks(id, l);
        expect(b.pierce).toBeGreaterThanOrEqual(a.pierce);
        expect(b.bounces).toBeGreaterThanOrEqual(a.bounces);
        expect(b.reloadMul).toBeLessThanOrEqual(a.reloadMul);
        expect(b.returnSpeedMul).toBeGreaterThanOrEqual(a.returnSpeedMul);
        expect(b.blastRadiusMul).toBeGreaterThanOrEqual(a.blastRadiusMul);
      }
    }
  });
});

describe('weapon stats', () => {
  it('hard stats follow the weapon', () => {
    const bow = statsFor([], NO_META, 'hard');
    const xbow = statsFor([], { ...NO_META, weapon: 'crossbow', wlevel: 1 }, 'hard');
    expect(xbow.reload).toBeCloseTo(bow.reload * 1.6, 9);
    expect(xbow.projectile).toBe('bolt');
    expect(xbow.speedMul).toBe(1.3);
    expect(xbow.gravityMul).toBe(0.45);
    const spear = statsFor([], { ...NO_META, weapon: 'spear', wlevel: 10 }, 'hard');
    expect(spear.dmgMul).toBeCloseTo(weaponDamage(10) ** HARD_BOW_POW * 1.35, 9);
    expect(spear.pierce).toBe(weaponPerks('spear', 10).pierce);
    expect(spear.pierce).toBe(2);
    const sling = statsFor(['bounce'], { ...NO_META, weapon: 'sling', wlevel: 10 }, 'hard');
    expect(sling.bounces).toBe(1 + 2 + 1);
    expect(sling.headMul).toBe(WEAPONS.sling.headMul);
    const ignored = statsFor([], { ...NO_META, bow: 25, weapon: 'bow', wlevel: 1 }, 'hard');
    expect(ignored.dmgMul).toBe(1);
    expect(ignored.weapon).toBe('bow');
  });
  it('crossbow perk and weapon reload multiply', () => {
    const x = statsFor([], { ...NO_META, weapon: 'crossbow', wlevel: 20 }, 'hard');
    expect(x.reload).toBeCloseTo(statsFor([], NO_META, 'hard').reload * 1.6 * weaponPerks('crossbow', 20).reloadMul, 9);
  });
  it('classic ignores weapons', () => {
    const base = statsFor(['heavy', 'pierce'], { ...NO_META, bow: 7 });
    const spear = statsFor(['heavy', 'pierce'], { ...NO_META, bow: 7, weapon: 'spear', wlevel: 15 });
    expect(spear).toEqual(base);
    expect(base.weapon).toBe('bow');
    expect(base.projectile).toBe('arrow');
    expect(base.speedMul).toBe(1);
    expect(base.gravityMul).toBe(1);
    expect(base.headMul).toBe(1);
  });
  it('hard shots spawn the weapon projectile with its speed, gravity and wind', () => {
    const w = createWorld({ seed: 3, meta: { ...NO_META, weapon: 'crossbow', wlevel: 1 }, difficulty: 'hard' });
    const wb = createWorld({ seed: 3, meta: NO_META, difficulty: 'hard' });
    expect(shoot(w, -0.3, 1)).toBe(true);
    expect(shoot(wb, -0.3, 1)).toBe(true);
    const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
    const b = wb.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(a.kind).toBe('bolt');
    expect(a.gravityMul).toBe(0.45);
    expect(a.windMul).toBe(0.4);
    expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(Math.hypot(b.vx, b.vy) * 1.3, 6);
    expect(b.kind).toBe('arrow');
    expect(b.gravityMul).toBe(1);
    expect(b.windMul).toBe(1);
    const [ay0, by0] = [a.vy, b.vy];
    advance(w, 0.03);
    advance(wb, 0.03);
    expect((a.vy - ay0) / (b.vy - by0)).toBeCloseTo(0.45, 3);
  });
});

describe('bolt and spear behaviour', () => {
  const hard = (weapon: 'bow' | 'crossbow' | 'spear', seed = 3) => createWorld({ seed, difficulty: 'hard', meta: { ...NO_META, weapon, wlevel: 1 } });

  it('bolt flies flatter: after 0.3 s it has dropped less than half as much as an arrow', () => {
    const drop = (weapon: 'bow' | 'crossbow'): number => {
      const w = hard(weapon);
      expect(shoot(w, -1.2, 0.6)).toBe(true);
      const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
      const [y0, vy0] = [a.y, a.vy];
      for (let i = 0; i < 18; i++) advance(w, 1 / 60);
      expect(a.active && a.state === 0).toBe(true);
      return a.y - (y0 + vy0 * 0.3);
    };
    const d = drop('crossbow');
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.5 * drop('bow'));
  });

  it('spear is thrown with pierce, a hard shove and a 1.2 s life', () => {
    const ws = hard('spear');
    const wa = hard('bow');
    expect(shoot(ws, -0.3, 1)).toBe(true);
    expect(shoot(wa, -0.3, 1)).toBe(true);
    const s = ws.arrows.find((x) => x.active && x.owner === 'player')!;
    const a = wa.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(s.kind).toBe('spear');
    expect(s.pierce).toBe(1);
    expect(s.impulseMul).toBeGreaterThanOrEqual(2 * a.impulseMul);
    expect(s.life).toBe(1.2);
    expect(a.life).toBe(5);
  });

  it('one spear damages two archers in line; an arrow stops at the first', () => {
    const POWER = 0.5;
    const throwAt = (weapon: 'bow' | 'spear') => {
      const w = hard(weapon);
      jumpToWave(w, 6);
      const [a, b] = w.enemies.filter((e) => e.alive);
      expect(a && b).toBeTruthy();
      // B stands on A's ledge, 30 px further from the player
      b!.ledge = a!.ledge;
      b!.anchorY = a!.anchorY;
      b!.anchorX = b!.stanceX = a!.anchorX + 30;
      for (let i = 0; i < 90; i++) {
        for (const e of w.enemies) {
          e.timer = 999;
          e.hp = e.maxHp = 1e6;
          e.shield = null; // nothing but flesh in the way
        }
        advance(w, 1 / 60);
      }
      takeEvents(w);
      // the throw whose flight (this weapon's speed and gravity, wind included) crosses A's chest while descending
      const c = targetPoint(a!, 'chest');
      const speed = arrowSpeed(POWER) * w.stats.speedMul;
      const g = TUNING.gravity * (weapon === 'spear' ? WEAPONS.spear.gravityMul : 1);
      let best = { err: Infinity, angle: -1 };
      for (let ang = -1.4; ang < 0; ang += 0.0005) {
        const o = playerOrigin(w, ang);
        const vx = Math.cos(ang) * speed;
        const vy = Math.sin(ang) * speed;
        // time to reach x = c.x (wind ignored in the root, then corrected below)
        let t = (c.x - o.x) / vx;
        for (let k = 0; k < 4; k++) t = (c.x - o.x - 0.5 * w.wind * WEAPONS[weapon].windMul * t * t) / vx;
        const y = o.y + vy * t + 0.5 * g * t * t;
        const err = Math.abs(y - c.y) + (vy + g * t < 0 ? 1e3 : 0);
        if (err < best.err) best = { err, angle: ang };
      }
      w.reload = 0;
      expect(shoot(w, best.angle, POWER)).toBe(true);
      const hits = new Set<number>();
      const meanVx = () => a!.body.x.reduce((acc, _x, k) => acc + velX(a!.body, k, 1 / 60), 0) / a!.body.n;
      let shove = 0;
      for (let i = 0; i < 90; i++) {
        for (const e of w.enemies) {
          e.hp = e.maxHp = 1e6;
          e.shield = null; // nothing but flesh in the way
        }
        const before = meanVx();
        advance(w, 1 / 60);
        for (const ev of takeEvents(w)) {
          if (ev.t !== 'hit') continue;
          if (ev.id === a!.id && shove === 0) shove = meanVx() - before;
          hits.add(ev.id);
        }
      }
      return { ids: [a!.id, b!.id], hits, shove };
    };
    const sp = throwAt('spear');
    expect(sp.hits.has(sp.ids[0]!)).toBe(true);
    expect(sp.hits.has(sp.ids[1]!)).toBe(true);
    const bw = throwAt('bow');
    expect(bw.hits.has(bw.ids[0]!)).toBe(true);
    expect(bw.hits.has(bw.ids[1]!)).toBe(false);
    // the measured shove: A's mean body velocity change on the hit frame, same seed, setup and aim point
    expect(bw.shove).toBeGreaterThan(0);
    // the shove scales with arrow velocity, so the spear's impulseMul is set above 2 to make up for its 0.9 speed
    expect(sp.shove).toBeGreaterThanOrEqual(2 * bw.shove);
  });
});

describe('sling pebbles', () => {
  const slingWorld = (seed = 3) => createWorld({ seed, difficulty: 'hard', meta: { ...NO_META, weapon: 'sling', wlevel: 1 } });
  const fire = (w: ReturnType<typeof createWorld>) => {
    w.wind = 0;
    expect(shoot(w, -0.3, 1)).toBe(true);
    return w.arrows.find((x) => x.active && x.owner === 'player')!;
  };

  it('pebble bounces twice off a ledge face (0.7 restitution) and the third contact ends it', () => {
    const w = slingWorld();
    const p = fire(w);
    expect(p.kind).toBe('pebble');
    expect(p.bounces).toBe(2);
    const L = w.ledges.find((l) => l.x > 300)!;
    const IN_VX = 420;
    const contacts: { vxAfter: number; active: boolean; state: number }[] = [];
    for (let c = 0; c < 3; c++) {
      // aim it flat at the ledge's left face, just in front of it
      p.x = L.x - 3;
      p.y = L.y + L.h / 2;
      p.vx = IN_VX;
      p.vy = 0;
      p.gravityMul = 0;
      p.fromLedge = -1;
      takeEvents(w);
      advance(w, 1 / 60);
      contacts.push({ vxAfter: p.vx, active: p.active, state: p.state });
    }
    expect(contacts[0]!.vxAfter).toBeCloseTo(-0.7 * IN_VX, 3);
    expect(contacts[0]!.active).toBe(true);
    expect(contacts[1]!.vxAfter).toBeCloseTo(-0.7 * IN_VX, 3);
    expect(contacts[1]!.active).toBe(true);
    expect(contacts[2]!.active).toBe(false);
    expect(contacts[2]!.state).toBe(0); // never stuck
  });

  it('the bounce card adds a third pebble bounce; an arrow with the card keeps its old bounce, then sticks', () => {
    const w = slingWorld();
    w.cards.push('bounce');
    w.stats = statsFor(w.cards, w.meta, 'hard');
    const p = fire(w);
    expect(p.bounces).toBe(3);
    const L = w.ledges.find((l) => l.x > 300)!;
    let bounced = 0;
    for (let c = 0; c < 4; c++) {
      p.x = L.x - 3;
      p.y = L.y + L.h / 2;
      p.vx = 420;
      p.vy = 0;
      p.gravityMul = 0;
      p.fromLedge = -1;
      advance(w, 1 / 60);
      if (p.active) bounced++;
    }
    expect(bounced).toBe(3);
    expect(p.active).toBe(false);

    const wb = createWorld({ seed: 3, difficulty: 'hard', meta: NO_META });
    wb.cards.push('bounce');
    wb.stats = statsFor(wb.cards, wb.meta, 'hard');
    wb.wind = 0;
    expect(shoot(wb, -0.3, 1)).toBe(true);
    const a = wb.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(a.kind).toBe('arrow');
    for (let c = 0; c < 2; c++) {
      a.x = L.x - 3;
      a.y = L.y + L.h / 2;
      a.vx = 420;
      a.vy = 0;
      a.gravityMul = 0;
      a.fromLedge = -1;
      advance(wb, 1 / 60);
      if (c === 0) expect(a.vx).toBeCloseTo(-420 * 0.78 * 0.92, 3);
    }
    expect(a.state).toBe(1); // stuck in the ledge after its one bounce
  });

  it('a pebble glances off the shield (0.7), damages the shield and never sticks', () => {
    const w = slingWorld();
    jumpToWave(w, 6);
    const e = w.enemies.find((q) => q.alive && q.shield && q.shieldOn)!;
    expect(e).toBeTruthy();
    for (let i = 0; i < 90; i++) {
      for (const q of w.enemies) {
        q.timer = 999;
        q.hp = q.maxHp = 1e6;
      }
      advance(w, 1 / 60);
    }
    const p = fire(w);
    takeEvents(w);
    const mid = (e.shield!.y[0]! + e.shield!.y[1]!) / 2;
    const run = (): { ev: string[]; vx: number } => {
      // flat at the shield's face from the player's side
      p.x = e.shield!.x[0]! - 20;
      p.y = mid;
      p.vx = 400;
      p.vy = 0;
      p.gravityMul = 0;
      p.fromLedge = -1;
      p.ignore = -1;
      advance(w, 1 / 60);
      return { ev: takeEvents(w).map((x) => x.t), vx: p.vx };
    };
    const hp0 = e.shieldHp;
    const hits0 = w.run.hits;
    const r1 = run();
    expect(r1.ev).toContain('shieldHit');
    expect(r1.ev).toContain('bounce');
    expect(r1.vx).toBeCloseTo(-0.7 * 400, 3);
    expect(p.active && p.state === 0).toBe(true);
    expect(e.shieldHp).toBeLessThan(hp0);
    expect(w.run.hits).toBe(hits0 + 1);
    run();
    expect(p.active && p.state === 0).toBe(true);
    // third contact: no bounce left, so it ends instead of sticking to the shield
    run();
    expect(p.active).toBe(false);
    expect(p.state).toBe(0);
  });

  it('a pebble that bounced then hits an unshielded archer still hurts him, is spent, and the bounce is no miss', () => {
    const w = slingWorld();
    jumpToWave(w, 6);
    const e = w.enemies.find((q) => q.alive && !q.shield)!;
    for (let i = 0; i < 90; i++) {
      for (const q of w.enemies) {
        q.timer = 999;
        q.hp = q.maxHp = 1e6;
      }
      advance(w, 1 / 60);
    }
    const p = fire(w);
    takeEvents(w);
    w.run.chain = 3;
    p.primary = true;
    p.scored = false;
    const L = w.ledges.find((l) => l.x > 300)!;
    p.x = L.x - 3;
    p.y = L.y + L.h / 2;
    p.vx = 420;
    p.vy = 0;
    p.gravityMul = 0;
    p.fromLedge = -1;
    advance(w, 1 / 60);
    expect(takeEvents(w).some((x) => x.t === 'bounce')).toBe(true);
    expect(p.active).toBe(true);
    expect(w.run.chain).toBe(3); // a bounce in flight is not a miss
    const c = targetPoint(e, 'chest');
    p.x = c.x - 4;
    p.y = c.y;
    p.vx = 400;
    p.vy = 0;
    p.gravityMul = 0;
    p.bounces = 0;
    const hp0 = e.hp;
    advance(w, 1 / 60);
    expect(takeEvents(w).some((x) => x.t === 'hit' && x.id === e.id)).toBe(true);
    expect(e.hp).toBeLessThan(hp0);
    expect(p.active).toBe(false);
    expect(p.state).toBe(0);
  });

  it('a pebble bounce off a shield is no miss either', () => {
    const w = slingWorld();
    jumpToWave(w, 6);
    const e = w.enemies.find((q) => q.alive && q.shield && q.shieldOn)!;
    for (let i = 0; i < 90; i++) {
      for (const q of w.enemies) {
        q.timer = 999;
        q.hp = q.maxHp = 1e6;
      }
      advance(w, 1 / 60);
    }
    const p = fire(w);
    w.run.chain = 3;
    p.primary = true;
    p.scored = false;
    p.x = e.shield!.x[0]! - 20;
    p.y = (e.shield!.y[0]! + e.shield!.y[1]!) / 2;
    p.vx = 400;
    p.vy = 0;
    p.gravityMul = 0;
    advance(w, 1 / 60);
    expect(p.active).toBe(true);
    expect(w.run.chain).toBe(3);
  });

  it('a pebble that hits an archer is spent, not stuck in him', () => {
    const w = slingWorld();
    jumpToWave(w, 6);
    const e = w.enemies.find((q) => q.alive && !q.shield)!;
    for (let i = 0; i < 90; i++) {
      for (const q of w.enemies) {
        q.timer = 999;
        q.hp = q.maxHp = 1e6;
      }
      advance(w, 1 / 60);
    }
    const p = fire(w);
    takeEvents(w);
    const c = targetPoint(e, 'chest');
    p.x = c.x - 4;
    p.y = c.y;
    p.vx = 400;
    p.vy = 0;
    p.gravityMul = 0;
    advance(w, 1 / 60);
    expect(takeEvents(w).some((x) => x.t === 'hit' && x.id === e.id)).toBe(true);
    expect(p.active && p.state !== 0).toBe(false);
  });
});

describe('boomerang', () => {
  type W = ReturnType<typeof createWorld>;
  const boomWorld = (wlevel = 1, seed = 3) => createWorld({ seed, difficulty: 'hard', meta: { ...NO_META, weapon: 'boomerang', wlevel } });
  const freeze = (w: W) => {
    for (const e of w.enemies) {
      e.timer = 999;
      e.hp = e.maxHp = 1e6;
      e.shield = null;
    }
  };
  /** Fire one boomerang up and away from every archer and follow it until it ends (or 4 s pass). */
  const flight = (w: W, angle: number, power: number) => {
    w.wind = 0;
    const hp0 = w.player.hp;
    expect(shoot(w, angle, power)).toBe(true);
    const b = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(b.kind).toBe('boomerang');
    const o = playerOrigin(w, w.player.aim);
    const [x0, y0, sp0] = [b.x, b.y, Math.hypot(b.vx, b.vy)];
    const dir = Math.atan2(b.vy, b.vx);
    let far = { d: 0, t: 0 };
    let t = 0;
    let off = 0; // largest distance from the launch line during the first 0.3 s
    let sp03 = 0;
    const ev: string[] = [];
    takeEvents(w);
    while (b.active && t < 4) {
      advance(w, 1 / 120);
      t += 1 / 120;
      for (const e of takeEvents(w)) ev.push(e.t);
      if (!b.active) break;
      expect(b.state).toBe(0);
      const d = Math.hypot(b.x - o.x, b.y - o.y);
      if (d > far.d) far = { d, t };
      if (t <= 0.3) off = Math.max(off, Math.abs(-(b.x - x0) * Math.sin(dir) + (b.y - y0) * Math.cos(dir)));
      if (Math.abs(t - 0.3) < 1e-6) sp03 = Math.hypot(b.vx, b.vy);
    }
    return { b, o, t, far, off, sp0, sp03, ev, hurt: hp0 - w.player.hp };
  };

  it('boomerang returns to the player', () => {
    for (const power of [0.4, 1]) {
      const w = boomWorld();
      const f = flight(w, -1.25, power);
      // no gravity: straight along the launch line on the way out, slowing down
      expect(f.off).toBeLessThan(1);
      expect(f.sp03).toBeLessThan(f.sp0);
      // it turns at BOOM.turnBase + BOOM.turnPower × power s, far from the player
      expect(f.far.t).toBeCloseTo(BOOM.turnBase + BOOM.turnPower * power, 1);
      expect(f.far.d).toBeGreaterThan(150);
      // back within 2.5 s, ended within 60 px of the bow, and the player is untouched
      expect(f.b.active).toBe(false);
      expect(f.t).toBeLessThanOrEqual(2.5);
      expect(Math.hypot(f.b.x - f.o.x, f.b.y - f.o.y)).toBeLessThan(60);
      expect(f.hurt).toBe(0);
      expect(f.ev).not.toContain('playerHit');
      // the catch is announced exactly once
      expect(f.ev.filter((t) => t === 'boomCatch')).toHaveLength(1);
    }
  });

  it('a boomerang that ends any other way is not caught', () => {
    const w = boomWorld();
    w.wind = 0;
    expect(shoot(w, -1.25, 1)).toBe(true);
    const b = w.arrows.find((x) => x.active && x.owner === 'player')!;
    takeEvents(w);
    // out of time before it is back
    b.life = 0.05;
    const ev: string[] = [];
    for (let t = 0; t < 0.5 && b.active; t += 1 / 120) {
      advance(w, 1 / 120);
      for (const e of takeEvents(w)) ev.push(e.t);
    }
    expect(b.active).toBe(false);
    expect(ev).not.toContain('boomCatch');
  });

  it('the blast card burst is not a rocket', () => {
    const w = createWorld({ seed: 3, difficulty: 'hard', meta: { ...NO_META } });
    w.cards.push('blast');
    w.stats = statsFor(w.cards, w.meta, w.difficulty);
    expect(w.stats.blastShare).toBeGreaterThan(0);
    w.phase = 'play';
    w.wind = 0;
    for (const e of w.enemies) e.timer = 1e9;
    // straight down into the player's own ledge
    expect(shoot(w, 1.1, 0.2)).toBe(true);
    const ev: { t: string; rocket?: boolean }[] = [];
    for (let t = 0; t < 3; t += 1 / 120) {
      advance(w, 1 / 120);
      ev.push(...takeEvents(w));
    }
    const blasts = ev.filter((e) => e.t === 'blast');
    expect(blasts.length).toBeGreaterThan(0);
    for (const e of blasts) expect(e.rocket).toBe(false);
  });

  it('the return perk brings it back sooner', () => {
    const slow = flight(boomWorld(1), -1.25, 1);
    const fast = flight(boomWorld(20), -1.25, 1);
    expect(slow.b.active).toBe(false);
    expect(fast.b.active).toBe(false);
    expect(fast.t - fast.far.t).toBeLessThan(0.9 * (slow.t - slow.far.t));
  });

  it('a boomerang that hits nobody breaks the headshot chain only when it ends', () => {
    const w = boomWorld();
    w.wind = 0;
    expect(shoot(w, -1.25, 1)).toBe(true);
    const b = w.arrows.find((x) => x.active && x.owner === 'player')!;
    w.run.chain = 3;
    for (let i = 0; i < 120 && b.active; i++) advance(w, 1 / 120);
    expect(b.active).toBe(true);
    expect(w.run.chain).toBe(3);
    for (let i = 0; i < 480 && b.active; i++) advance(w, 1 / 120);
    expect(b.active).toBe(false);
    expect(w.run.chain).toBe(0);
  });

  it('boomerang hits on the way out and back', () => {
    const w = boomWorld();
    jumpToWave(w, 6);
    w.wind = 0;
    w.walls.length = 0;
    for (let i = 0; i < 90; i++) {
      freeze(w);
      advance(w, 1 / 60);
    }
    const e = w.enemies.find((q) => q.alive)!;
    const c = targetPoint(e, 'chest');
    // aim straight at the chest; pick the power whose turn point lies 25 px past it
    let angle = -0.3;
    for (let k = 0; k < 5; k++) {
      const o = playerOrigin(w, angle);
      angle = Math.atan2(c.y - o.y, c.x - o.x);
    }
    const o = playerOrigin(w, angle);
    const want = Math.hypot(c.x - o.x, c.y - o.y) + 25;
    let power = 0;
    for (let p = 0; p <= 1; p += 0.001) if (Math.abs((arrowSpeed(p) * (BOOM.turnBase + BOOM.turnPower * p)) / 2 - want) < Math.abs((arrowSpeed(power) * (BOOM.turnBase + BOOM.turnPower * power)) / 2 - want)) power = p;
    w.reload = 0;
    takeEvents(w);
    expect(shoot(w, angle, power)).toBe(true);
    const b = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(b.kind).toBe('boomerang');
    const hp0 = e.hp;
    let hits = 0;
    let hpAfterFirst = 0;
    for (let i = 0; i < 360 && b.active; i++) {
      for (const q of w.enemies) {
        q.timer = 999;
        q.shield = null;
      }
      advance(w, 1 / 120);
      for (const ev of takeEvents(w)) {
        if (ev.t === 'hit' && ev.id === e.id) {
          hits++;
          if (hits === 1) {
            hpAfterFirst = e.hp;
            // a hit does not end it: it flies on
            expect(b.active && b.state === 0).toBe(true);
          }
        }
      }
    }
    expect(hits).toBe(2);
    expect(hpAfterFirst).toBeLessThan(hp0);
    expect(e.hp).toBeLessThan(hpAfterFirst);
    expect(b.active).toBe(false);
    expect(b.state).toBe(0);
  });

  it('boomerang flies over a ledge corner onto the archer behind it; an arrow on that line sticks in the ledge; the player is never hurt', () => {
    /** One shot straight at an archer's chest with a ledge corner across the line (ledge 1 moved there). */
    const throwPast = (weapon: 'boomerang' | 'bow') => {
      const w = createWorld({ seed: 3, difficulty: 'hard', meta: { ...NO_META, weapon, wlevel: 1 } });
      jumpToWave(w, 6);
      w.wind = 0;
      w.walls.length = 0;
      for (let i = 0; i < 90; i++) {
        freeze(w);
        advance(w, 1 / 60);
      }
      const e = w.enemies.find((q) => q.alive)!;
      const c = targetPoint(e, 'chest');
      let angle = -0.3;
      for (let k = 0; k < 5; k++) {
        const o = playerOrigin(w, angle);
        angle = Math.atan2(c.y - o.y, c.x - o.x);
      }
      const o = playerOrigin(w, angle);
      // a ledge whose top-right corner sits 12 px below the line, 55 % of the way there: the
      // line crosses its top face
      const L = w.ledges.find((l, i) => i > 0 && i !== e.ledge)!;
      const mx = o.x + (c.x - o.x) * 0.55;
      const my = o.y + (c.y - o.y) * 0.55;
      L.x = mx - L.w + 30;
      L.y = my - 12 + 30 * Math.tan(angle);
      const d = Math.hypot(c.x - o.x, c.y - o.y);
      let power = 1;
      if (weapon === 'boomerang') {
        for (let p = 0; p <= 1; p += 0.001) if (Math.abs((arrowSpeed(p) * (BOOM.turnBase + BOOM.turnPower * p)) / 2 - (d + 25)) < Math.abs((arrowSpeed(power) * (BOOM.turnBase + BOOM.turnPower * power)) / 2 - (d + 25))) power = p;
      }
      w.reload = 0;
      takeEvents(w);
      const hp0 = w.player.hp;
      // a near-flat full-power arrow along the same line (gravity bends it little over this distance)
      expect(shoot(w, angle, power)).toBe(true);
      const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
      if (weapon === 'bow') a.gravityMul = 0;
      let hit = false;
      for (let i = 0; i < 480 && a.active && a.state === 0; i++) {
        freeze(w);
        advance(w, 1 / 120);
        for (const ev of takeEvents(w)) if (ev.t === 'hit' && ev.id === e.id) hit = true;
      }
      return { hit, a, hurt: hp0 - w.player.hp, ledge: w.ledges.indexOf(L) };
    };
    const arrow = throwPast('bow');
    // the corner really is in the way: the arrow stops in that ledge
    expect(arrow.hit).toBe(false);
    expect(arrow.a.state).toBe(1);
    expect(arrow.a.host).toBe(arrow.ledge);
    const boom = throwPast('boomerang');
    expect(boom.hit).toBe(true);
    expect(boom.hurt).toBe(0);
    expect(boom.a.state).toBe(0);
  });

  it('boomerang cleared on wave change', () => {
    const w = boomWorld();
    w.wind = 0;
    expect(shoot(w, -0.2, 0.8)).toBe(true);
    const b = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(b.kind).toBe('boomerang');
    advance(w, 0.25);
    expect(b.active && b.state === 0).toBe(true);
    jumpToWave(w, 6);
    expect(w.arrows.some((x) => x.active && x.owner === 'player' && x.kind === 'boomerang')).toBe(false);
    takeEvents(w);
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      advance(w, 1 / 120);
      for (const ev of takeEvents(w)) if (ev.t === 'hit') hits++;
    }
    expect(hits).toBe(0);
  });
});

describe('firework rocket', () => {
  type W = ReturnType<typeof createWorld>;
  const rocketWorld = (wlevel = 1, seed = 3) => {
    const w = createWorld({ seed, difficulty: 'hard', meta: { ...NO_META, weapon: 'firework', wlevel } });
    jumpToWave(w, 6);
    w.wind = 0;
    w.walls.length = 0;
    return w;
  };
  const freeze = (w: W) => {
    for (const e of w.enemies) {
      e.timer = 999;
      e.hp = e.maxHp = 1e6;
      e.shield = null;
    }
  };
  const settle = (w: W) => {
    for (let i = 0; i < 90; i++) {
      freeze(w);
      advance(w, 1 / 60);
    }
    freeze(w);
    w.reload = 0;
    takeEvents(w);
  };
  /** Aim at a point (ignoring the rocket's slight drop). */
  const aimAt = (w: W, tx: number, ty: number) => {
    let angle = -0.3;
    for (let k = 0; k < 5; k++) {
      const o = playerOrigin(w, angle);
      angle = Math.atan2(ty - o.y, tx - o.x);
    }
    const o = playerOrigin(w, angle);
    return { angle, o, d: Math.hypot(tx - o.x, ty - o.y) };
  };
  const powerFor = (speed: number) => (speed - TUNING.speedMin) / (TUNING.speedMax - TUNING.speedMin);
  /** Run until the rocket ends; report the burst events, who lost hp and the rocket's age at the end. */
  const run = (w: W, rocket: W['arrows'][number], seconds = 2) => {
    const hp0 = new Map(w.enemies.map((e) => [e.id, e.hp]));
    const blasts: Extract<ReturnType<typeof takeEvents>[number], { t: 'blast' }>[] = [];
    const all: string[] = [];
    let t = 0;
    while (rocket.active && t < seconds) {
      freeze(w);
      for (const e of w.enemies) hp0.set(e.id, hp0.get(e.id) ?? e.hp);
      advance(w, 1 / 120);
      t += 1 / 120;
      for (const ev of takeEvents(w)) {
        all.push(ev.t);
        if (ev.t === 'blast') blasts.push(ev);
      }
    }
    return { blasts, t, all, hp0 };
  };
  /** Enemy ids in the middle distance, nearest first (the caller tries each in a fresh world until a shot has a clear line). */
  const candidates = (): number[] => {
    const w = rocketWorld();
    settle(w);
    const o0 = playerOrigin(w, -0.2);
    return w.enemies
      .filter((e) => e.alive)
      .map((e) => ({ id: e.id, d: Math.hypot(targetPoint(e, 'chest').x - o0.x, targetPoint(e, 'chest').y - o0.y) }))
      .filter((q) => q.d > 300 && q.d < 780)
      .sort((p, q) => p.d - q.d)
      .map((q) => q.id);
  };
  /** Fire at a candidate (power chosen so the fuse ends on it, or full power) in a fresh world; null when something is in the way. */
  const shotAt = (id: number, fuse: boolean, chain = 0) => {
    const w = rocketWorld();
    settle(w);
    const c = targetPoint(w.enemies.find((q) => q.id === id)!, 'chest');
    const aim = aimAt(w, c.x, c.y);
    // the fuse ends 60 px short of the archer: well inside the burst radius, but no contact
    const power = fuse ? powerFor((aim.d - 60) / ROCKET.fuse) : 1;
    if (power > 1) return null;
    w.run.chain = chain;
    expect(shoot(w, aim.angle, power)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(r.kind).toBe('rocket');
    const hp0 = w.player.hp;
    const out = run(w, r);
    return { w, r, out, c, hp0 };
  };
  const firstShot = (fuse: boolean, ok: (s: NonNullable<ReturnType<typeof shotAt>>) => boolean, chain = 0) => {
    for (const id of candidates()) {
      const s = shotAt(id, fuse, chain);
      if (s && ok(s)) return s;
    }
    throw new Error('no clear shot at any archer');
  };

  it('rocket bursts after its fuse', () => {
    // a shot that reaches the end of its fuse with nothing in the way
    const { w, r, out, hp0 } = firstShot(true, (s) => s.out.blasts.length === 1 && s.out.t > 0.4 && !s.out.all.includes('hit'));
    expect(r.active).toBe(false);
    expect(r.state).toBe(0);
    const b = out.blasts[0]!;
    // the burst says it is a rocket's (the view sizes its firework from `r`)
    expect(b.rocket).toBe(true);
    expect(b.r).toBe(rocketRadius(w));
    expect(out.t).toBeLessThan(ROCKET.fuse + 0.07);
    // every archer within the radius took damage; those clearly outside took none
    let inside = 0;
    for (const q of w.enemies) {
      const t = targetPoint(q, 'chest');
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      const lost = (out.hp0.get(q.id) ?? q.hp) - q.hp;
      if (d <= b.r) {
        expect(lost, `archer ${q.id} at ${d.toFixed(0)} px`).toBeGreaterThan(0);
        inside += 1;
      } else if (d > b.r + 20 * q.scale + 1) expect(lost).toBe(0);
    }
    expect(inside).toBeGreaterThan(0);
    expect(w.player.hp).toBe(hp0);
    expect(out.all).not.toContain('playerHit');
  });

  it('rocket bursts on contact early', () => {
    // full power: it reaches an archer long before the fuse is out
    const { w, r, out, c } = firstShot(false, (s) => s.out.all.includes('hit'));
    expect(r.active).toBe(false);
    expect(out.blasts.length).toBe(1);
    expect(out.t).toBeLessThan(0.4);
    // it never sticks: no stuck arrow left behind
    expect(w.arrows.some((x) => x.active && x.owner === 'player' && x.state !== 0)).toBe(false);
    expect(Math.hypot(out.blasts[0]!.x - c.x, out.blasts[0]!.y - c.y)).toBeLessThan(250);
  });

  it('rocket expires off-field', () => {
    const w = rocketWorld();
    settle(w);
    const hp0 = w.player.hp;
    expect(shoot(w, -Math.PI / 2, 1)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(r.kind).toBe('rocket');
    // fired straight up and far, it is near the top of the field when it is nudged over the edge: gone, no burst
    advance(w, 0.3);
    expect(r.active).toBe(true);
    r.y = 20;
    takeEvents(w);
    const out = run(w, r);
    expect(r.active).toBe(false);
    expect(out.blasts.length).toBe(0);
    expect(out.t).toBeLessThan(0.1);
    expect(w.player.hp).toBe(hp0);
    expect(out.all).not.toContain('playerHit');
  });

  it('a rocket fired straight up bursts in the air and never hurts the player', () => {
    const w = rocketWorld();
    settle(w);
    const hp0 = w.player.hp;
    expect(shoot(w, -Math.PI / 2, 1)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    const out = run(w, r);
    expect(out.blasts.length).toBe(1);
    expect(w.player.hp).toBe(hp0);
    expect(out.all).not.toContain('playerHit');
  });

  it('the burst radius grows with the perk and never hurts the player', () => {
    const radius = (wlevel: number) => {
      const w = rocketWorld(wlevel);
      settle(w);
      const hp0 = w.player.hp;
      expect(shoot(w, -0.2, 0.6)).toBe(true);
      const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
      const out = run(w, r);
      expect(out.blasts.length).toBe(1);
      expect(w.player.hp).toBe(hp0);
      return out.blasts[0]!.r;
    };
    const r1 = radius(1);
    const r20 = radius(20);
    expect(r20 / r1).toBeCloseTo(weaponPerks('firework', 20).blastRadiusMul, 5);
    expect(r20).toBeGreaterThan(r1);
  });

  it('a rocket that burst on nobody breaks the headshot chain; one that damaged keeps it', () => {
    const w = rocketWorld();
    settle(w);
    w.run.chain = 3;
    expect(shoot(w, -1.25, 0.5)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    const out = run(w, r);
    expect(out.blasts.length).toBe(1);
    // aimed high into the air: nobody in the radius, so the chain breaks
    expect(w.run.chain).toBe(0);

    const s2 = firstShot(true, (s) => s.out.blasts.length === 1 && s.out.t > 0.4 && !s.out.all.includes('hit'), 3);
    expect(s2.w.run.chain).toBe(3);
  });

  it('rocket cleared on wave change', () => {
    const w = rocketWorld();
    expect(shoot(w, -0.2, 0.8)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(r.kind).toBe('rocket');
    advance(w, 0.1);
    expect(r.active).toBe(true);
    jumpToWave(w, 7);
    expect(w.arrows.some((x) => x.active && x.owner === 'player' && x.kind === 'rocket')).toBe(false);
    takeEvents(w);
    let blasts = 0;
    for (let i = 0; i < 120; i++) {
      advance(w, 1 / 120);
      for (const ev of takeEvents(w)) if (ev.t === 'blast') blasts++;
    }
    expect(blasts).toBe(0);
  });
});

describe('cards per weapon', () => {
  const hardMeta = (weapon: (typeof WEAPON_IDS)[number]) => ({ ...NO_META, weapon, wlevel: 1 });

  it('offers respect weapon', () => {
    for (const weapon of WEAPON_IDS) {
      const seen = new Set<CardId>();
      for (let seed = 1; seed <= 500; seed++) {
        const rng = createRng(seed);
        // a hand of a few random cards, then a treasure-sized offer
        const held = drawOffer(rng, [], seed % 5, Infinity, weapon);
        const offer = drawOffer(rng, held, 4, Infinity, weapon);
        expect(offer.length).toBe(4);
        for (const c of [...held, ...offer]) {
          expect(cardFits(c, weapon), `${c} offered for ${weapon}`).toBe(true);
          seen.add(c);
        }
      }
      // nothing that fits is left out of the pool
      for (const c of CARD_IDS) expect(seen.has(c), `${c} for ${weapon}`).toBe(cardFits(c, weapon));
    }
  });

  it('the bow fits every card and draws exactly as before', () => {
    for (const c of CARD_IDS) expect(cardFits(c, 'bow')).toBe(true);
    for (let seed = 1; seed <= 200; seed++) {
      const a = createRng(seed);
      const b = createRng(seed);
      expect(drawOffer(a, ['heavy'], 3, seed % 7, 'bow')).toEqual(drawOffer(b, ['heavy'], 3, seed % 7));
    }
  });

  it('the table: rockets get no split, double, seeker, bounce, blast; boomerangs no overdraw, bounce, pierce, seeker', () => {
    for (const c of ['split', 'double', 'seeker', 'bounce', 'blast', 'pierce', 'longsight'] as const) expect(cardFits(c, 'firework')).toBe(false);
    for (const c of ['overdraw', 'bounce', 'pierce', 'seeker'] as const) expect(cardFits(c, 'boomerang')).toBe(false);
    expect(cardFits('bounce', 'sling')).toBe(true);
    expect(cardFits('blast', 'boomerang')).toBe(true);
    // CARD_WEAPONS never lists the bow out
    for (const ws of Object.values(CARD_WEAPONS)) expect(ws).toContain('bow');
  });

  it('a held card that does not fit leaves the hard stats unchanged', () => {
    for (const weapon of WEAPON_IDS) {
      const meta = hardMeta(weapon);
      const base = statsFor(['heavy', 'keen'], meta, 'hard');
      for (const c of CARD_IDS) {
        if (cardFits(c, weapon)) continue;
        expect(statsFor(['heavy', 'keen', c, c], meta, 'hard'), `${c} on ${weapon}`).toEqual(base);
      }
    }
    // the card still works where it fits
    expect(statsFor(['bounce'], hardMeta('sling'), 'hard').bounces).toBe(statsFor([], hardMeta('sling'), 'hard').bounces + 1);
    // classic is always the bow: every card counts
    expect(statsFor(['bounce'], hardMeta('firework')).bounces).toBe(1);
  });

  it('a rocket never bounces even with bounce cards held', () => {
    const w = createWorld({ seed: 4, meta: hardMeta('firework'), difficulty: 'hard' });
    w.cards.push('bounce', 'bounce', 'blast');
    w.stats = statsFor(w.cards, w.meta, 'hard');
    expect(w.stats.bounces).toBe(0);
    expect(w.stats.blastShare).toBe(0);
    expect(shoot(w, -0.2, 0.8)).toBe(true);
    const r = w.arrows.find((x) => x.active && x.owner === 'player')!;
    expect(r.kind).toBe('rocket');
    expect(r.bounces).toBe(0);
  });

  it('chapter-select drafts and the starter card only hold fitting cards', () => {
    for (const weapon of WEAPON_IDS) {
      for (let seed = 1; seed <= 40; seed++) {
        const w = createWorld({ seed, meta: { ...hardMeta(weapon), starter: 1 }, difficulty: 'hard', startChapter: 1 + (seed % 5) });
        expect(w.cards.length).toBeGreaterThan(1);
        for (const c of w.cards) expect(cardFits(c, weapon), `${c} drafted for ${weapon}`).toBe(true);
      }
    }
  });
});

describe('stage features (hard)', () => {
  const rng = () => createRng(7);
  const WAVES = Array.from({ length: CHAPTERS * STAGES }, (_, i) => i + 1);
  /** the chapter waves whose hard stage carries `mod` */
  const modWaves = (mod: string) => WAVES.filter((wave) => stageDef(wave, rng(), 'hard').mod === mod);
  const hold = (w: World) => {
    for (const e of w.enemies) e.timer = 999;
    w.player.hp = w.player.maxHp = 1e9;
  };

  it('armored resists arrows, not spears', () => {
    expect(ARMORED_RESIST).toBe(0.35);
    for (const part of ['head', 'body', 'arm', 'leg'] as const) {
      const plain = resolveHit('archer', part, 1.5, false, true).damage;
      for (const kind of ['arrow', 'bolt', 'pebble', 'boomerang'] as const) expect(resolveHit('armored', part, 1.5, false, true, kind).damage).toBeCloseTo(plain * 0.35, 1);
      for (const kind of ['spear', 'rocket'] as const) expect(resolveHit('armored', part, 1.5, false, true, kind).damage).toBeCloseTo(plain, 6);
    }
    // in the world: the same chest shot with an arrow and with a spear
    const hitWith = (weapon: 'bow' | 'spear') => {
      const w = createWorld({ seed: 2, difficulty: 'hard', meta: { ...NO_META, weapon, wlevel: 5 } });
      const wave = WAVES.find((v) => stageEnemies(v, stageDef(v, rng(), 'hard'), 9, 'hard').includes('armored'))!;
      jumpToWave(w, wave);
      hold(w);
      const e = w.enemies.find((x) => x.type === 'armored')!;
      expect(e).toBeDefined();
      for (let i = 0; i < 60; i++) advance(w, 1 / 60);
      takeEvents(w);
      e.hp = e.maxHp = 1e6;
      // nothing else in the way, and its ledge holds still
      for (const x of w.enemies) if (x !== e) x.gone = true;
      w.movers.length = 0;
      w.wind = 0;
      const c = targetPoint(e, 'chest');
      const s = solveShot(w, c.x, c.y, 1.04);
      w.reload = 0;
      expect(shoot(w, s.angle, s.power)).toBe(true);
      for (let i = 0; i < 120; i++) {
        advance(w, 1 / 60);
        for (const ev of takeEvents(w)) if (ev.t === 'hit' && ev.id === e.id) return ev.dmg / w.stats.dmgMul;
      }
      return 0;
    };
    const arrow = hitWith('bow');
    const spear = hitWith('spear');
    expect(arrow).toBeGreaterThan(0);
    expect(spear).toBeGreaterThan(2.5 * arrow);
  });

  it('armored enemies join from chapter 2, only in hard; the endless pool has them', () => {
    const has = (wave: number, d: 'classic' | 'hard') => stageEnemies(wave, stageDef(wave, rng(), d), 9, d).includes('armored');
    for (let wave = 1; wave < chapterStart(1); wave++) expect(has(wave, 'hard')).toBe(false);
    for (let c = 1; c < CHAPTERS; c++) expect(Array.from({ length: STAGES }, (_, i) => has(chapterStart(c) + i, 'hard')).some(Boolean), `chapter ${c + 1}`).toBe(true);
    const classic = createRng(3);
    for (let wave = 1; wave < ENDLESS_WAVE + 70; wave++) expect(stageDef(wave, classic, 'classic').enemies.includes('armored'), `classic wave ${wave}`).toBe(false);
    const r = createRng(3);
    let seen = false;
    for (let wave = ENDLESS_WAVE; wave < ENDLESS_WAVE + 70 && !seen; wave++) seen = stageDef(wave, r, 'hard').enemies.includes('armored');
    expect(seen).toBe(true);
  });

  it('one or two designed stages per chapter carry a modifier, only in hard', () => {
    for (let c = 0; c < CHAPTERS; c++) {
      const mods = Array.from({ length: STAGES }, (_, i) => stageDef(chapterStart(c) + i, rng(), 'hard').mod).filter(Boolean);
      expect(mods.length, `chapter ${c + 1}`).toBeGreaterThanOrEqual(1);
      expect(mods.length, `chapter ${c + 1}`).toBeLessThanOrEqual(2);
      // never on the boss stage
      expect(stageDef(chapterStart(c) + STAGES - 1, rng(), 'hard').mod).toBeUndefined();
    }
    for (const mod of ['lowCeiling', 'fog', 'movingBase']) expect(modWaves(mod).length, mod).toBeGreaterThanOrEqual(2);
    for (const wave of WAVES) expect(stageDef(wave, rng(), 'classic').mod, `classic wave ${wave}`).toBeUndefined();
    const w = createWorld({ seed: 1, difficulty: 'classic' });
    for (const wave of modWaves('fog')) {
      jumpToWave(w, wave);
      expect(w.stageMod).toBeNull();
    }
  });

  it('low ceiling blocks high arcs', () => {
    const wave = modWaves('lowCeiling')[0]!;
    const w = createWorld({ seed: 4, difficulty: 'hard' });
    jumpToWave(w, wave);
    hold(w);
    expect(w.stageMod).toBe('lowCeiling');
    expect(Number.isFinite(w.ceiling)).toBe(true);
    // every archer's head is under it, with room for a flat shot
    for (const e of w.enemies) expect(targetPoint(e, 'head').y).toBeGreaterThan(w.ceiling + 40);
    // a steep lob: the arrow is gone as soon as it climbs above the ceiling
    expect(shoot(w, -1.25, 1)).toBe(true);
    const a = w.arrows.find((x) => x.active && x.owner === 'player')!;
    let top = Infinity;
    for (let i = 0; i < 120 && a.active; i++) {
      advance(w, 1 / 60);
      if (a.active) top = Math.min(top, a.y);
    }
    expect(a.active).toBe(false);
    expect(top).toBeGreaterThanOrEqual(w.ceiling);
    // a flat aimed shot still reaches every archer under it
    for (const e of w.enemies) {
      const h = targetPoint(e, 'head');
      expect(solveShot(w, h.x, h.y, 1.04).power).toBeLessThanOrEqual(1);
    }
    // the same lob with no ceiling flies on
    const open = createWorld({ seed: 4, difficulty: 'hard' });
    jumpToWave(open, wave);
    hold(open);
    open.ceiling = -Infinity;
    shoot(open, -1.25, 1);
    const b = open.arrows.find((x) => x.active && x.owner === 'player')!;
    for (let i = 0; i < 30; i++) advance(open, 1 / 60);
    expect(b.active).toBe(true);
  });

  it('fog: far archers appear late; until then they cannot be hit and do not shoot', () => {
    const wave = modWaves('fog')[0]!;
    const w = createWorld({ seed: 6, difficulty: 'hard' });
    jumpToWave(w, wave);
    w.player.hp = w.player.maxHp = 1e9;
    expect(w.stageMod).toBe('fog');
    const veiled = w.enemies.filter((e) => e.veil > 0);
    expect(veiled.length).toBeGreaterThan(0);
    // the farthest is veiled longest
    const far = [...veiled].sort((p, q) => q.veil - p.veil)[0]!;
    const e = far;
    const shots0 = w.run.enemyShots;
    const h = targetPoint(e, 'chest');
    const s = solveShot(w, h.x, h.y, 1.04);
    expect(shoot(w, s.angle, s.power)).toBe(true);
    let hitVeiled = false;
    let revealed = false;
    let shotVeiled = false;
    for (let i = 0; i < 60 * 8; i++) {
      const veiledNow = e.veil > 0;
      advance(w, 1 / 60);
      for (const ev of takeEvents(w)) {
        if (ev.t === 'hit' && ev.id === e.id && veiledNow) hitVeiled = true;
        if (ev.t === 'reveal' && ev.id === e.id) revealed = true;
      }
      if (w.enemies.every((x) => x.veil > 0) && w.run.enemyShots > shots0) shotVeiled = true;
    }
    expect(hitVeiled).toBe(false);
    expect(shotVeiled).toBe(false);
    expect(revealed).toBe(true);
    expect(e.veil).toBe(0);
  });

  it('moving base: the player ledge slides, the player and the aim origin ride it', () => {
    const wave = modWaves('movingBase')[0]!;
    const w = createWorld({ seed: 8, difficulty: 'hard' });
    jumpToWave(w, wave);
    hold(w);
    expect(w.stageMod).toBe('movingBase');
    const o0 = playerOrigin(w, -0.5).x;
    const xs: number[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      advance(w, 1 / 60);
      const dx = w.ledges[0]!.x - PLAYER_LEDGE.x;
      xs.push(dx);
      expect(w.baseX).toBeCloseTo(dx, 6);
      expect(playerOrigin(w, -0.5).x).toBeCloseTo(o0 + dx, 6);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
    // the player stands on it the whole time
    expect(Math.abs(w.player.anchorX - (PLAYER_X + w.baseX))).toBeLessThan(1e-6);
    // the next stage without the modifier glides it home
    jumpToWave(w, wave + 1);
    hold(w);
    for (let i = 0; i < 60 * 4; i++) advance(w, 1 / 60);
    expect(w.ledges[0]!.x).toBeCloseTo(PLAYER_LEDGE.x, 6);
    expect(w.baseX).toBeCloseTo(0, 6);
  });

  it('every stage is clearable with the bow', { timeout: 600_000 }, () => {
    // CAREFUL, bow level 10, god mode: each chapter's stages up to its boss
    for (let c = 0; c < CHAPTERS; c++) {
      const boss = chapterStart(c) + STAGES - 1;
      for (const seed of [1, 2]) {
        const r = playRun(seed, createRng(500 + seed), CAREFUL, { difficulty: 'hard', meta: { ...NO_META, weapon: 'bow', wlevel: 10 }, startChapter: c, untilWave: boss, god: true, maxTime: 900 });
        expect(r.reached, `chapter ${c + 1} seed ${seed}`).toBeGreaterThanOrEqual(boss);
      }
    }
  });
});
