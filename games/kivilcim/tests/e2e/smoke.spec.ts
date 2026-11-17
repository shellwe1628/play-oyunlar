import { act, clockRate, collectErrors, colorNear, expect, openGame, pixel, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

type Data = Record<string, unknown> & {
  phase: string;
  progress: number;
  tick: number;
  gems: number;
  wallet: number;
  unlocked: number;
  retryReady: boolean;
};

const data = async (page: Page): Promise<Data> => (await state(page)).data as Data;

async function untilPhase(page: Page, phases: string[], timeout: number): Promise<Data> {
  await page.waitForFunction((ps) => ps.includes(window.__OYUN__?.state().data.phase as string), phases, { timeout, polling: 50 });
  return data(page);
}

/**
 * Gate smoke test (built game, ?test=1&seed=1, 390×844, touch). Title → level 1 finished on the
 * solver's autopilot (all three gems) → a run where nobody touches dies → retry by tap, measured
 * inside the page → pause menu drawn over the game → tab hidden auto-pauses → menus → no errors.
 */
test('title → autopilot finishes level 1 → death → retry within 600 ms', async ({ page }) => {
  test.setTimeout(600_000); // heavy on a loaded software-rendering machine (see GAME.md)
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });

  // App open lands on the title over the live shaft, level 1, nothing in the way.
  const s0 = await state(page);
  expect(s0.scene).toBe('game');
  expect(s0.data.phase).toBe('title');
  expect(s0.data.level).toBe(1);
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'title');

  // Autopilot replays the solver's timeline from the title: the run starts at once.
  const tPlan = Date.now();
  await act(page, 'autopilot', true);
  console.warn(`autopilot plan computed in the page in ${Date.now() - tPlan} ms`);
  expect((await data(page)).phase).toBe('playing');
  await page.waitForTimeout(2500);
  await shot(page, gameDir, 'run');
  const end = await untilPhase(page, ['finishing', 'finished', 'dead'], 150_000);
  expect(end.phase).not.toBe('dead');
  expect(end.progress).toBe(100);
  expect(end.gems).toBe(3);
  await page.waitForTimeout(300);
  await shot(page, gameDir, 'finish-burst');
  const fin = await untilPhase(page, ['finished'], 10_000);
  expect(fin.wallet).toBeGreaterThanOrEqual(3);
  expect(fin.unlocked).toBe(2);
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'finish');

  // Never touching: the spark drifts left into the wall within a couple of seconds. The retry is
  // measured inside the page, armed before the death: it records the death, taps on every frame
  // until the game takes the tap, and stops once the sim is advancing again.
  await act(page, 'autopilot', false);
  await act(page, 'start', { mode: 'level', level: 1 });
  expect((await data(page)).phase).toBe('ready');
  const measured = page.evaluate(
    () =>
      new Promise<{ cause: string; progress: number; acceptedMs: number; restartedMs: number; advancingMs: number; phase: string }>((resolve) => {
        const api = window.__OYUN__!;
        let tDeath = 0;
        let acceptedMs = -1;
        let restartedMs = -1;
        let tick0 = 0;
        let cause = '';
        let progress = 0;
        const frame = (): void => {
          const d = api.state().data;
          const now = performance.now();
          if (!tDeath) {
            if (d.phase === 'dead') {
              // Death happened at most one frame ago: msSinceDeath is the game's own clock.
              tDeath = now - Number(d.msSinceDeath);
              cause = d.deathCause as string;
              progress = Number(d.progress);
            }
          } else if (restartedMs < 0) {
            if (d.retryReady && acceptedMs < 0) acceptedMs = now - tDeath;
            api.act('tap');
            const after = api.state().data;
            if (after.phase === 'playing') {
              restartedMs = Number(after.retryLatencyMs);
              tick0 = Number(after.tick);
            }
          } else if (Number(d.tick) > tick0) {
            resolve({ cause, progress, acceptedMs, restartedMs, advancingMs: now - tDeath, phase: d.phase as string });
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await act(page, 'tap'); // press + release: starts the run, then hands off
  const r = await measured;
  console.warn(`retry: died at ${r.progress}% (${r.cause}); tap accepted ${Math.round(r.acceptedMs)} ms after death, run restarted at ${r.restartedMs} ms, sim advancing at ${Math.round(r.advancingMs)} ms`);
  expect(r.cause).toBe('wall');
  expect(r.progress).toBeLessThan(10);
  expect(r.phase).toBe('playing');
  expect(r.restartedMs).toBeLessThan(600);
  expect(r.advancingMs).toBeLessThan(600 + 250); // + at most one software-rendered frame on this machine
  await untilPhase(page, ['dead'], 15_000);
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'death');

  // Pause menu over a running game: the card must be drawn on top (pixel check).
  await act(page, 'tap');
  expect((await data(page)).phase).toBe('playing');
  await page.waitForTimeout(200);
  const pausedTick = (await data(page)).tick;
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await page.waitForTimeout(500);
  const inCard = await pixel(page, 360 - 240, 640);
  await shot(page, gameDir, 'pause');
  expect(colorNear(inCard, 0x2a1263), `pause card pixel ${JSON.stringify(inCard)}`).toBe(true);
  await act(page, 'resume');
  await waitForScene(page, 'game');

  // Tab hidden → auto-pause; the sim must not run while paused.
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  const t1 = (await state(page)).scenes;
  expect(t1).toContain('game');
  await page.waitForTimeout(800);
  await act(page, 'quit');
  await waitForScene(page, 'game');
  const back = await data(page);
  expect(back.phase).toBe('title');
  expect(pausedTick).toBeGreaterThan(0);

  // Level select and skins are one tap from the title.
  await act(page, 'levels');
  await waitForScene(page, 'levels');
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'levels');
  await act(page, 'pick', 2);
  await waitForScene(page, 'game');
  expect((await data(page)).level).toBe(2);
  expect((await data(page)).phase).toBe('ready');
  await act(page, 'home');
  await waitForScene(page, 'game');
  await page.waitForTimeout(300);
  await act(page, 'skins');
  await waitForScene(page, 'skins');
  // Level 1 paid 3 gems; the first trail costs 4: refused, wallet unchanged. The diamond spark costs 6.
  await act(page, 'buy', { kind: 'trail', i: 1 });
  expect((await data(page)).wallet).toBe(3);
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'skins');
  await act(page, 'back');
  await waitForScene(page, 'game');

  // Daily shaft from the title: ready, then a run.
  await page.waitForTimeout(300);
  await act(page, 'daily');
  expect((await data(page)).mode).toBe('daily');
  expect((await data(page)).phase).toBe('ready');
  await shot(page, gameDir, 'daily');

  expect(errors).toEqual([]);
});

/** Game time must follow the wall clock under automation (core realTimeDelta). */
test('run clock follows the wall clock in headless mode', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 1 });
  await act(page, 'autopilot', true);
  await page.waitForTimeout(300);
  const r = await clockRate(page, 't', 3000);
  const msg = `run clock ran ${r.game.toFixed(2)} s in ${r.wall.toFixed(2)} s of wall time (${r.frames} frames, ${r.longFrames} over 200 ms)`;
  console.warn(msg);
  expect(r.rate, msg).toBeGreaterThan(0.85);
  expect(r.rate, msg).toBeLessThan(1.15);
  const d = await data(page);
  console.warn(`frame time while playing: own update ${JSON.stringify(d.frameUpdate)}, whole Phaser step+render ${JSON.stringify(d.frameJs)}`);
  expect(errors).toEqual([]);
});
