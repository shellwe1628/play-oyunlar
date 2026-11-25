import { createRng } from '@oyun/core/pure';
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAREFUL, planShot, playRun, solveShot, STARTER } from '../../src/sim/aimbot';
import { freshArsenal, freshModeSave, repairArsenal, repairModeSave } from '../../src/sim/arsenal';
import { CHAPTERS, fieldSpan, levelOf, RECOMMENDED_LEVEL, RECOMMENDED_POWER, stageOf, STAGES } from '../../src/sim/chapters';
import { freshSave, newBank, NO_META, type MetaLevels, type SaveData } from '../../src/sim/meta';
import { bankMode, beatsBest, BLITZ, BLITZ_LEDGES, BLITZ_SPAN, blitzEvery, blitzHeadKo, blitzHp, blitzLevel, finishMode, MODE_CHESTS_PER_DAY, MODE_THEME, modeChestsLeft, modeResult, modeUnlocked, rushLevel, rushWave, RUSH_BOSSES } from '../../src/sim/modes';
import { progressScore } from '../../src/sim/progress';
import { repairSave } from '../../src/save';
import { ENEMY_DAMAGE, HARD_HEAD_MUL } from '../../src/sim/combat';
import { TUNING } from '../../src/sim/tuning';
import { bossHp, HARD_COIN_MUL } from '../../src/sim/waves';
import { WEAPON_IDS, type WeaponId } from '../../src/sim/weapons';
import { advance, arcClear, arrowSpeed, BOSS_KINDS, BOSS_RAGE_AFTER, bossHurtMul, createWorld, pickCard, playerOrigin, reachedWave, revive, rushJump, shoot, summarize, takeEvents, targetPoint, underPower, type GameEvent, type World } from '../../src/sim/world';

/**
 * The Events tab's modes (sim/modes.ts), on the 3D build's 'hard' rules: Blitz and Boss Rush.
 * The player of the measured bands is the balance tests' CAREFUL, NO_META but for the bow at a level.
 */
const note = (line: string) => {
  if (process.env.OKCU_BALANCE) appendFileSync(process.env.OKCU_BALANCE, `${line}\n`);
};
const meta = (wlevel: number): MetaLevels => ({ ...NO_META, weapon: 'bow', wlevel });
const DAY = '2026-11-22';
const hard = (mode: 'blitz' | 'bossrush', wlevel = 1, seed = 1): World => createWorld({ seed, meta: meta(wlevel), difficulty: 'hard', mode });

/** step the world, collecting every event */
function run(w: World, seconds: number, events: GameEvent[] = []): GameEvent[] {
  for (let t = 0; t < seconds; t += 1 / 30) {
    advance(w, 1 / 30);
    events.push(...takeEvents(w));
  }
  return events;
}

/** a whole mode run by the careful player; returns the world as it ended */
function play(mode: 'blitz' | 'bossrush', wlevel: number, seed: number, each?: (w: World) => void, events?: GameEvent[]): World {
  let world: World | null = null;
  playRun(seed, createRng(5000 + seed), CAREFUL, {
    difficulty: 'hard',
    meta: meta(wlevel),
    mode,
    maxTime: 900,
    events: (ev) => events?.push(...ev),
    each: (w) => {
      world = w;
      each?.(w);
    },
  });
  return world!;
}

/** everything in a save but the fields a mode run may write */
function untouched(s: SaveData): unknown {
  const { coins: _coins, arsenal, ...rest } = s;
  const { chests: _chests, runChest: _runChest, modes: _modes, ...arsenalRest } = arsenal;
  return { ...rest, arsenal: arsenalRest };
}

describe('the modes in the save', () => {
  it('fresh is zero; repair keeps valid values and drops anything else', () => {
    const fresh = { blitz: 0, rush: 0, rushTime: 0, chestDay: '', chestsUsed: 0 };
    expect(freshModeSave()).toEqual(fresh);
    expect(freshArsenal().modes).toEqual(fresh);
    expect(freshSave().arsenal.modes).toEqual(fresh);
    expect(repairArsenal({ ...freshArsenal(), modes: { blitz: 17, rush: 4, rushTime: 83.46, chestDay: DAY, chestsUsed: 2 } }).modes).toEqual({ blitz: 17, rush: 4, rushTime: 83.5, chestDay: DAY, chestsUsed: 2 });
    // fractions floor, a rush cannot beat more bosses than there are, a time needs a boss
    expect(repairModeSave({ blitz: 9.8, rush: 99, rushTime: 12 })).toEqual({ ...fresh, blitz: 9, rush: CHAPTERS, rushTime: 12 });
    expect(repairModeSave({ blitz: -3, rush: 0, rushTime: 40 })).toEqual(fresh);
    expect(repairModeSave({ blitz: 'many', rush: null, rushTime: Number.NaN })).toEqual(fresh);
    // the day's chest count needs a real day key
    expect(repairModeSave({ chestDay: 'yesterday', chestsUsed: 2 })).toEqual(fresh);
    expect(repairModeSave({ chestDay: DAY, chestsUsed: -1 })).toEqual({ ...fresh, chestDay: DAY });
    expect(repairModeSave({ chestDay: DAY, chestsUsed: 2.7 })).toEqual({ ...fresh, chestDay: DAY, chestsUsed: 2 });
    for (const junk of [undefined, null, 7, 'x', [1, 2, 3]]) expect(repairModeSave(junk)).toEqual(fresh);
  });

  it('a save from before the modes (no `modes` in its arsenal) gets zero bests and keeps the rest', () => {
    // a literal save as the 3D build wrote it before this change
    const old = {
      best: 19,
      coins: 4321,
      runs: 37,
      upgrades: { hp: 3, coins: 2, reroll: 1, starter: 0 },
      bow: { level: 6, heat: 0.1, tries: 9 },
      cosmetic: 'feather',
      dailyDate: '2026-11-20',
      dailyBest: 6,
      dailyStreak: 2,
      dailyDone: '2026-11-20',
      chapter: 2,
      bosses: [3, 1, 0, 0, 0, 0],
      feats: ['firstKo', 'boss1'],
      rank: 4,
      arsenal: {
        selected: 'crossbow',
        weapons: { bow: { owned: true, level: 6, shards: 2 }, crossbow: { owned: true, level: 3, shards: 0 }, spear: { owned: true, level: 1, shards: 4 } },
        chests: ['wood', 'silver'],
        runChest: 1,
        welcome: false,
        freeChestAt: 12345,
        adCoinsDay: '2026-11-20',
        adCoinsUsed: 1,
        shopDay: '2026-11-20',
        shopBought: [0],
        shopOffers: [{ weapon: 'bow', shards: 3, coins: 900 }],
        boughtLooks: ['party'],
        rankFloor: 800,
        migrated: true,
        chestsOpened: 12,
        celestial: false,
        reveals: [],
        unseen: ['spear'],
      },
    };
    const s = repairSave(old as unknown as Partial<SaveData>);
    expect(s.arsenal.modes).toEqual(freshModeSave());
    expect(s.coins).toBe(4321);
    expect(s.best).toBe(19);
    expect(s.bosses).toEqual([3, 1, 0, 0, 0, 0]);
    expect(s.arsenal.selected).toBe('crossbow');
    expect(s.arsenal.weapons.bow).toEqual({ owned: true, level: 6, shards: 2 });
    expect(s.arsenal.chests).toEqual(['wood', 'silver']);
    expect(s.arsenal.runChest).toBe(1);
    expect(s.arsenal.unseen).toEqual(['spear']);
    // and what was stored comes back after a repair of the repaired save
    s.arsenal.modes = { blitz: 12, rush: 3, rushTime: 61.2, chestDay: DAY, chestsUsed: 3 };
    expect(repairSave(JSON.parse(JSON.stringify(s)) as Partial<SaveData>).arsenal.modes).toEqual({ blitz: 12, rush: 3, rushTime: 61.2, chestDay: DAY, chestsUsed: 3 });
  });

  it('unlocks: Blitz after a first run, Boss Rush after the first chapter boss', () => {
    const s = freshSave();
    expect(modeUnlocked(s, 'blitz')).toBe(false);
    expect(modeUnlocked(s, 'bossrush')).toBe(false);
    s.runs = 1;
    expect(modeUnlocked(s, 'blitz')).toBe(true);
    expect(modeUnlocked(s, 'bossrush')).toBe(false);
    s.bosses[0] = 1;
    expect(modeUnlocked(s, 'bossrush')).toBe(true);
  });

  it('a best is beaten by a higher score; a rush tie by a shorter time; never by zero', () => {
    const b = { ...freshModeSave(), blitz: 10, rush: 3, rushTime: 50 };
    expect(beatsBest(b, { mode: 'blitz', score: 11, time: 0, over: true })).toBe(true);
    expect(beatsBest(b, { mode: 'blitz', score: 10, time: 0, over: true })).toBe(false);
    expect(beatsBest(b, { mode: 'bossrush', score: 4, time: 99, over: true })).toBe(true);
    expect(beatsBest(b, { mode: 'bossrush', score: 3, time: 49.9, over: true })).toBe(true);
    expect(beatsBest(b, { mode: 'bossrush', score: 3, time: 50, over: true })).toBe(false);
    expect(beatsBest(b, { mode: 'bossrush', score: 2, time: 1, over: true })).toBe(false);
    expect(beatsBest(freshModeSave(), { mode: 'blitz', score: 0, time: 0, over: true })).toBe(false);
    expect(beatsBest(freshModeSave(), { mode: 'bossrush', score: 0, time: 0, over: true })).toBe(false);
  });
});

describe('an ordinary run is untouched by the modes', () => {
  it('default options: no mode, the same world as before', () => {
    const a = createWorld({ seed: 11 });
    expect(a.mode).toBeNull();
    expect(a.blitz).toBeNull();
    expect(a.rush).toBeNull();
    expect(a.theme).toBe(0);
    expect(modeResult(a)).toBeNull();
    const h = createWorld({ seed: 11, difficulty: 'hard', startChapter: 2 });
    expect(h.mode).toBeNull();
    expect(h.theme).toBe(stageOf(h.wave).theme);
    expect(reachedWave(h)).toBe(h.wave);
    // the bank helpers leave an ordinary run alone
    const s = freshSave();
    const before = JSON.stringify(s);
    h.run.coins = 50;
    bankMode(s, newBank(s), h);
    expect(finishMode(s, newBank(s), h, DAY)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('blitz', { timeout: 300_000 }, () => {
  it('is played on the arena with plain archers that follow the weapon', () => {
    for (const wl of [1, 10, 20]) {
      const w = hard('blitz', wl);
      expect(w.mode).toBe('blitz');
      expect(w.theme).toBe(MODE_THEME);
      expect(w.phase).toBe('title');
      expect(w.cards).toEqual([]);
      expect(w.objective).toBeNull();
      expect(w.wind).toBe(0);
      expect(w.stageMod).toBeNull();
      expect(w.level).toBeCloseTo(blitzLevel(wl), 9);
      expect(w.ledges.length).toBe(BLITZ_LEDGES.length + 1);
      expect(w.enemies.length).toBe(BLITZ.field);
      for (const e of w.enemies) {
        expect(e.type).toBe('archer');
        expect(e.helmet).toBe(false);
        expect(e.maxHp).toBe(blitzHp('bow', w.stats.dmgMul));
      }
    }
    // no bullet sponges: the health is the same at every level and only says how many body hits
    // an archer takes: three with a new bow, two from level 4, one from level 10, never more
    const bodyHits = (weapon: WeaponId, wl: number): number => {
      const w = createWorld({ seed: 1, meta: { ...NO_META, weapon, wlevel: wl }, difficulty: 'hard', mode: 'blitz' });
      expect(w.enemies[0]!.maxHp).toBe(blitzHp(weapon, w.stats.dmgMul));
      return Math.ceil(w.enemies[0]!.maxHp / (ENEMY_DAMAGE.body * w.stats.dmgMul));
    };
    let last = 3;
    for (let wl = 1; wl <= 20; wl++) {
      expect(blitzHp('bow', hard('blitz', wl).stats.dmgMul)).toBe(BLITZ.hp);
      const need = bodyHits('bow', wl);
      expect(need, `level ${wl}`).toBeLessThanOrEqual(last);
      last = need;
    }
    expect([1, 3, 4, 9, 10, 20].map((wl) => bodyHits('bow', wl))).toEqual([3, 3, 2, 2, 1, 1]);
    // every weapon needs the bow's count at its level; the sling (its head hit is worth a chest
    // hit) always BLITZ.slingHits, head or body
    expect(BLITZ.slingHits).toBe(2);
    for (const weapon of WEAPON_IDS) {
      expect(blitzHeadKo(weapon), weapon).toBe(weapon !== 'sling');
      for (const wl of [1, 4, 10, 20]) {
        expect(bodyHits(weapon, wl), `${weapon} level ${wl}`).toBe(weapon === 'sling' ? BLITZ.slingHits : bodyHits('bow', wl));
      }
    }
    const sling = createWorld({ seed: 1, meta: { ...NO_META, weapon: 'sling', wlevel: 7 }, difficulty: 'hard', mode: 'blitz' });
    const slingHead = ENEMY_DAMAGE.head * HARD_HEAD_MUL * sling.stats.headMul * sling.stats.dmgMul;
    expect(slingHead).toBeCloseTo(ENEMY_DAMAGE.body * sling.stats.dmgMul, 6);
    expect(Math.ceil(sling.enemies[0]!.maxHp / slingHead)).toBe(BLITZ.slingHits);
    // aim and timing follow the weapon, and a stronger weapon brings the extra archers sooner
    expect(blitzLevel(1)).toBe(1);
    expect(blitzLevel(20)).toBeGreaterThan(blitzLevel(10));
    expect(blitzEvery(1)).toBe(BLITZ.every);
    expect(blitzEvery(10)).toBeLessThan(blitzEvery(1));
    expect(blitzEvery(20)).toBeLessThan(blitzEvery(10));
    expect(BLITZ.field).toBe(2);
    expect(BLITZ.cap).toBe(4);
  });

  it('every place on the arena can be hit with a clear shot from the bow', () => {
    const w = hard('blitz');
    expect(w.span).toBe(BLITZ_SPAN);
    // where an archer's crown and chest are above its mesa (the careful player aims at the crown)
    const e = w.enemies[0]!;
    const crown = w.ledges[e.ledge]!.y - targetPoint(e, 'head').y + 7 * e.scale;
    const chest = w.ledges[e.ledge]!.y - targetPoint(e, 'chest').y;
    expect(crown).toBeGreaterThan(150);
    for (let i = 0; i < BLITZ_LEDGES.length; i++) {
      const L = w.ledges[i + 1]!;
      for (const up of [crown, chest]) {
        const at = { x: L.x + L.w / 2, y: L.y - up };
        const s = solveShot(w, at.x, at.y, CAREFUL.loft, 1);
        const o = playerOrigin(w, s.angle);
        expect(arcClear(w, o.x, o.y, s.angle, arrowSpeed(s.power), at.x, at.y), `mesa ${i}, ${Math.round(up)} px up`).toBe(true);
      }
      // inside the view, with room over an archer's head; no mesa within an archer's height over another
      expect(L.x + L.w).toBeLessThanOrEqual(720 * BLITZ_SPAN - 20);
      expect(L.y - crown).toBeGreaterThan(1280 * (1 - BLITZ_SPAN) + 150);
      for (let j = 0; j < BLITZ_LEDGES.length; j++) {
        const o = w.ledges[j + 1]!;
        if (j === i || o.y >= L.y || o.x >= L.x + L.w || o.x + o.w <= L.x) continue;
        expect(L.y - (o.y + o.h), `mesa ${j} over mesa ${i}`).toBeGreaterThan(crown + 60);
      }
    }
  });

  it('ends at 60 s of play, and not before; the clock does not run on the title', () => {
    const w = hard('blitz');
    run(w, 5);
    expect(w.phase).toBe('title');
    expect(w.blitz!.left).toBe(BLITZ.time);
    expect(shoot(w, -1.4, 0.2)).toBe(true); // straight up: hits nobody
    const t0 = w.time;
    const events: GameEvent[] = [];
    // the archers shoot back: what their hits cost is counted, the rest of the minute is played
    let over = -1;
    let cost = 0;
    for (let t = 0; t < 70 && over < 0; t += 1 / 30) {
      advance(w, 1 / 30);
      for (const e of takeEvents(w)) {
        events.push(e);
        if (e.t === 'blitzHit') cost += e.cost;
      }
      if (w.phase === 'over') over = w.time - t0;
    }
    expect(over + cost).toBeGreaterThan(BLITZ.time - 0.1);
    expect(over + cost).toBeLessThan(BLITZ.time + 0.1);
    expect(w.blitz!.left).toBe(0);
    expect(events.filter((e) => e.t === 'modeEnd').length).toBe(1);
    expect(events.some((e) => e.t === 'dying' || e.t === 'dead')).toBe(false);
    expect(events.some((e) => e.t === 'cards' || e.t === 'waveClear' || e.t === 'bonusStart')).toBe(false);
    expect(w.player.alive).toBe(true);
    // over is over: nothing moves the score or the clock any more, and there is no revive
    const score = w.blitz!.score;
    run(w, 5);
    expect(w.phase).toBe('over');
    expect(w.blitz!.score).toBe(score);
    expect(revive(w)).toBe(false);
    expect(shoot(w, -0.5, 0.8)).toBe(false);
  });

  it('the player cannot be knocked out: a hit costs 3 s of the clock, never health', () => {
    for (const wl of [1, 20]) {
      const w = hard('blitz', wl, 3);
      shoot(w, -1.4, 0.2);
      const hp = w.player.hp;
      const events = run(w, 61);
      const hits = events.flatMap((e) => (e.t === 'blitzHit' ? [e.cost] : []));
      expect(hits.length, `level ${wl}: the archers must land something on a player who stands still`).toBeGreaterThan(0);
      // 3 s each (the last one may find less than that left on the clock)
      for (const cost of hits.slice(0, -1)) expect(cost).toBe(BLITZ.hitCost);
      expect(hits[hits.length - 1]!).toBeGreaterThan(0);
      expect(hits[hits.length - 1]!).toBeLessThanOrEqual(BLITZ.hitCost);
      expect(w.blitz!.hits).toBe(hits.length);
      expect(w.player.hp).toBe(hp);
      expect(w.player.alive).toBe(true);
      expect(events.some((e) => e.t === 'dying' || e.t === 'dead')).toBe(false);
      for (const e of events) if (e.t === 'playerHit') expect(e.dmg).toBe(0);
      // every hit took its 3 s: the run ended that much sooner
      expect(w.phase).toBe('over');
    }
    // the clock really is shortened: the run ends sooner by exactly what the hits cost
    const w = hard('blitz', 1, 3);
    shoot(w, -1.4, 0.2);
    const t0 = w.time;
    let end = 0;
    let cost = 0;
    for (let t = 0; t < 61 && !end; t += 1 / 30) {
      advance(w, 1 / 30);
      for (const e of takeEvents(w)) if (e.t === 'blitzHit') cost += e.cost;
      if (w.phase === 'over') end = w.time - t0;
    }
    expect(end).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(BLITZ.time - cost - 0.1);
    expect(end).toBeLessThan(BLITZ.time - cost + 0.1);
  });

  it('keeps two to four archers on the field, a new one dropping in as one falls; no bosses, no cards', () => {
    const shares: string[] = [];
    for (const [wl, seed] of [[1, 1], [1, 2], [1, 3], [10, 1], [10, 2], [10, 3], [20, 1]] as const) {
      let ticks = 0;
      let fewOnField = 0;
      let fewStanding = 0;
      let noneStanding = 0;
      let most = 0;
      const w = play('blitz', wl, seed, (x) => {
        if (x.phase !== 'play') return;
        // the next one waits its turn out of sight above its place: it is NOT on the field
        const waiting = x.enemies.filter((e) => e.alive && e.brain === 'spawn' && e.spawnT < 0);
        const onField = x.enemies.filter((e) => e.alive && !waiting.includes(e));
        const standing = onField.filter((e) => e.brain !== 'spawn');
        expect(onField.length).toBeLessThanOrEqual(BLITZ.cap);
        expect(waiting.length).toBeLessThanOrEqual(1);
        for (const e of waiting) expect(e.body.y[0]!).toBeLessThan(1280 * (1 - BLITZ_SPAN) - 100);
        for (const e of x.enemies) expect(e.type).toBe('archer');
        // one archer to a place
        const places = x.enemies.filter((e) => e.alive).map((e) => e.ledge);
        expect(new Set(places).size).toBe(places.length);
        expect(x.enemies.length).toBeLessThan(40);
        most = Math.max(most, onField.length);
        // (after the opening second: the first replacement has had the time to come down)
        if (x.blitz!.t < 1) return;
        ticks += 1;
        if (onField.length < BLITZ.field) fewOnField += 1;
        if (standing.length < BLITZ.field) fewStanding += 1;
        if (standing.length === 0) noneStanding += 1;
      });
      expect(w.phase).toBe('over');
      expect(w.cards).toEqual([]);
      // the field was refilled: more archers fell than ever stood at once
      expect(w.run.kos).toBeGreaterThan(BLITZ.cap);
      expect(most).toBeLessThanOrEqual(BLITZ.cap);
      shares.push(`L${wl}#${seed} ${((fewStanding / ticks) * 100).toFixed(1)}%`);
      // never fewer than two on the field for more than a blink: as one falls, the next is on its way down
      expect(fewOnField / ticks, `level ${wl} seed ${seed}: fewer than two on the field`).toBeLessThan(0.01);
      // fewer than two STANDING (landed) only for the 0.55 s a replacement takes to drop in: the
      // share grows with the knockouts, so with the weapon's level
      // (with a head hit a knockout the careful player drops one every second and a half: about
      // a third of the minute one stands while its replacement is in the air)
      expect(fewStanding / ticks, `level ${wl} seed ${seed}: fewer than two standing`).toBeLessThan(wl === 1 ? 0.35 : 0.45);
      // and next to never an empty field
      expect(noneStanding / ticks, `level ${wl} seed ${seed}: nobody standing`).toBeLessThan(0.05);
    }
    note(`blitz share of play time with fewer than two standing (careful): ${shares.join(', ')}`);
  });

  it('the next archer drops at once when fewer than two are on the field, else after its turn', () => {
    const w = hard('blitz', 1, 9);
    shoot(w, -1.4, 0.2);
    run(w, 0.5);
    const hidden = () => w.enemies.filter((e) => e.alive && e.brain === 'spawn' && e.spawnT < 0);
    const onField = () => w.enemies.filter((e) => e.alive && !(e.brain === 'spawn' && e.spawnT < 0));
    expect(onField().length).toBe(BLITZ.field);
    expect(hidden().length).toBe(1);
    // with two on the field the third is in no hurry
    run(w, 2);
    expect(onField().length).toBe(BLITZ.field);
    // one falls: its replacement is on its way down within a tick or two, and lands in under a second
    const victim = onField()[0]!;
    victim.hp = 0.01;
    w.blitz!.left = BLITZ.time;
    for (let tries = 0; tries < 20 && victim.alive; tries++) {
      const p = targetPoint(victim, 'chest');
      const s = solveShot(w, p.x, p.y, 1.04, 1);
      w.reload = 0;
      shoot(w, s.angle, s.power);
      for (let t = 0; t < 0.6 && victim.alive; t += 1 / 60) {
        advance(w, 1 / 60);
        takeEvents(w);
      }
    }
    expect(victim.alive).toBe(false);
    advance(w, 2 / 60);
    takeEvents(w);
    expect(onField().length).toBe(BLITZ.field);
    expect(onField().filter((e) => e.brain === 'spawn').length).toBe(1);
    // it is no tougher than the first ones: knockouts do not harden the archers
    const fresh = onField().find((e) => e.brain === 'spawn')!;
    expect(fresh.maxHp).toBe(victim.maxHp);
    run(w, 0.7);
    expect(onField().filter((e) => e.brain !== 'spawn').length).toBe(BLITZ.field);
    // and a third joins after `blitzEvery` seconds without anyone falling
    w.blitz!.left = BLITZ.time;
    for (const e of w.enemies) e.hp = e.maxHp = 1e9;
    run(w, blitzEvery(1) + 1.5);
    expect(onField().length).toBe(BLITZ.field + 1);
  });

  it('score = knockouts, a head knockout counts double', () => {
    const w = hard('blitz', 20, 4);
    shoot(w, -1.4, 0.2);
    run(w, 1);
    let heads = 0;
    let others = 0;
    const events: GameEvent[] = [];
    // drop the archers one by one with exact hits
    for (let n = 0; n < 6; n++) {
      const e = w.enemies.find((x) => x.alive && x.brain !== 'spawn');
      if (!e) {
        run(w, 1.5, events);
        continue;
      }
      const head = n % 2 === 0;
      for (let tries = 0; tries < 12 && e.alive; tries++) {
        // (the archers shoot back: the clock is kept full so only the knockouts are under test)
        w.blitz!.left = BLITZ.time;
        const p = targetPoint(e, head ? 'head' : 'chest');
        const s = solveShot(w, p.x, p.y - (head ? 6 : 0), 1.04, 1);
        w.reload = 0;
        shoot(w, s.angle, s.power);
        run(w, 0.9, events);
      }
    }
    for (const e of events) {
      if (e.t !== 'ko') continue;
      if (e.cause === 'head') heads++;
      else others++;
    }
    expect(heads + others).toBeGreaterThanOrEqual(3);
    expect(heads).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(0);
    expect(w.blitz!.score).toBe(others + 2 * heads);
    expect(w.blitz!.heads).toBe(heads);
    expect(modeResult(w)).toEqual({ mode: 'blitz', score: others + 2 * heads, time: 0, over: false });
  });

  it('a head hit is always a knockout, at every level and with every weapon but the sling', () => {
    for (const weapon of WEAPON_IDS) {
      for (const wl of [1, 10, 20]) {
        const w = createWorld({ seed: 3, meta: { ...NO_META, weapon, wlevel: wl }, difficulty: 'hard', mode: 'blitz' });
        shoot(w, -1.4, 0.2);
        run(w, 0.8);
        const events: GameEvent[] = [];
        // the careful player's own shots with this weapon (it aims at heads), for 40 s of play
        const rng = createRng(77 + wl);
        for (let n = 0; n < 60; n++) {
          w.blitz!.left = BLITZ.time;
          const s = planShot(w, rng, CAREFUL);
          w.reload = 0;
          if (s) shoot(w, s.angle, s.power);
          run(w, 0.7, events);
        }
        const hit = new Set<number>();
        let heads = 0;
        let firstHeads = 0;
        let score = 0;
        for (const ev of events) {
          if (ev.t === 'ko') score += ev.cause === 'head' ? 2 : 1;
          if (ev.t !== 'hit') continue;
          const first = !hit.has(ev.id);
          hit.add(ev.id);
          if (ev.part !== 'head') continue;
          heads += 1;
          // every head hit is a knockout, whatever health the archer had left
          if (weapon !== 'sling') expect(ev.ko, `${weapon} level ${wl}: a head hit`).toBe(true);
          else if (first) {
            // the sling: the first hit on an archer, head or not, never is (it takes BLITZ.slingHits)
            firstHeads += 1;
            expect(ev.ko, `sling level ${wl}: a first hit on the head`).toBe(false);
          }
        }
        expect(heads, `${weapon} level ${wl}: head hits`).toBeGreaterThanOrEqual(3);
        if (weapon === 'sling') expect(firstHeads, `sling level ${wl}: first hits on the head`).toBeGreaterThanOrEqual(1);
        expect(w.blitz!.score).toBe(score);
        // it is the rule, not the health: an archer with any amount of health still falls to a head hit
        const tank: GameEvent[] = [];
        let tanks = 0;
        const ids = new Set<number>();
        for (let n = 0; n < 60 && tanks < 2; n++) {
          w.blitz!.left = BLITZ.time;
          for (const e of w.enemies) {
            if (!e.alive) continue;
            e.hp = e.maxHp = 1e6;
            ids.add(e.id);
          }
          const s = planShot(w, rng, CAREFUL);
          w.reload = 0;
          if (s) shoot(w, s.angle, s.power);
          const before = tank.length;
          run(w, 0.7, tank);
          for (const ev of tank.slice(before)) {
            if (ev.t !== 'hit' || ev.part !== 'head' || !ids.has(ev.id)) continue;
            tanks += 1;
            expect(ev.ko, `${weapon} level ${wl}: a head hit on an archer with a million health`).toBe(weapon !== 'sling');
          }
        }
        expect(tanks, `${weapon} level ${wl}: head hits on the tough archers`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('knockout bands, as they come out with a head hit a knockout (bow, seeds 1 to 8)', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    const at = (wl: number) => SEEDS.map((seed) => play('blitz', wl, seed));
    const kos = (ws: World[]) => ws.map((w) => w.run.kos);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const l1 = at(1);
    const l10 = at(10);
    const l20 = at(20);
    for (const [name, ws] of [['L1', l1], ['L10', l10], ['L20', l20]] as const) {
      note(`blitz ${name}: kos ${JSON.stringify(kos(ws))} score ${JSON.stringify(ws.map((w) => w.blitz!.score))} hits taken ${JSON.stringify(ws.map((w) => w.blitz!.hits))} coins ${JSON.stringify(ws.map((w) => w.run.coins))} shots ${JSON.stringify(ws.map((w) => w.run.shots))}`);
    }
    for (const w of [...l1, ...l10, ...l20]) expect(w.phase).toBe('over');
    // the careful player: every seed inside the band measured for its level
    const BANDS = { 1: [27, 37], 10: [31, 46], 20: [34, 47] } as const;
    for (const [wl, ws] of [[1, l1], [10, l10], [20, l20]] as const) {
      for (const k of kos(ws)) {
        expect(k, `level ${wl}: ${kos(ws).join(',')}`).toBeGreaterThanOrEqual(BANDS[wl][0]);
        expect(k, `level ${wl}: ${kos(ws).join(',')}`).toBeLessThanOrEqual(BANDS[wl][1]);
      }
    }
    // level 10 clearly above level 1 (a body hit is a knockout by then), level 20 above level 10
    expect(mean(kos(l10)), `level 10: ${kos(l10).join(',')} vs level 1: ${kos(l1).join(',')}`).toBeGreaterThanOrEqual(mean(kos(l1)) * 1.2);
    expect(mean(kos(l20)), `level 20: ${kos(l20).join(',')}`).toBeGreaterThan(mean(kos(l10)));
    expect(mean(kos(l20)), `level 20: ${kos(l20).join(',')}`).toBeLessThanOrEqual(mean(kos(l10)) * 1.5);
  });

  it('a typical new player: at least about seven knockouts, and clearly more with a better weapon', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    const at = (wl: number) =>
      SEEDS.map((seed) => {
        let world: World | null = null;
        playRun(seed, createRng(5000 + seed), STARTER, { difficulty: 'hard', meta: meta(wl), mode: 'blitz', maxTime: 900, each: (w) => (world = w) });
        return (world as World | null)!.run.kos;
      });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const l1 = at(1);
    const l10 = at(10);
    const l20 = at(20);
    note(`blitz STARTER kos: L1 ${JSON.stringify(l1)} L10 ${JSON.stringify(l10)} L20 ${JSON.stringify(l20)}`);
    // every seed inside the band measured for its level
    const BANDS = { 1: [6, 14], 10: [9, 18], 20: [12, 22] } as const;
    for (const [wl, ks] of [[1, l1], [10, l10], [20, l20]] as const) {
      for (const k of ks) {
        expect(k, `level ${wl}: ${ks.join(',')}`).toBeGreaterThanOrEqual(BANDS[wl][0]);
        expect(k, `level ${wl}: ${ks.join(',')}`).toBeLessThanOrEqual(BANDS[wl][1]);
      }
    }
    expect(mean(l1), `level 1: ${l1.join(',')}`).toBeGreaterThanOrEqual(7);
    expect(mean(l10), `level 10: ${l10.join(',')}`).toBeGreaterThanOrEqual(mean(l1) * 1.25);
    expect(mean(l20), `level 20: ${l20.join(',')}`).toBeGreaterThanOrEqual(mean(l10) * 1.2);
  });
});

describe('boss rush', { timeout: 600_000 }, () => {
  it('the six chapter bosses in chapter order, each on its own boss stage, on the arena', () => {
    const w = hard('bossrush', 20);
    expect(w.mode).toBe('bossrush');
    expect(w.phase).toBe('title');
    expect(RUSH_BOSSES).toBe(6);
    for (let i = 0; i < RUSH_BOSSES; i++) {
      rushJump(w, i);
      expect(w.rush!.boss).toBe(i);
      expect(w.theme).toBe(MODE_THEME);
      expect(w.wave).toBe(rushWave(i));
      expect(stageOf(w.wave)).toMatchObject({ chapter: i, stage: STAGES, endless: false });
      expect(w.span).toBe(fieldSpan(rushWave(i), 'hard'));
      expect(w.level).toBeCloseTo(rushLevel(i, 'hard'), 9);
      const bosses = w.enemies.filter((e) => e.type === 'boss');
      expect(bosses.length).toBe(1);
      expect(w.enemies.length).toBe(1);
      expect(bosses[0]!.bossKind).toBe(BOSS_KINDS[i]);
      expect(bosses[0]!.maxHp).toBe(bossHp(BOSS_KINDS[i]!, 0, 'hard'));
      expect(w.objective).toBeNull();
    }
    // the bosses that need their stage keep it: the giant's sliding ledge and wind, the caldera's
    // floating ledges, the storm caller's wind
    rushJump(w, 1);
    expect(w.movers.some((m) => m.kind === 'slide')).toBe(true);
    expect(w.wind).not.toBe(0);
    rushJump(w, 4);
    expect(w.movers.filter((m) => m.kind === 'bob').length).toBe(2);
    rushJump(w, 5);
    expect(Math.abs(w.wind)).toBe(200);
    // a rush boss's archers are never sharper than its chapter's own
    for (let i = 0; i < RUSH_BOSSES; i++) expect(rushLevel(i, 'hard')).toBeLessThanOrEqual(levelOf(rushWave(i), 'hard') + 1e-9);
    expect(rushLevel(0, 'hard')).toBeCloseTo(levelOf(rushWave(0), 'hard'), 9);
  });

  it('the power rule applies with each boss\'s own chapter recommendation', () => {
    for (let i = 0; i < RUSH_BOSSES; i++) {
      const rec = RECOMMENDED_LEVEL[i]!;
      const need = RECOMMENDED_POWER[i]!;
      // at the recommendation: no gate
      const ok = hard('bossrush', rec);
      rushJump(ok, i);
      expect(underPower(ok), `boss ${i} at level ${rec}`).toBe(1);
      expect(bossHurtMul(ok)).toBe(1);
      // the starting weapon: gated by (need / 100)^4 from the second boss on
      const low = hard('bossrush', 1);
      rushJump(low, i);
      expect(underPower(low), `boss ${i} at level 1`).toBeCloseTo((100 / need) ** 4, 9);
      expect(bossHurtMul(low)).toBeCloseTo(Math.min(50, (need / 100) ** 4), 9);
      if (i > 0) expect(underPower(low)).toBeLessThan(0.4);
    }
    // one level under a boss's recommendation is already under its power
    const w = hard('bossrush', RECOMMENDED_LEVEL[3]! - 1);
    rushJump(w, 3);
    expect(underPower(w)).toBeLessThan(1);
    rushJump(w, 2);
    expect(underPower(w)).toBe(1);
  });

  it('a gated boss takes the gated damage, and it enrages after 20 s (not the first boss)', () => {
    // the same body hit on the summoner (a still stage: no wind, no moving ledge) with the
    // starting weapon and with the recommended one: same seed, same shot
    const dmg = (wl: number): number => {
      const w = hard('bossrush', wl, 9);
      rushJump(w, 2);
      expect(w.wind).toBe(0);
      const boss = w.enemies[0]!;
      const events: GameEvent[] = [];
      const p = targetPoint(boss, 'chest');
      const s = solveShot(w, p.x, p.y, 1.04, 1);
      w.player.hp = w.player.maxHp = 1e6;
      expect(shoot(w, s.angle, s.power)).toBe(true);
      run(w, 0.8, events);
      const hit = events.find((e) => e.t === 'hit');
      expect(hit && hit.t === 'hit' && hit.part).toBe('body');
      // (per unit of the weapon's own damage, so only the gate differs)
      return hit && hit.t === 'hit' ? hit.dmg / w.stats.dmgMul : -1;
    };
    const full = dmg(RECOMMENDED_LEVEL[2]!);
    const gated = dmg(1);
    expect(full).toBeGreaterThan(0);
    expect(gated).toBeGreaterThan(0);
    expect(gated / full).toBeCloseTo((100 / RECOMMENDED_POWER[2]!) ** 4, 2);

    const rage = (i: number): boolean => {
      const w = hard('bossrush', 1, 5);
      rushJump(w, i);
      w.phase = 'play';
      const events: GameEvent[] = [];
      for (let t = 0; t < BOSS_RAGE_AFTER + 2; t += 1 / 30) {
        w.player.hp = w.player.maxHp = 1e6;
        advance(w, 1 / 30);
        events.push(...takeEvents(w));
      }
      return w.enemies.some((e) => e.rage) && events.some((e) => e.t === 'bossPhase' && e.rage === true);
    };
    expect(rage(0)).toBe(false);
    expect(rage(1)).toBe(true);
    expect(rage(5)).toBe(true);
  });

  it('full health before each boss, one card pick after each, ends after the sixth', () => {
    const w = hard('bossrush', 20, 6);
    shoot(w, -1.4, 0.2);
    const events: GameEvent[] = [];
    let picks = 0;
    for (let i = 0; i < RUSH_BOSSES; i++) {
      expect(w.phase).toBe('play');
      expect(w.rush!.boss).toBe(i);
      expect(w.player.hp).toBe(w.player.maxHp);
      expect(w.cards.length).toBe(i);
      // fell the boss (no hit of its can end the test), then leave the player badly wounded
      const boss = w.enemies.find((e) => e.type === 'boss')!;
      const god = () => {
        w.player.hp = w.player.maxHp = 1e6;
      };
      for (let t = 0; t < 2; t += 0.25) {
        god();
        run(w, 0.25, events);
      }
      boss.hp = 1;
      for (let tries = 0; tries < 60 && boss.alive; tries++) {
        const p = targetPoint(boss, 'chest');
        const s = solveShot(w, p.x, p.y, 1.04, 1);
        w.reload = 0;
        shoot(w, s.angle, s.power);
        for (let t = 0; t < 0.75; t += 0.25) {
          god();
          run(w, 0.25, events);
        }
        if (boss.alive) boss.hp = Math.min(boss.hp, 1);
      }
      expect(boss.alive, `boss ${i} fell`).toBe(false);
      expect(w.rush!.beaten).toBe(i + 1);
      expect(w.rush!.times.length).toBe(i + 1);
      for (let t = 0; t < TUNING.clearDelay + 0.5; t += 0.25) {
        god();
        run(w, 0.25, events);
      }
      w.player.maxHp = w.stats.maxHp;
      w.player.hp = 7;
      if (i < RUSH_BOSSES - 1) {
        // no bonus round, straight to a pick of four
        expect(w.phase).toBe('cards');
        expect(w.bonus).toBeNull();
        expect(w.offer.length).toBe(4);
        expect(pickCard(w, 0)).toBe(true);
        picks++;
        run(w, 1.2, events);
      }
    }
    expect(picks).toBe(RUSH_BOSSES - 1);
    expect(w.phase).toBe('over');
    expect(w.player.alive).toBe(true);
    expect(events.filter((e) => e.t === 'modeEnd').length).toBe(1);
    expect(events.some((e) => e.t === 'bonusStart' || e.t === 'dying')).toBe(false);
    expect(events.filter((e) => e.t === 'waveStart').map((e) => (e.t === 'waveStart' ? e.boss : null))).toEqual([...BOSS_KINDS]);
    const r = modeResult(w)!;
    expect(r.mode).toBe('bossrush');
    expect(r.score).toBe(RUSH_BOSSES);
    expect(r.over).toBe(true);
    expect(r.time).toBeCloseTo(w.rush!.times.reduce((a, b) => a + b, 0), 1);
    expect(revive(w)).toBe(false);
  });

  it('ends on the player\'s knockout, with the bosses beaten so far as the score', () => {
    const w = hard('bossrush', 1, 8);
    rushJump(w, 3);
    w.phase = 'play';
    w.rush!.beaten = 3;
    w.rush!.times = [5, 6, 7];
    const events = run(w, 60);
    expect(w.phase).toBe('over');
    expect(w.player.alive).toBe(false);
    expect(events.some((e) => e.t === 'dead')).toBe(true);
    expect(modeResult(w)).toEqual({ mode: 'bossrush', score: 3, time: 18, over: true });
    // a rush cannot be revived
    expect(revive(w)).toBe(false);
    expect(w.phase).toBe('over');
  });

  it('a careful player at each boss\'s recommended level beats that boss; the starting weapon stops at the second', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    const beaten = (wl: number) => SEEDS.map((seed) => play('bossrush', wl, seed).rush!.beaten);
    const l1 = beaten(1);
    note(`rush L1: bosses beaten ${JSON.stringify(l1)}`);
    // the starting weapon: the first boss falls (it recommends level 1), the giant is a wall (a
    // lucky run of weak-spot hits may still get by it; nobody gets by the third)
    expect(l1.filter((n) => n >= 1).length, `level 1: ${l1.join(',')}`).toBeGreaterThanOrEqual(6);
    expect(l1.filter((n) => n >= 2).length, `level 1: ${l1.join(',')}`).toBeLessThanOrEqual(2);
    expect(Math.max(...l1), `level 1: ${l1.join(',')}`).toBeLessThanOrEqual(2);
    const seen = new Map<number, number[]>([[1, l1]]);
    for (let i = 0; i < RUSH_BOSSES; i++) {
      const wl = RECOMMENDED_LEVEL[i]!;
      let got = seen.get(wl);
      if (!got) {
        got = beaten(wl);
        seen.set(wl, got);
        note(`rush L${wl}: bosses beaten ${JSON.stringify(got)}`);
      }
      // at boss i's recommended level the rush gets past boss i in at least 6 of 8 runs
      expect(got.filter((n) => n >= i + 1).length, `boss ${i} at level ${wl}: ${got.join(',')}`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('rewards and guards: a mode run cannot be farmed', { timeout: 300_000 }, () => {
  /** a save with things to lose: progress, a daily streak, unlocks owed */
  const veteran = (): SaveData => {
    const s = freshSave();
    s.runs = 12;
    s.best = 9;
    s.coins = 1000;
    s.chapter = 1;
    s.bosses[0] = 2;
    s.dailyStreak = 3;
    s.dailyDone = '2026-11-21';
    s.dailyDate = '2026-11-21';
    s.dailyBest = 6;
    s.rank = 2;
    return s;
  };

  it('a mode world reports no chapter progress, no boss knockouts and no records', () => {
    const w = play('bossrush', 20, 1);
    expect(w.rush!.beaten).toBeGreaterThanOrEqual(1);
    expect(w.run.bossKills).toEqual([]);
    expect(w.run.chapterStage).toEqual(Array<number>(CHAPTERS).fill(0));
    expect(reachedWave(w)).toBe(0);
    const sum = summarize(w);
    expect(sum).toEqual({ reached: 0, kos: 0, headChain: 0, streak: 0, multi: 0, focusUses: 0, bossKills: [], chapterStage: Array<number>(CHAPTERS).fill(0), bonusGold: 0, barrelBest: 0, ropeDrops: 0, endless: 0, daily: false });
    const b = play('blitz', 10, 1);
    expect(b.run.kos).toBeGreaterThan(0);
    expect(summarize(b).kos).toBe(0);
    expect(summarize(b).reached).toBe(0);
    expect(b.run.chapterStage).toEqual(Array<number>(CHAPTERS).fill(0));
  });

  it('boss rush: coins and one wooden chest, the best; no first-kill reward, weapon, reveal, boss count, chapter, wave, rank, streak or run', () => {
    // a save that has never beaten bosses 2 … 6: a rush through all of them must unlock nothing
    const s = veteran();
    const before = JSON.parse(JSON.stringify(s)) as SaveData;
    const score0 = progressScore(s).total;
    const bank = newBank(s);
    const w = play('bossrush', 20, 2, (x) => bankMode(s, bank, x));
    expect(w.rush!.beaten).toBeGreaterThanOrEqual(3);
    const out = finishMode(s, bank, w, DAY)!;
    expect(out.result.score).toBe(w.rush!.beaten);
    expect(out.newBest).toBe(true);
    expect(out.chest).toBe('wood');
    // only these changed
    expect(untouched(s)).toEqual(untouched(before));
    expect(s.coins).toBe(before.coins + w.run.coins);
    expect(s.arsenal.chests).toEqual(['wood']);
    expect(s.arsenal.runChest).toBe(0);
    expect(s.arsenal.modes).toEqual({ blitz: 0, rush: w.rush!.beaten, rushTime: out.result.time, chestDay: DAY, chestsUsed: 1 });
    // spelled out
    expect(s.bosses).toEqual(before.bosses);
    expect(s.arsenal.reveals).toEqual([]);
    expect(s.arsenal.unseen).toEqual([]);
    expect(s.arsenal.celestial).toBe(false);
    expect(Object.values(s.arsenal.weapons).filter((x) => x.owned).length).toBe(1);
    expect(s.chapter).toBe(before.chapter);
    expect(s.best).toBe(before.best);
    expect(s.runs).toBe(before.runs);
    expect(s.feats).toEqual(before.feats);
    expect(s.records).toEqual(before.records);
    expect(s.dailyStreak).toBe(before.dailyStreak);
    expect(s.dailyDone).toBe(before.dailyDone);
    expect(progressScore(s).total).toBe(score0);
    // finishing twice changes nothing more
    const again = JSON.stringify(s);
    const out2 = finishMode(s, bank, w, DAY)!;
    expect(out2.newBest).toBe(false);
    expect(JSON.stringify(s)).toBe(again);
  });

  it('blitz: the same; a worse run keeps the best and still earns its chest', () => {
    const s = veteran();
    const before = JSON.parse(JSON.stringify(s)) as SaveData;
    const bank = newBank(s);
    const w = play('blitz', 10, 3, (x) => bankMode(s, bank, x));
    const out = finishMode(s, bank, w, DAY)!;
    expect(out.result).toEqual({ mode: 'blitz', score: w.blitz!.score, time: 0, over: true });
    expect(out.newBest).toBe(true);
    expect(out.best).toBe(w.blitz!.score);
    expect(untouched(s)).toEqual(untouched(before));
    expect(s.coins).toBe(before.coins + w.run.coins);
    expect(s.arsenal.chests).toEqual(['wood']);
    expect(s.arsenal.modes).toEqual({ blitz: w.blitz!.score, rush: 0, rushTime: 0, chestDay: DAY, chestsUsed: 1 });
    // a weaker second run
    const bank2 = newBank(s);
    const w2 = hard('blitz', 1, 4);
    shoot(w2, -1.4, 0.2);
    run(w2, 61);
    expect(w2.blitz!.score).toBeLessThan(w.blitz!.score);
    const out2 = finishMode(s, bank2, w2, DAY)!;
    expect(out2.newBest).toBe(false);
    expect(out2.best).toBe(w.blitz!.score);
    expect(s.arsenal.modes.blitz).toBe(w.blitz!.score);
    expect(s.arsenal.chests).toEqual(['wood', 'wood']);
    expect(untouched(s)).toEqual(untouched(before));
  });

  it('ruling T: no chest for a run that never shot, none for a run that is not over (a quit)', () => {
    // quit mid-run: the coins so far are banked, nothing else
    const s = freshSave();
    const bank = newBank(s);
    const w = hard('blitz', 10, 5);
    playRunFor(w, 20);
    expect(w.phase).toBe('play');
    bankMode(s, bank, w);
    expect(finishMode(s, bank, w, DAY)).toBeNull();
    expect(s.coins).toBe(w.run.coins);
    expect(s.arsenal.chests).toEqual([]);
    expect(s.arsenal.modes).toEqual(freshModeSave());
    // no shots: a rush lost without loosing an arrow (the world is started by hand)
    const s2 = freshSave();
    const idle = hard('bossrush', 1, 5);
    rushJump(idle, 0);
    run(idle, 200);
    expect(idle.phase).toBe('over');
    expect(idle.run.shots).toBe(0);
    const out = finishMode(s2, newBank(s2), idle, DAY)!;
    expect(out.chest).toBeNull();
    expect(out.newBest).toBe(false);
    expect(s2.arsenal.chests).toEqual([]);
    expect(JSON.stringify(s2)).toBe(JSON.stringify(freshSave()));
  });

  it('a mode run is short: only the first three of a day (both modes together) earn a chest', () => {
    expect(MODE_CHESTS_PER_DAY).toBe(3);
    const s = freshSave();
    expect(modeChestsLeft(s, DAY)).toBe(3);
    // the quickest way to end a mode run: one arrow, then stand in the archers' fire
    const quick = (mode: 'blitz' | 'bossrush', seed: number): World => {
      const w = hard(mode, 1, seed);
      shoot(w, -1.4, 0.2);
      run(w, 200);
      expect(w.phase).toBe('over');
      return w;
    };
    const kinds: ('blitz' | 'bossrush')[] = ['blitz', 'bossrush', 'blitz', 'bossrush', 'blitz', 'blitz'];
    const got = kinds.map((mode, i) => finishMode(s, newBank(s), quick(mode, 20 + i), DAY)!.chest);
    expect(got).toEqual(['wood', 'wood', 'wood', null, null, null]);
    expect(s.arsenal.chests).toEqual(['wood', 'wood', 'wood']);
    expect(modeChestsLeft(s, DAY)).toBe(0);
    expect(s.arsenal.modes.chestsUsed).toBe(3);
    // a new day: three more, and never a better kind than wood whatever the score
    expect(modeChestsLeft(s, '2026-11-23')).toBe(3);
    const big = play('bossrush', 20, 1);
    expect(big.rush!.beaten).toBeGreaterThanOrEqual(3);
    expect(finishMode(s, newBank(s), big, '2026-11-23')!.chest).toBe('wood');
    expect(s.arsenal.modes.chestDay).toBe('2026-11-23');
    expect(s.arsenal.modes.chestsUsed).toBe(1);
    expect(modeChestsLeft(s, '2026-11-23')).toBe(2);
    expect(s.arsenal.chests).toEqual(['wood', 'wood', 'wood', 'wood']);
  });

  it('coins: each knockout by the run\'s own rule and nothing else (no loot, chains, clears or objectives)', () => {
    // blitz: every coin is a knockout's: BLITZ.coinShare of the run's knockout coin (3 + level / 2,
    // +2 for a head, × the hard share), because its knockouts come fast
    expect(BLITZ.coinShare).toBeLessThan(1);
    for (const wl of [1, 10, 20]) {
      const events: GameEvent[] = [];
      const w = play('blitz', wl, 6, undefined, events);
      const ko = events.filter((e) => e.t === 'ko');
      expect(ko.length).toBe(w.run.kos);
      let sum = 0;
      for (const e of ko) {
        if (e.t !== 'ko') continue;
        expect(e.coins).toBe(Math.round((3 + Math.floor(blitzLevel(wl) / 2) + (e.cause === 'head' ? 2 : 0)) * HARD_COIN_MUL * BLITZ.coinShare));
        sum += e.coins;
      }
      expect(w.run.coins).toBe(sum);
      for (const e of events) if (e.t === 'chain' || e.t === 'loot') expect(e.coins).toBe(0);
    }
    // a minute of Blitz pays less than a minute of a chapter run at any level (measured with the
    // same player, 2026-11-22: 186 … 455 coins a minute of run time at levels 1 … 20), with every
    // weapon and on every seed of the bands (the boomerang knocks out the most by far)
    for (const weapon of WEAPON_IDS) {
      for (const wl of [1, 10, 20]) {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
          let world: World | null = null;
          playRun(seed, createRng(5000 + seed), CAREFUL, { difficulty: 'hard', meta: { ...NO_META, weapon, wlevel: wl }, mode: 'blitz', maxTime: 900, each: (x) => (world = x) });
          const coins = (world as World | null)!.run.coins;
          expect(coins, `${weapon} level ${wl} seed ${seed}`).toBeLessThanOrEqual(160);
        }
      }
    }
    // boss rush: the knockouts (the bosses and the summoner's imps); no loot, nothing for the clears
    const events: GameEvent[] = [];
    const w = play('bossrush', 20, 6, undefined, events);
    expect(w.rush!.beaten).toBe(RUSH_BOSSES);
    let sum = 0;
    for (const e of events) {
      if (e.t === 'ko') sum += e.coins;
      // (a boss still bursts for the show: its loot event carries no coins)
      if (e.t === 'waveClear' || e.t === 'chain' || e.t === 'objective' || e.t === 'loot') expect(e.coins).toBe(0);
    }
    expect(events.filter((e) => e.t === 'loot').length).toBe(RUSH_BOSSES);
    expect(w.run.coins).toBe(sum);
    // all six bosses can fall in under half a minute to a strong weapon: the whole rush pays less
    // than that half minute of a chapter run
    expect(w.run.coins).toBeLessThanOrEqual(80);
  });
});

/** the careful player for `seconds` of a world that is already made */
function playRunFor(w: World, seconds: number): void {
  const rng = createRng(99);
  shoot(w, -0.6, 0.7);
  let wait = 0;
  for (let t = 0; t < seconds; t += 1 / 30) {
    wait += 1 / 30;
    if (wait > 0.6 && w.reload <= 0) {
      const e = w.enemies.find((x) => x.alive && x.brain !== 'spawn');
      if (e) {
        const p = targetPoint(e, 'head');
        const s = solveShot(w, p.x + rng.range(-2, 2), p.y - 6, 1.04, 1);
        if (shoot(w, s.angle, s.power)) wait = 0;
      }
    }
    advance(w, 1 / 30);
    takeEvents(w);
  }
}
