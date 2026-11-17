import { act, collectErrors, expect, openGame, state, test, waitForScene } from '@oyun/core/e2e';
import type { Browser, Page } from '@playwright/test';

type Data = Record<string, unknown> & {
  phase: string;
  tick: number;
  t: number;
  dir: number;
  held: boolean;
  heldTicks: number;
  height: number;
  alive: boolean;
  tickLog: [number, number, number][];
};
const data = async (page: Page): Promise<Data> => (await state(page)).data as Data;

/** Open with a stepped clock: time moves only when the test says so. */
async function openStepped(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-17T10:00:00') });
  await openGame(page, { seed: 1, lang: 'en' });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);
}

/** Press or release through the game's real input handler and return the event time. */
async function edge(page: Page, held: boolean): Promise<number> {
  return page.evaluate((h) => {
    window.__OYUN__!.act('hold', h);
    return performance.now();
  }, held);
}

test.describe('input timing (stepped clock)', () => {
  test('a 5 ms tap between frames gives exactly one held tick; a press 3 ms before the end of a 200 ms frame applies from the right tick', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await openStepped(page);
    const frame = (): Promise<void> => page.clock.runFor(17);
    await act(page, 'start', { mode: 'level', level: 1 });

    // The press that starts the run is its first edge: a quick tap = one held tick.
    await edge(page, true);
    await edge(page, false);
    for (let k = 0; k < 4; k++) await frame();
    let d = await data(page);
    expect(d.phase).toBe('playing');
    expect(d.heldTicks).toBe(1);

    // A 5 ms tap: press, 5 ms of time with no frame in between, release.
    for (let n = 0; n < 3; n++) {
      const h0 = (await data(page)).heldTicks;
      await edge(page, true);
      await page.clock.runFor(5);
      await edge(page, false);
      for (let k = 0; k < 3; k++) await frame();
      d = await data(page);
      expect(d.heldTicks - h0, `tap ${n}`).toBe(1);
      for (let k = 0; k < 4; k++) await frame();
    }

    // A 200 ms frame: the game loop sleeps (as on a hitch), 197 ms pass, the finger goes down,
    // 3 ms more pass, the loop wakes and one frame covers the whole 200+ ms.
    await page.evaluate(() => (window as unknown as { __kivilcimGame: { loop: { sleep(): void } } }).__kivilcimGame.loop.sleep());
    const tickBefore = (await data(page)).tick;
    await page.clock.runFor(197);
    const pressAt = await edge(page, true);
    await page.clock.runFor(3);
    await page.evaluate(() => (window as unknown as { __kivilcimGame: { loop: { wake(): void } } }).__kivilcimGame.loop.wake());
    await frame();
    d = await data(page);
    const ticks = d.tick - tickBefore;
    expect(ticks).toBeGreaterThanOrEqual(20); // the long frame really ran ~24 ticks at once
    const inFrame = d.tickLog.filter(([id]) => id > tickBefore && id <= tickBefore + ticks);
    const firstHeld = inFrame.find(([, , h]) => h === 1);
    expect(firstHeld, JSON.stringify(inFrame)).toBeDefined();
    // Every tick before the press ran released; the first held tick is the first one ending at
    // or after the press.
    for (const [, time, h] of inFrame) expect(h, `tick ending ${time} vs press ${pressAt}`).toBe(time >= pressAt ? 1 : 0);
    console.warn(`200 ms frame: ${ticks} ticks, press at ${pressAt.toFixed(1)}, first held tick ends ${firstHeld![1]} (${inFrame.filter(([, , h]) => h === 1).length} held ticks in that frame)`);
    expect(errors).toEqual([]);
  });

  test('at 30 fps with Phaser clamping its delta, the run keeps real time from the first second', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await openStepped(page);
    // Emulate what real players get from Phaser 4.2.1: frame deltas clamped to 16.7 ms (unfocused
    // window, and the first 120 frames after load or refocus). Core lifts this only under
    // automation; the game must not depend on that.
    await page.evaluate(() => {
      const g = (window as unknown as { __kivilcimGame: { loop: { smoothDelta: (d: number) => number } } }).__kivilcimGame;
      g.loop.smoothDelta = (d: number): number => Math.min(d, 1000 / 60);
    });
    await act(page, 'autopilot', true);
    const fps30 = async (frames: number): Promise<{ sim: number; real: number; px: number }> => {
      const a = await data(page);
      const r0 = await page.evaluate(() => performance.now());
      for (let k = 0; k < frames; k++) await page.clock.fastForward(33);
      const b = await data(page);
      const r1 = await page.evaluate(() => performance.now());
      return { sim: b.t - a.t, real: (r1 - r0) / 1000, px: (b.height - a.height) * 10 };
    };
    const first = await fps30(30);
    await fps30(60);
    const later = await fps30(30);
    const rate = (x: { sim: number; real: number }): number => x.sim / x.real;
    console.warn(`30 fps, clamped deltas: first second ${rate(first).toFixed(3)} sim s per real s (${(first.px / first.real).toFixed(0)} px/s during the launch ramp), later ${rate(later).toFixed(3)} (${(later.px / later.real).toFixed(0)} px/s)`);
    expect(rate(first)).toBeGreaterThan(0.95);
    expect(rate(first)).toBeLessThan(1.05);
    expect(rate(later)).toBeGreaterThan(0.95);
    expect(rate(later)).toBeLessThan(1.05);
    expect(errors).toEqual([]);
  });

  test('after the pause menu the run waits for a press, and that press is the hold', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await openStepped(page);
    const frame = (): Promise<void> => page.clock.runFor(17);
    await act(page, 'start', { mode: 'level', level: 1 });
    await edge(page, true); // start, holding
    for (let k = 0; k < 6; k++) await frame();
    await act(page, 'pause');
    for (let k = 0; k < 3; k++) await frame();
    await waitForScene(page, 'pause');
    await act(page, 'resume');
    for (let k = 0; k < 3; k++) await frame();
    let d = await data(page);
    expect(d.phase).toBe('resume');
    const tick = d.tick;
    for (let k = 0; k < 10; k++) await frame();
    expect((await data(page)).tick).toBe(tick); // nothing moves until the player presses
    await edge(page, true);
    for (let k = 0; k < 3; k++) await frame();
    d = await data(page);
    expect(d.phase).toBe('playing');
    expect(d.tick).toBeGreaterThan(tick);
    expect(d.dir).toBe(1); // the press is the hold
    expect(errors).toEqual([]);
  });

  test('a press during the fade to another screen does not start a run; locked levels say why', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, { seed: 1, lang: 'en' });
    await page.evaluate(() => {
      window.__OYUN__!.act('levels');
      window.__OYUN__!.act('hold', true); // lands inside the 140 ms fade
      window.__OYUN__!.act('hold', false);
    });
    await waitForScene(page, 'levels');
    const meta = (await state(page)).meta as { platformCalls?: string[] };
    expect(meta.platformCalls ?? []).not.toContain('gameplayStart');
    await act(page, 'pick', 5);
    expect((await state(page)).data.lockedTaps).toBe(1);
    expect((await state(page)).scene).toBe('levels');
    expect(errors).toEqual([]);
  });
});

test('first run ever: "let go!" then "hold!" as the walls approach, once, never again', async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openStepped(page);
  await edge(page, true); // first press on the title: the run starts, holding (going right)
  const seen: string[] = [];
  for (let i = 0; i < 400 && seen.length < 2; i++) {
    await page.clock.runFor(17);
    const d = await data(page);
    const cue = d.cue as string;
    if (cue && seen[seen.length - 1] !== cue) {
      seen.push(cue);
      await edge(page, !cue.includes('LET GO')); // react as told
    }
    expect(d.phase).toBe('playing'); // the chamber is wide enough to react in time
  }
  expect(seen).toEqual(['← LET GO!', 'HOLD! →']);
  for (let k = 0; k < 20; k++) await page.clock.runFor(17);
  expect((await data(page)).tutorialStep).toBe(-1);
  // A later session (same storage): no cues. (The clock is per context: let time flow again.)
  await page.clock.resume();
  const again = await context.newPage();
  await openGame(again, { seed: 1, lang: 'en' });
  expect((await state(again)).data.tutorialStep).toBe(-1);
  expect(errors).toEqual([]);
});

test('endless and daily fly on autopilot (planned ahead incrementally)', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 3, lang: 'tr' });
  // Waits on the game's own clock (sim seconds), not wall time: on a loaded machine frames
  // longer than 200 ms make game time run slower than the wall.
  const until = (secs: number): Promise<unknown> =>
    page.waitForFunction((t) => Number(window.__OYUN__?.state().data.t) >= t || window.__OYUN__?.state().data.phase !== 'playing', secs, { timeout: 300_000, polling: 500 });
  await act(page, 'start', { mode: 'endless' });
  await act(page, 'autopilot', true);
  await until(40);
  let d = await data(page);
  console.warn(`endless autopilot: ${d.height} m after ${d.t.toFixed(1)} s of game time (phase ${d.phase})`);
  expect(d.phase).toBe('playing');
  expect(d.height).toBeGreaterThan(1500);
  await act(page, 'autopilot', false);
  await act(page, 'start', { mode: 'daily' });
  await act(page, 'autopilot', true);
  await until(12);
  d = await data(page);
  console.warn(`daily autopilot: ${d.height} m after ${d.t.toFixed(1)} s (phase ${d.phase})`);
  expect(d.phase).toBe('playing');
  expect(d.height).toBeGreaterThan(300);
  expect(errors).toEqual([]);
});

/**
 * Retry latency on the game's own clock (stepped): independent of machine load. A run nobody
 * touches dies on the wall; from then on the player taps on every frame. The tap must be taken and
 * the new run must be advancing within 600 ms of game time after the death, at 30 and 60 fps,
 * with the presentation on and off (nothing in the presentation may delay it).
 */
async function retryOnGameClock(browser: Browser, fx: boolean, frameMs: number): Promise<{ acceptedMs: number; advancingMs: number; cause: string }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.clock.install({ time: new Date('2026-11-17T10:00:00') });
  await openGame(page, { seed: 1, lang: 'en', query: fx ? 'fx=1' : 'fx=0' });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);
  await act(page, 'start', { mode: 'level', level: 1 });
  await act(page, 'tap'); // press + release: the run starts and drifts left into the wall
  let deathAt = -1;
  let cause = '';
  for (let k = 0; k < 600 && deathAt < 0; k++) {
    await page.clock.fastForward(frameMs);
    const d = await data(page);
    if (d.phase === 'dead') {
      deathAt = (await page.evaluate(() => performance.now())) - Number(d.msSinceDeath);
      cause = d.deathCause as string;
    }
  }
  expect(deathAt, 'the untouched run dies').toBeGreaterThan(0);
  let acceptedMs = -1;
  let advancingMs = -1;
  let tick0 = -1;
  for (let k = 0; k < 2000 / frameMs && advancingMs < 0; k++) {
    await page.clock.fastForward(frameMs);
    const r = await page.evaluate(() => {
      const api = window.__OYUN__!;
      if (api.state().data.phase === 'dead') api.act('tap');
      const d = api.state().data;
      return { phase: d.phase as string, tick: Number(d.tick), latency: Number(d.retryLatencyMs), now: performance.now() };
    });
    if (r.phase === 'playing' && acceptedMs < 0) {
      acceptedMs = r.latency;
      tick0 = r.tick;
    } else if (acceptedMs >= 0 && r.tick > tick0) advancingMs = r.now - deathAt;
  }
  expect(errors).toEqual([]);
  await ctx.close();
  return { acceptedMs, advancingMs, cause };
}

test('retry: tap taken and run advancing within 600 ms of game time after death (stepped clock, fx on/off, 30/60 fps)', async ({ browser }) => {
  test.setTimeout(400_000);
  for (const [fx, frameMs] of [
    [true, 33],
    [false, 33],
    [true, 17],
  ] as const) {
    const r = await retryOnGameClock(browser, fx, frameMs);
    console.warn(`retry (fx ${fx ? 'on' : 'off'}, ${frameMs} ms frames, game clock): died on ${r.cause}, tap taken at ${r.acceptedMs} ms, run advancing at ${Math.round(r.advancingMs)} ms`);
    expect(r.cause).toBe('wall');
    expect(r.acceptedMs).toBeGreaterThan(0);
    expect(r.acceptedMs).toBeLessThan(600);
    expect(r.advancingMs).toBeGreaterThan(0);
    expect(r.advancingMs).toBeLessThan(600);
  }
});
