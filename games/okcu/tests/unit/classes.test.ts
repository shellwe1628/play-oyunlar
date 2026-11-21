/**
 * The staff-carriers' spells (the healer used to never strike: the "wizards don't hit" bug), the
 * new enemy classes (volley archer, wizard), the new arrow cards (frost, blast) and the field
 * that grows from chapter 4 on.
 */
import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { solveShot } from '../../src/sim/aimbot';
import { CARD_IDS, cardOpen, drawOffer, statsFor, type CardId } from '../../src/sim/cards';
import { CHAPTER_DEFS, chapterStart, fieldRight, fieldSpan, fieldTop, GROW_WAVE, MAX_SPAN, stageDef, stageOf } from '../../src/sim/chapters';
import { NO_META } from '../../src/sim/meta';
import { LEG_HEIGHT } from '../../src/sim/ragdoll';
import { advance, createWorld, enemyAimSolution, jumpToWave, shoot, takeEvents, targetPoint, type Archer, type GameEvent, type World } from '../../src/sim/world';

function run(w: World, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    advance(w, 1 / 60);
    all.push(...takeEvents(w));
  }
  return all;
}

/** A wave whose stage lists `type`, with every other enemy held still (they never draw). */
function waveWith(type: Archer['type'], seed = 4, difficulty: 'classic' | 'hard' = 'classic'): { w: World; e: Archer } {
  for (let wave = 1; wave < chapterStart(6); wave++) {
    const p = stageOf(wave);
    if (!CHAPTER_DEFS[p.chapter]!.stages[p.stage - 1]!.enemies.includes(type as never)) continue;
    const w = createWorld({ seed, difficulty });
    jumpToWave(w, wave);
    takeEvents(w);
    const e = w.enemies.find((x) => x.type === type)!;
    for (const o of w.enemies) if (o !== e) o.timer = 1e9;
    w.shieldLeft = 0;
    return { w, e };
  }
  throw new Error(`no stage has ${type}`);
}

function hitsBy(ev: GameEvent[], id: number) {
  return ev.filter((x): x is Extract<GameEvent, { t: 'playerHit' }> => x.t === 'playerHit' && x.by === id);
}

describe('staff-carriers strike (the healer used to only glow its staff)', () => {
  it('a healer with nobody to mend hexes the player, and the hex lands and hurts', () => {
    for (const difficulty of ['classic', 'hard'] as const) {
      const { w, e } = waveWith('healer', 4, difficulty);
      const hp0 = w.player.hp;
      const ev = run(w, 14);
      const casts = ev.filter((x) => x.t === 'enemyShot' && x.id === e.id && x.kind === 'orb');
      expect(casts.length, difficulty).toBeGreaterThanOrEqual(2);
      const hits = hitsBy(ev, e.id);
      expect(hits.length, difficulty).toBeGreaterThanOrEqual(1);
      expect(hits[0]!.dmg).toBeGreaterThan(0);
      expect(w.player.hp).toBeLessThan(hp0);
    }
  });

  it('a healer with a wounded ally still mends it instead of casting', () => {
    const { w, e } = waveWith('healer');
    const ally = w.enemies.find((x) => x !== e)!;
    ally.hp = ally.maxHp * 0.5;
    e.timer = 0;
    const ev = run(w, 1.5);
    expect(ev.some((x) => x.t === 'healBeam' && x.from === e.id)).toBe(true);
    expect(ev.some((x) => x.t === 'enemyShot' && x.id === e.id)).toBe(false);
  });

  it("the warden's orbs leave its ledge instead of bursting on its edge", () => {
    const w = createWorld({ seed: 5 });
    jumpToWave(w, chapterStart(3) + 6);
    const boss = w.enemies[0]!;
    expect(boss.bossKind).toBe('warden');
    const L = w.ledges[boss.ledge]!;
    const ev = run(w, 8);
    const pops = ev.filter((x): x is Extract<GameEvent, { t: 'orbPop' }> => x.t === 'orbPop');
    expect(pops.length).toBeGreaterThan(0);
    for (const p of pops) expect(p.x > L.x - 6 && p.x < L.x + L.w + 6 && Math.abs(p.y - L.y) < 8, `${p.x},${p.y}`).toBe(false);
    expect(hitsBy(ev, boss.id).length).toBeGreaterThan(0);
  });
});

describe('new enemy classes', () => {
  it('wizards join in chapter 4 and volley archers in chapter 3, never earlier', () => {
    const first = (type: string) => CHAPTER_DEFS.findIndex((c) => c.stages.some((s) => s.enemies.includes(type as never)));
    expect(first('volley')).toBe(2);
    expect(first('mage')).toBe(3);
  });

  it("the wizard's hex homes in on the player and hurts", () => {
    const { w, e } = waveWith('mage');
    let turned = false;
    const ev: GameEvent[] = [];
    for (let t = 0; t < 14; t += 1 / 60) {
      const before = w.arrows.filter((a) => a.active && a.kind === 'orb' && a.hex && a.state === 0).map((a) => ({ a, ang: Math.atan2(a.vy, a.vx) }));
      advance(w, 1 / 60);
      ev.push(...takeEvents(w));
      for (const b of before) if (b.a.active && Math.abs(Math.atan2(b.a.vy, b.a.vx) - b.ang) > 1e-4) turned = true;
    }
    expect(turned).toBe(true);
    const hits = hitsBy(ev, e.id);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.dmg).toBeGreaterThan(0);
  });

  it('a wizard that is hit and survives blinks to another free, still ledge', () => {
    const { w, e } = waveWith('mage');
    e.hp = e.maxHp = 1e6;
    e.timer = 1e9;
    const from = e.ledge;
    const p = targetPoint(e, 'chest');
    w.reload = 0;
    const s = solveShot(w, p.x, p.y, 1.1);
    expect(shoot(w, s.angle, s.power)).toBe(true);
    const ev = run(w, 2);
    const blink = ev.find((x) => x.t === 'blink');
    expect(blink).toBeDefined();
    expect(e.ledge).not.toBe(from);
    expect(w.movers.some((m) => m.index === e.ledge)).toBe(false);
    const L = w.ledges[e.ledge]!;
    expect(Math.abs(e.anchorY - (L.y - LEG_HEIGHT * e.scale))).toBeLessThan(1);
    expect(e.stanceX).toBeGreaterThan(L.x);
    expect(e.stanceX).toBeLessThan(L.x + L.w);
    // it stands on its new ledge afterwards
    run(w, 2);
    expect(e.alive).toBe(true);
  });

  it('a volley archer lobs three arrows on a high arc that come down on the player', () => {
    const { w, e } = waveWith('volley');
    const sol = enemyAimSolution(w, e);
    // a high arc: launched upward, steeper than 45 degrees above the horizon
    expect(Math.sin(sol.angle)).toBeLessThan(-0.7);
    const before = w.run.enemyShots;
    const ev = run(w, 12);
    const shots = ev.filter((x) => x.t === 'enemyShot' && x.id === e.id).length;
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(w.run.enemyShots - before).toBe(shots * 3);
    const hits = hitsBy(ev, e.id);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('new arrow cards', () => {
  const one = (id: CardId, n = 1) => statsFor(Array<CardId>(n).fill(id), NO_META);

  it('frost and blast are offered from their chapters on (snow and desert), never in the first', () => {
    expect(CARD_IDS.slice(-2)).toEqual(['frost', 'blast']);
    expect(cardOpen('frost', 0)).toBe(false);
    expect(cardOpen('frost', 1)).toBe(true);
    expect(cardOpen('blast', 1)).toBe(false);
    expect(cardOpen('blast', 2)).toBe(true);
    const rng = createRng(9);
    for (let i = 0; i < 300; i++) {
      const o = drawOffer(rng, [], 3, 0);
      expect(o).not.toContain('frost');
      expect(o).not.toContain('blast');
    }
    const seen = new Set<CardId>();
    for (let i = 0; i < 300; i++) for (const c of drawOffer(rng, [], 3, 2)) seen.add(c);
    expect(seen.has('frost') && seen.has('blast')).toBe(true);
  });

  it('a real run only offers them once it reaches their chapter', () => {
    const w = createWorld({ seed: 3, startChapter: 1 });
    expect(w.cards).not.toContain('blast');
    expect(w.cards.length).toBe(5);
  });

  it('frost chills on hit: a chilled archer takes longer to draw', () => {
    expect(one('frost').frostTime).toBeGreaterThan(0);
    expect(one('frost', 2).frostSlow).toBeLessThan(one('frost').frostSlow);
    const w = createWorld({ seed: 2 });
    w.cards.push('frost');
    w.stats = statsFor(w.cards, w.meta);
    w.phase = 'play';
    const e = w.enemies[0]!;
    e.hp = e.maxHp = 1e6;
    const p = targetPoint(e, 'chest');
    const s = solveShot(w, p.x, p.y, 1.1);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.2);
    expect(ev.some((x) => x.t === 'chill' && x.id === e.id)).toBe(true);
    expect(e.chill).toBeGreaterThan(0);
    // chilled: a draw started now lasts longer than the plain draw time
    e.brain = 'wait';
    e.timer = 0;
    e.draw = 0;
    let steps = 0;
    while ((e.brain as string) !== 'draw' && steps++ < 200) advance(w, 1 / 120);
    let t = 0;
    while ((e.brain as string) === 'draw' && t < 10) {
      advance(w, 1 / 120);
      t += 1 / 120;
    }
    expect(t).toBeGreaterThan(1.2);
  });

  it('a blast arrow into a ledge hurts the archer standing on it; a shield does not stop the burst', () => {
    const w = createWorld({ seed: 2 });
    w.cards.push('blast', 'blast');
    w.stats = statsFor(w.cards, w.meta);
    w.phase = 'play';
    const e = w.enemies[0]!;
    e.timer = 1e9;
    const L = w.ledges[e.ledge]!;
    const hp0 = e.hp;
    // the ledge top a little in front of the archer's feet
    const s = solveShot(w, e.stanceX - 40, L.y + 1, 1.1);
    shoot(w, s.angle, s.power);
    const ev = run(w, 1.5);
    expect(ev.some((x) => x.t === 'thunk')).toBe(true);
    expect(ev.some((x) => x.t === 'hit' && x.id === e.id)).toBe(false);
    expect(ev.some((x) => x.t === 'blast')).toBe(true);
    expect(e.hp).toBeLessThan(hp0);

    const { w: w2, e: sh } = waveWith('shield');
    w2.cards.push('blast');
    w2.stats = statsFor(w2.cards, w2.meta);
    sh.timer = 1e9;
    const hp1 = sh.hp;
    const b = sh.shield!;
    const sp = solveShot(w2, (b.x[0]! + b.x[1]!) / 2, (b.y[0]! * 0.4 + b.y[1]! * 0.6), 1.04);
    w2.reload = 0;
    shoot(w2, sp.angle, sp.power);
    const ev2 = run(w2, 1.5);
    expect(ev2.some((x) => x.t === 'shieldHit' && x.id === sh.id)).toBe(true);
    expect(sh.hp).toBeLessThan(hp1);
  });
});

describe('the field grows from chapter 4', () => {
  it('span 1 up to chapter 3, bigger from chapter 4, bigger again from chapter 6 and in endless', () => {
    expect(GROW_WAVE).toBe(chapterStart(3));
    for (let wave = 1; wave < GROW_WAVE; wave++) expect(fieldSpan(wave)).toBe(1);
    expect(fieldSpan(GROW_WAVE)).toBeGreaterThan(1);
    expect(fieldSpan(chapterStart(5))).toBeGreaterThan(fieldSpan(GROW_WAVE));
    expect(fieldSpan(chapterStart(6) + 10)).toBe(MAX_SPAN);
  });

  it('past the threshold the islands spread wider and higher, often with a fifth, all inside the view and in reach', () => {
    let grown = 0;
    let fifth = 0;
    for (const difficulty of ['classic', 'hard'] as const) {
      // classic grows from chapter 4; hard (the 3D build) from chapter 2
      for (let wave = difficulty === 'hard' ? chapterStart(1) : GROW_WAVE - 1; wave <= chapterStart(6) + 7; wave++) {
        const w = createWorld({ seed: wave, difficulty });
        jumpToWave(w, wave);
        const span = w.span;
        expect(span).toBe(fieldSpan(wave, difficulty));
        const def = stageOf(wave);
        const base = !def.endless ? stageDef(wave, createRng(1), difficulty).ledges : null;
        if (span > 1) {
          // the fifth island needs the room of a 1.15 field (chapter 4 on)
          if (span >= 1.15) {
            if (w.layout.length > (base?.length ?? 4)) fifth += 1;
            grown += 1;
          }
          if (base) {
            // the stage's own islands sit further out on average, the highest one higher up
            const mean = (ls: readonly { x: number; y: number }[], k: 'x' | 'y') => ls.reduce((t, l) => t + l[k], 0) / ls.length;
            // (hard's first widenings, 1.05 and 1.1, have little room: a slide near the edge can
            // hold the spread back, but nothing ever comes closer)
            const small = span < 1.15;
            expect(mean(w.layout.slice(0, base.length), 'x'), `wave ${wave}`).toBeGreaterThan(mean(base, 'x') + (small ? -0.5 : 12));
            expect(Math.min(...w.layout.slice(0, base.length).map((l) => l.y)), `wave ${wave}`).toBeLessThan(Math.min(...base.map((l) => l.y)) + (small ? 0.5 : -25));
          }
        } else if (base) expect(w.layout.length).toBe(base.length);
        // every island (and how far it slides or swings) stays inside a portrait view of the field
        for (let i = 1; i < w.ledges.length; i++) {
          const L = w.ledges[i]!;
          const m = w.movers.find((q) => q.index === i);
          const amp = m && m.kind !== 'bob' ? m.amp : 0;
          expect(L.x - amp, `wave ${wave} ledge ${i}`).toBeGreaterThan(280);
          expect(L.x + L.w + amp, `wave ${wave} ledge ${i}`).toBeLessThan(fieldRight(span));
          expect(L.y - 200, `wave ${wave} ledge ${i}`).toBeGreaterThan(fieldTop(span));
        }
        // ropes hang from above the top of the view
        for (const m of w.movers) if (m.kind === 'swing') expect(m.pivotY).toBeLessThan(fieldTop(span));
        // every enemy stands on its own ledge, can be hit by the player and can shoot back
        expect(new Set(w.enemies.map((e) => e.ledge)).size).toBe(w.enemies.length);
        for (const e of w.enemies) {
          const p = targetPoint(e, 'head');
          const shot = solveShot(w, p.x, p.y, 1.04);
          expect(shot.power, `wave ${wave} ${e.type}`).toBeLessThan(1);
          expect(Number.isFinite(shot.angle)).toBe(true);
          const sol = enemyAimSolution(w, e);
          expect(Number.isFinite(sol.angle)).toBe(true);
        }
      }
    }
    // a fifth island on many grown stages (where the far side has room for one)

    expect(fifth / grown).toBeGreaterThan(0.35);
  });

  it('a scripted player can still clear grown-field stages (no out-of-reach enemies)', async () => {
    const { playRun, CAREFUL } = await import('../../src/sim/aimbot');
    const r = playRun(31, createRng(131), CAREFUL, { startChapter: 3, god: true, untilWave: chapterStart(3) + 5, maxTime: 600 });
    expect(r.reached).toBeGreaterThanOrEqual(chapterStart(3) + 5);
  }, 120_000);
});
