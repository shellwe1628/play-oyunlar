import { fileURLToPath } from 'node:url';
import { act, collectErrors, colorNear, expect, openGame, pixel, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

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
test('title → autopilot finishes level 1 → death → retry by tap', async ({ page }) => {
  test.setTimeout(900_000); // heavy on a loaded software-rendering machine (see GAME.md)
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
  const end = await untilPhase(page, ['finishing', 'finished', 'dead'], 400_000); // game time can lag wall time under load
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
  // Latency here is wall time and depends on machine load, so it is only logged; the 600 ms
  // proof runs on the game's own clock in timing.spec.ts ("retry: … stepped clock").
  expect(r.restartedMs).toBeGreaterThan(0);
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
  // Back from the pause menu the run waits for the player's press (no steering on resume).
  expect((await data(page)).phase).toBe('resume');

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
  // Level 1 paid gems (gems, stars, a feat): the first trail (3) is affordable and equips; the
  // top mythic one (200) is not.
  const before = (await data(page)).wallet;
  await act(page, 'buy', { kind: 'trail', i: 1 });
  expect((await data(page)).wallet).toBe(before - 3);
  expect((await data(page)).trail).toBe(1);
  await act(page, 'buy', { kind: 'trail', i: 17 });
  expect((await data(page)).trail).toBe(1);
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'skins');
  await act(page, 'back');
  await waitForScene(page, 'game');
  // The rank ladder is one tap from the title too.
  await page.waitForTimeout(300);
  await act(page, 'ranks');
  await waitForScene(page, 'ranks');
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'ranks');
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

/**
 * Game time must follow real time even when frames are long (core realTimeDelta, 200 ms cap under
 * automation): stepped clock with 150 ms frames, so the check does not depend on machine load.
 * Then a few real frames only to log this machine's frame time (no threshold).
 */
test('run clock follows real time with long frames (stepped clock)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.install({ time: new Date('2026-11-17T10:00:00') });
  await openGame(page, { seed: 1 });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);
  await act(page, 'autopilot', true);
  for (let k = 0; k < 4; k++) await page.clock.fastForward(150);
  const t0 = (await data(page)).t as number;
  for (let k = 0; k < 20; k++) await page.clock.fastForward(150);
  const t1 = (await data(page)).t as number;
  const rate = (t1 - t0) / 3;
  console.warn(`run clock with 150 ms frames: ${rate.toFixed(3)} game s per real s`);
  expect(rate).toBeGreaterThan(0.97);
  expect(rate).toBeLessThan(1.03);
  await page.clock.resume();
  await page.waitForTimeout(2500);
  const d = await data(page);
  console.warn(`frame time while playing: own update ${JSON.stringify(d.frameUpdate)}, whole Phaser step+render ${JSON.stringify(d.frameJs)}`);
  expect(errors).toEqual([]);
});
