import { act, collectErrors, expect, openGame, state, test } from '@oyun/core/e2e';
import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * View twists (world 5, Dive mode) in the built game, on a stepped clock so nothing depends on
 * the machine's frame rate: the sim is the same with twists on, off (?twist=0) and with the whole
 * presentation off (?fx=0); the view really changes when they are on; reduced motion switches
 * instead of moving; Dive mode starts flipped, keeps its own record and unlocks with Endless.
 */
type Data = Record<string, unknown> & {
  phase: string;
  mode: string;
  y: number;
  tick: number;
  x: number;
  gems: number;
  simHash: number;
  twistOn: boolean;
  twists: number;
  twistKinds: string[];
  pose: { flip: number; fold: number; tilt: number; zoom: number };
  ahead: { edge: number; clear: number };
  sparkScreen: { x: number; y: number };
  holdArrow: boolean;
  banner: string;
  diveBest: number;
  endlessBest: number;
  wallet: number;
};

const data = async (page: Page): Promise<Data> => (await state(page)).data as Data;

/** A save with levels 1-3 finished (Endless and Dive open), nothing else. */
function saveWithLevels(done: number): string {
  const levels = Array.from({ length: 50 }, (_, i) => (i < done ? { best: 100, attempts: 2, gemMask: 0, done: true, stars: 1, bestDate: '2026-11-20' } : { best: 0, attempts: 0, gemMask: 0, done: false, stars: 0, bestDate: '' }));
  return JSON.stringify({
    v: 3,
    data: {
      unlocked: done + 1,
      levels,
      gems: 0,
      skin: { shape: 0, trail: 0, ownedShapes: 1, ownedTrails: 1 },
      endlessBest: 0,
      endlessDate: '',
      daily: { date: '', best: 0, streak: 0, lastDate: '', gems: [], bestStreak: 0, days: 0, paid: '', history: [] },
      finishes: done,
      played: true,
      tutorial: true,
      achievements: 0,
      rankSeen: 0,
      cues: 0,
      stats: { attempts: 2 * done, bestEdge: 0, bestFlow: 0 },
    },
  });
}

async function open(browser: Browser, opts: { query?: string; save?: string; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: opts.reducedMotion ?? 'no-preference' });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  // Seed the save once per tab (an init script runs again on a reload, which must keep what the game wrote).
  if (opts.save) {
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('kvSeeded')) return;
      sessionStorage.setItem('kvSeeded', '1');
      localStorage.setItem('oyun:kivilcim:save', s);
    }, opts.save);
  }
  await page.clock.install({ time: new Date('2026-11-22T10:00:00') });
  await openGame(page, { seed: 1, lang: 'en', ...(opts.query ? { query: opts.query } : {}) });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);
  return { ctx, page, errors };
}

/** Level `level` on autopilot: `skipS` seconds of long frames, then `frames` frames of 33 ms. */
async function fly(browser: Browser, level: number, query: string, skipS: number, frames = 120, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<{ end: Data; seen: Data[] }> {
  const { ctx, page, errors } = await open(browser, { query, reducedMotion });
  await act(page, 'start', { mode: 'level', level });
  await act(page, 'autopilot', true);
  for (let k = 0; k < skipS * 5; k++) await page.clock.fastForward(200);
  const seen: Data[] = [];
  for (let k = 0; k < frames; k++) {
    await page.clock.fastForward(33);
    if (k % 3 === 0) seen.push(await data(page));
  }
  const end = await data(page);
  expect(errors).toEqual([]);
  await ctx.close();
  return { end, seen };
}

const sim = (d: Data): Record<string, number> => ({ hash: d.simHash, tick: d.tick, x: d.x, y: d.y, gems: d.gems });

for (const [level, skipS, what, check] of [
  [41, 3, 'dive (the fold and the flight down)', (d: Data) => d.pose.flip < 1],
  [44, 3, 'side (the fold and the flight to the right)', (d: Data) => d.pose.fold < 1],
  [42, 3, 'lean', (d: Data) => Math.abs(d.pose.tilt) > 1],
] as const) {
  test(`twists on, twists off, presentation off: the sim is the same, level ${level}, ${what}`, async ({ browser }) => {
    test.setTimeout(400_000);
    const on = await fly(browser, level, 'fx=1', skipS);
    const noTwist = await fly(browser, level, 'twist=0', skipS);
    const noFx = await fly(browser, level, 'fx=0', skipS);
    console.warn(`level ${level}: twists on: tick ${on.end.tick} hash ${on.end.simHash} pose ${JSON.stringify(on.end.pose)}; twist=0 hash ${noTwist.end.simHash}; fx=0 hash ${noFx.end.simHash}`);
    expect(on.end.tick).toBeGreaterThan(500);
    expect(on.end.phase).toBe('playing');
    expect(sim(noTwist.end)).toEqual(sim(on.end));
    expect(sim(noFx.end)).toEqual(sim(on.end));
    // The view really was twisted in the first run, and never in the other two.
    expect(on.end.twistOn).toBe(true);
    expect(on.seen.some(check), 'the twist was on screen').toBe(true);
    for (const run of [noTwist, noFx]) {
      expect(run.end.twistOn).toBe(false);
      expect(run.end.twists).toBeGreaterThan(0); // the level data still has them
      for (const d of run.seen) expect(d.pose).toEqual({ flip: 1, fold: 1, tilt: 0, zoom: 1 });
    }
    // Under the twist the player sees at least as far ahead as in the normal view.
    for (const d of on.seen) {
      expect(d.ahead.edge, `y ${d.y}`).toBeGreaterThanOrEqual(920);
      expect(d.ahead.clear, `y ${d.y}`).toBeGreaterThanOrEqual(690);
    }
  });
}

test('a twist is announced before the view changes, with the hold arrow; the fold is a motion, never a snap', async ({ browser }) => {
  test.setTimeout(300_000);
  const { seen } = await fly(browser, 41, 'fx=1', 2, 150);
  const first = seen.findIndex((d) => d.pose.flip < 1);
  expect(first).toBeGreaterThan(0);
  // Banner and arrow were up while the view was still normal.
  const before = seen.slice(0, first).filter((d) => d.banner === 'DIVE!' && d.holdArrow);
  expect(before.length, 'banner + arrow before the flip').toBeGreaterThan(0);
  // The flip passes through in-between values over many frames.
  const moving = seen.filter((d) => d.pose.flip < 1 && d.pose.flip > -1);
  expect(moving.length).toBeGreaterThanOrEqual(4);
  const flips = seen.map((d) => d.pose.flip);
  for (let i = 1; i < flips.length; i++) expect(Math.abs(flips[i]! - flips[i - 1]!), `frame ${i}`).toBeLessThan(0.75);
  // Once dived, the spark is drawn in the upper part of the screen and flies down.
  const dived = seen.filter((d) => d.pose.flip === -1);
  expect(dived.length).toBeGreaterThan(0);
  for (const d of dived) expect(d.sparkScreen.y).toBeLessThan(500);
});

test('reduced motion: the dive switches in one frame (no fold), and a sway is a fixed lean', async ({ browser }) => {
  test.setTimeout(300_000);
  const dive = await fly(browser, 41, 'fx=1', 2, 150, 'reduce');
  const flips = new Set(dive.seen.map((d) => d.pose.flip));
  expect([...flips].sort()).toEqual([-1, 1]);
  // Level 42's second twist is a sway: under reduced motion its lean does not change once on.
  const sway = await fly(browser, 42, 'fx=1', 19, 150, 'reduce');
  const tilts = new Set(sway.seen.filter((d) => d.twistKinds.includes('rock')).map((d) => d.pose.tilt));
  expect(tilts.size).toBeGreaterThan(0);
  expect(tilts.size).toBeLessThanOrEqual(2); // off, then one fixed lean
  // The same stretch with motion allowed does move.
  const moving = await fly(browser, 42, 'fx=1', 19, 150);
  expect(new Set(moving.seen.filter((d) => d.twistKinds.includes('rock')).map((d) => d.pose.tilt)).size).toBeGreaterThan(5);
});

test('Dive mode: locked before level 3, then flown downward from its own ready plate, with its own record', async ({ browser }) => {
  test.setTimeout(300_000);
  // A new player: the Dive card says what opens it and nothing starts.
  const fresh = await open(browser);
  await act(fresh.page, 'dive');
  expect((await data(fresh.page)).mode).toBe('level');
  expect((await data(fresh.page)).phase).toBe('title');
  expect(fresh.errors).toEqual([]);
  await fresh.ctx.close();

  const { ctx, page, errors } = await open(browser, { save: saveWithLevels(3) });
  await act(page, 'dive');
  let d = await data(page);
  expect([d.mode, d.phase]).toEqual(['dive', 'ready']);
  for (let k = 0; k < 5; k++) await page.clock.fastForward(33);
  d = await data(page);
  // Flipped from the first frame: the spark waits near the top of the screen.
  expect(d.pose.flip).toBe(-1);
  expect(d.sparkScreen.y).toBeLessThan(500);
  expect(d.twistKinds).toContain('dive');
  await act(page, 'autopilot', true);
  for (let k = 0; k < 60; k++) await page.clock.fastForward(100);
  d = await data(page);
  expect(d.phase).toBe('playing');
  expect(d.y).toBeGreaterThan(1500);
  expect(d.pose.flip).toBe(-1);
  expect(d.ahead.edge).toBeGreaterThanOrEqual(920);
  // Let go: the spark dies; the height goes to the Dive record, not to Endless.
  await act(page, 'autopilot', false);
  for (let k = 0; k < 80 && (await data(page)).phase === 'playing'; k++) await page.clock.fastForward(100);
  d = await data(page);
  expect(d.phase).toBe('dead');
  expect(d.diveBest).toBeGreaterThan(100);
  expect(d.endlessBest).toBe(0);
  expect(d.mode).toBe('dive');
  // Retry by tap stays in Dive mode, flipped.
  for (let k = 0; k < 6; k++) await page.clock.fastForward(100);
  await act(page, 'tap');
  for (let k = 0; k < 3; k++) await page.clock.fastForward(33);
  d = await data(page);
  expect([d.mode, d.phase, d.pose.flip]).toEqual(['dive', 'playing', -1]);
  // The record survives a reload.
  const best = d.diveBest;
  await page.clock.resume();
  await page.reload();
  await page.waitForFunction(() => window.__OYUN__?.ready === true, null, { timeout: 20_000 });
  expect((await data(page)).diveBest).toBe(best);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('Endless is the same shaft as before with its twist stretches switched off', async ({ browser }) => {
  test.setTimeout(300_000);
  const run = async (query: string): Promise<Data> => {
    const { ctx, page, errors } = await open(browser, { query, save: saveWithLevels(3) });
    await act(page, 'endless');
    await act(page, 'autopilot', true);
    for (let k = 0; k < 110; k++) await page.clock.fastForward(100);
    const d = await data(page);
    expect(errors).toEqual([]);
    await ctx.close();
    return d;
  };
  const on = await run('fx=1');
  const off = await run('twist=0');
  expect(on.phase).toBe('playing');
  expect(on.y).toBeGreaterThan(3500);
  expect(sim(off)).toEqual(sim(on));
});
