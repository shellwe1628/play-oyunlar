import { act, collectErrors, expect, openGame, state, test } from '@oyun/core/e2e';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { buildLevel } from '../../src/sim/levels';
import { kinematics } from '../../src/sim/solver';
import { segmentAt, wallXAt, type Track, type Twist } from '../../src/sim/track';
import { poseMatrix, project, twistCues, type Pose } from '../../src/sim/twist';

/**
 * View twists (world 5, Dive mode) in the built game, on a stepped clock so nothing depends on
 * the machine's frame rate: the sim is the same with twists on, off (?twist=0) and with the whole
 * presentation off (?fx=0); the view really changes when they are on, and only after the banner
 * and the hold arrow are up; the walls are drawn whole under a lean (software GL included);
 * reduced motion switches instead of moving; Dive mode starts flipped, keeps its own record and
 * unlocks with Endless.
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
  poseAnchor: { x: number; y: number };
  viewY: number;
  ahead: { edge: number; clear: number };
  sparkScreen: { x: number; y: number };
  holdArrow: boolean;
  holdArrowDir: { x: number; y: number };
  cueKinds: string[];
  banner: string;
  diveBest: number;
  endlessBest: number;
  wallet: number;
  deadCardY: number;
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

/** Seconds of flight until the spark reaches height y on a level (the climb does not depend on input). */
function secondsTo(level: number, y: number): number {
  const tl = kinematics(buildLevel(level));
  let j = 0;
  while (j < tl.n && tl.y[j]! < y) j++;
  return j / 120;
}

const twistOf = (level: number, kind: string, nth = 0): Twist => buildLevel(level).twists.filter((t) => t.kind === kind)[nth]!;

/** Level `level` on autopilot: `skipS` seconds of long frames, then `frames` frames of 33 ms. */
async function fly(browser: Browser, level: number, query: string, skipS: number, frames = 120, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<{ end: Data; seen: Data[] }> {
  const { ctx, page, errors } = await open(browser, { query, reducedMotion });
  await act(page, 'start', { mode: 'level', level });
  await act(page, 'autopilot', true);
  for (let k = 0; k < Math.floor(skipS * 5); k++) await page.clock.fastForward(200);
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

/** [level, what, seconds of flight before the sampled window, frames, the twist was seen]. */
const CASES: readonly (readonly [number, string, () => number, number, (d: Data) => boolean])[] = [
  [41, 'dive (the fold and the flight down)', () => 3, 120, (d) => d.pose.flip < 1],
  [44, 'side (the fold and the flight to the right)', () => 3, 120, (d) => d.pose.fold < 1],
  [42, 'lean', () => 3, 120, (d) => Math.abs(d.pose.tilt) > 1],
  [43, 'zoom in (under its SLOW gate)', () => secondsTo(43, twistOf(43, 'near').y0 - 450), 150, (d) => d.pose.zoom > 1.15],
  [42, 'sway', () => secondsTo(42, twistOf(42, 'rock').y0 - 450), 170, (d) => d.twistKinds.includes('rock') && Math.abs(d.pose.tilt) > 2],
  [45, 'stacked (dive under a lean)', () => secondsTo(45, twistOf(45, 'tilt').y0 - 450), 150, (d) => d.pose.flip === -1 && Math.abs(d.pose.tilt) > 3],
  [47, 'chained chamber (sideways straight into a dive)', () => secondsTo(47, twistCues(buildLevel(47).twists)[1]!.y - 300), 180, (d) => d.pose.flip === -1],
];

for (const [level, what, skip, frames, check] of CASES) {
  test(`twists on, twists off, presentation off: the sim is the same, level ${level}, ${what}`, async ({ browser }) => {
    test.setTimeout(500_000);
    const skipS = skip();
    const on = await fly(browser, level, 'fx=1', skipS, frames);
    const noTwist = await fly(browser, level, 'twist=0', skipS, frames);
    const noFx = await fly(browser, level, 'fx=0', skipS, frames);
    console.warn(`level ${level} ${what}: twists on: tick ${on.end.tick} hash ${on.end.simHash} pose ${JSON.stringify(on.end.pose)}; twist=0 hash ${noTwist.end.simHash}; fx=0 hash ${noFx.end.simHash}`);
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
    // Under the twist the player sees at least as far ahead as in the normal view (a zoom-in
    // shows fewer px, at the SLOW speed it is tied to: the rule in seconds is a unit test).
    for (const d of on.seen) {
      const near = d.twistKinds.includes('near');
      expect(d.ahead.edge, `y ${d.y}`).toBeGreaterThanOrEqual(near ? 750 : 920);
      expect(d.ahead.clear, `y ${d.y}`).toBeGreaterThanOrEqual(near ? 560 : 690);
    }
  });
}

test('a twist is announced before the view changes, with the hold arrow; the fold is a motion, never a snap', async ({ browser }) => {
  test.setTimeout(300_000);
  const { seen } = await fly(browser, 41, 'fx=1', 2, 150);
  const first = seen.findIndex((d) => d.pose.flip < 1);
  expect(first).toBeGreaterThan(0);
  // Banner and arrow were up while the view was still normal; the arrow points down and right.
  const before = seen.slice(0, first).filter((d) => d.banner === 'DIVE!' && d.holdArrow);
  expect(before.length, 'banner + arrow before the flip').toBeGreaterThanOrEqual(3);
  expect(before[0]!.holdArrowDir).toEqual({ x: 0.707, y: 0.707 });
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

test('a chained chamber (level 47, sideways into dive): the next twist is announced before the view starts to unfold', async ({ browser }) => {
  test.setTimeout(300_000);
  const cue = twistCues(buildLevel(47).twists)[1]!;
  const { seen } = await fly(browser, 47, 'fx=1', secondsTo(47, cue.y - 300), 180);
  // Sideways and settled at the start of the window.
  expect(seen[0]!.pose.fold).toBe(-1);
  const first = seen.findIndex((d) => d.pose.fold > -1);
  expect(first, 'the view starts to unfold inside the window').toBeGreaterThan(0);
  // Before the first frame that moves: the dive's banner, the arrow, pointing where hold will go.
  const before = seen.slice(0, first).filter((d) => d.banner === 'DIVE!' && d.holdArrow && d.cueKinds.join() === 'dive');
  expect(before.length, 'banner + arrow while still fully sideways').toBeGreaterThanOrEqual(3);
  for (const d of before) expect(d.pose).toEqual({ flip: 1, fold: -1, tilt: 0, zoom: 0.67 });
  expect(before[0]!.holdArrowDir).toEqual({ x: 0.707, y: 0.707 });
  // The banner is still up while the view goes through normal and into the dive.
  const folding = seen.filter((d) => d.pose.flip < 1 && d.pose.flip > -1);
  expect(folding.length).toBeGreaterThan(0);
  expect(folding.some((d) => d.banner === 'DIVE!')).toBe(true);
  expect(seen.some((d) => d.pose.flip === -1)).toBe(true);
});

test('a stacked twist (level 45, dive under a lean): the arrow shows the leaning dive direction of hold', async ({ browser }) => {
  test.setTimeout(300_000);
  const { seen } = await fly(browser, 45, 'fx=1', secondsTo(45, twistOf(45, 'tilt').y0 - 600), 150);
  const first = seen.findIndex((d) => d.pose.flip < 1 || d.pose.tilt !== 0);
  expect(first).toBeGreaterThan(0);
  const before = seen.slice(0, first).filter((d) => d.holdArrow && d.cueKinds.join() === 'dive,tilt');
  expect(before.length).toBeGreaterThanOrEqual(3);
  expect(before[0]!.banner).toBe('DIVE! + LEAN');
  // Dive's down-and-right turned by the lean of -6 degrees: 39 degrees below the horizontal.
  expect(before[0]!.holdArrowDir.x).toBeCloseTo(Math.cos((39 * Math.PI) / 180), 2);
  expect(before[0]!.holdArrowDir.y).toBeCloseTo(Math.sin((39 * Math.PI) / 180), 2);
  // Settled, the pose is the one the arrow was drawn for.
  const settled = seen.filter((d) => d.pose.flip === -1 && d.pose.tilt === -6);
  expect(settled.length).toBeGreaterThan(0);
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

// ───────────────────────────────────────────────────────────── walls under a lean

interface Sample {
  kind: 'wall' | 'mid';
  /** Logical screen position (720x1280) and luminance 0..255 of the pixel drawn there. */
  x: number;
  y: number;
  lum: number;
}

/**
 * Sample the frame on screen along both walls ahead of the spark: 50 px into each wall (where a
 * wall body must be drawn) and in the middle of the corridor (the backdrop). Positions come from
 * the level's geometry and the pose the game reports; the pixels from a screenshot of that frame.
 * Only ahead of the spark: the combo text rides behind and beside it and may lie over a wall.
 */
async function sampleWalls(page: Page, track: Track): Promise<Sample[]> {
  const d = await data(page);
  const pose: Pose = { ...d.pose, ax: d.poseAnchor.x, ay: d.poseAnchor.y };
  const m = poseMatrix(pose);
  const pts: { kind: 'wall' | 'mid'; x: number; y: number }[] = [];
  for (let ahead = 80; ahead <= 880; ahead += 40) {
    const wy = d.viewY + ahead;
    const i = segmentAt(track.wy, wy);
    const l = wallXAt(track.wy, track.lx, i, wy);
    const r = wallXAt(track.wy, track.rx, i, wy);
    for (const [kind, wx] of [
      ['wall', l - 50],
      ['wall', r + 50],
      ['mid', (l + r) / 2],
    ] as const) {
      const s = project(pose, m, wx, wy, d.viewY, { x: 0, y: 0 });
      // On screen, below the HUD band and its banners, off the very rim.
      if (s.x < 14 || s.x > 706 || s.y < 345 || s.y > 1266) continue;
      pts.push({ kind, x: s.x, y: s.y });
    }
  }
  const png = (await page.screenshot()).toString('base64');
  const lums = await page.evaluate(
    async ({ b64, points }) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const off = new OffscreenCanvas(bmp.width, bmp.height);
      const c = off.getContext('2d')!;
      c.drawImage(bmp, 0, 0);
      const kx = bmp.width / window.innerWidth;
      return points.map((p) => {
        const px = Math.round((rect.left + (p.x / 720) * rect.width) * kx);
        const py = Math.round((rect.top + (p.y / 1280) * rect.height) * kx);
        const q = c.getImageData(px, py, 1, 1).data;
        return Math.round(0.299 * q[0]! + 0.587 * q[1]! + 0.114 * q[2]!);
      });
    },
    { b64: png, points: pts },
  );
  return pts.map((p, i) => ({ ...p, lum: lums[i]! }));
}

const median = (a: number[]): number => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)] ?? 0;
/** A wall body is dark (walls are below 60 with their stripes); the backdrop behind a hole is not. */
const WALL_MAX_LUM = 72;

for (const [level, what, ready] of [
  [42, 'lean of 8 degrees', (d: Data) => d.pose.tilt === 8],
  [45, 'dive under a lean of -6 degrees', (d: Data) => d.pose.flip === -1 && d.pose.tilt === -6],
] as const) {
  test(`walls are drawn whole under a rotated view (default headless GL): level ${level}, ${what}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const track = buildLevel(level);
    const { ctx, page, errors } = await open(browser, { query: 'fx=1' });
    const gl = await page.evaluate(() => {
      const r = (window as unknown as { __kivilcimGame: { renderer: { gl: WebGLRenderingContext; renderNodes: { maxParallelTextureUnits: number } } } }).__kivilcimGame.renderer;
      const ext = r.gl.getExtension('WEBGL_debug_renderer_info');
      return { name: ext ? String(r.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '', units: r.renderNodes.maxParallelTextureUnits };
    });
    // The game runs one texture per batch everywhere (what Phaser does on phones by itself).
    expect(gl.units).toBe(1);
    await act(page, 'start', { mode: 'level', level });
    await act(page, 'autopilot', true);
    let d = await data(page);
    for (let k = 0; k < 900 && d.phase === 'playing' && !ready(d); k++) {
      await page.clock.fastForward(100);
      d = await data(page);
    }
    expect(ready(d), `the twist is fully on (pose ${JSON.stringify(d.pose)})`).toBe(true);
    // Four frames along the twisted stretch.
    let walls = 0;
    let bright = 0;
    for (let shot = 0; shot < 4; shot++) {
      for (let k = 0; k < 6; k++) await page.clock.fastForward(100);
      const s = await sampleWalls(page, track);
      const wall = s.filter((p) => p.kind === 'wall');
      const mid = s.filter((p) => p.kind === 'mid');
      expect(wall.length, 'wall samples on screen').toBeGreaterThanOrEqual(12);
      // The measure tells wall from backdrop: the corridor's middle is much brighter.
      expect(median(mid.map((p) => p.lum)), 'backdrop in the corridor').toBeGreaterThan(WALL_MAX_LUM + 15);
      // One sample may be under a passing sprite (a gem flying to its slot, a spark of a near
      // miss); the defect this guards against takes whole blocks out of the walls.
      const holes = wall.filter((p) => p.lum > WALL_MAX_LUM);
      expect(holes.length, `holes in the walls (frame ${shot}, ${wall.length} samples): ${JSON.stringify(holes)}`).toBeLessThanOrEqual(1);
      bright += holes.length;
      walls += wall.length;
    }
    // Control, where the renderer is the software one: with Phaser's default (several textures
    // per batch) the same check finds the holes, so it would catch the fix being lost.
    let control = 'not run (hardware GL)';
    if (/swiftshader/i.test(gl.name)) {
      await page.evaluate(() => {
        const r = (window as unknown as { __kivilcimGame: { renderer: { maxTextures: number; renderNodes: { setMaxParallelTextureUnits(n: number): void } } } }).__kivilcimGame.renderer;
        r.renderNodes.setMaxParallelTextureUnits(r.maxTextures);
      });
      let holes = 0;
      for (let shot = 0; shot < 4; shot++) {
        for (let k = 0; k < 6; k++) await page.clock.fastForward(100);
        holes += (await sampleWalls(page, track)).filter((p) => p.kind === 'wall' && p.lum > WALL_MAX_LUM).length;
      }
      control = `${holes} holes with ${await page.evaluate(() => (window as unknown as { __kivilcimGame: { renderer: { maxTextures: number } } }).__kivilcimGame.renderer.maxTextures)} textures per batch`;
      expect(holes, 'the control finds holes under the software renderer').toBeGreaterThan(3);
    }
    expect(bright, 'bright wall samples over the four frames').toBeLessThanOrEqual(1);
    console.warn(`level ${level} (${what}) on ${gl.name}: ${walls} wall samples over 4 frames, ${bright} brighter than ${WALL_MAX_LUM}; control: ${control}`);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ───────────────────────────────────────────────────────────── Dive mode, deaths

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
  // The card sits below the spark.
  expect(d.deadCardY).toBe(300);
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

test('a death inside a dive stretch of a level: the card sits clear of the spark; in the normal view it stays where it was', async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page, errors } = await open(browser, { query: 'fx=1' });
  // Normal view first (level 41's launch): the card is in its usual place.
  await act(page, 'start', { mode: 'level', level: 41 });
  await act(page, 'tap');
  for (let k = 0; k < 80 && (await data(page)).phase === 'playing'; k++) await page.clock.fastForward(100);
  let d = await data(page);
  expect(d.phase).toBe('dead');
  expect(d.pose.flip).toBe(1);
  expect(d.deadCardY).toBe(0);
  // Then inside the dive: fly in on the autopilot, let go.
  await act(page, 'start', { mode: 'level', level: 41 });
  await act(page, 'autopilot', true);
  d = await data(page);
  for (let k = 0; k < 400 && d.phase === 'playing' && !(d.pose.flip === -1 && d.y > 3300); k++) {
    await page.clock.fastForward(100);
    d = await data(page);
  }
  expect(d.pose.flip).toBe(-1);
  await act(page, 'autopilot', false);
  for (let k = 0; k < 80 && (await data(page)).phase === 'playing'; k++) await page.clock.fastForward(100);
  d = await data(page);
  expect(d.phase).toBe('dead');
  expect(d.pose.flip).toBe(-1);
  expect(d.sparkScreen.y).toBeLessThan(600);
  // The card's band starts 160 px + its offset down the screen: below the spark.
  expect(d.deadCardY).toBe(300);
  expect(160 + d.deadCardY).toBeGreaterThan(d.sparkScreen.y);
  // The retry still works from there.
  for (let k = 0; k < 6; k++) await page.clock.fastForward(100);
  await act(page, 'tap');
  for (let k = 0; k < 3; k++) await page.clock.fastForward(33);
  expect((await data(page)).phase).toBe('playing');
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
