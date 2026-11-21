import { act, clockRate, collectErrors, colorNear, expect, openGame, pixel, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';
import { DEFAULT_THEME, findOverlaps, logicalSize, type Orientation } from '@oyun/core/pure';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * Gate smoke test: built game, ?test=1&seed=1, phone viewport. Drives a full session through
 * window.__OYUN__ (menu → game → pause/resume → result), fails on any console or page error.
 */
test('menu → game → result without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });

  expect((await state(page)).scene).toBe('menu');
  await shot(page, gameDir, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'game');

  // Hit the target a few times through the same handler a finger tap uses.
  for (let i = 0; i < 5; i++) {
    await act(page, 'tapTarget');
    await page.waitForTimeout(150);
  }
  const mid = await state(page);
  expect(mid.data.score).toBeGreaterThanOrEqual(5);
  await shot(page, gameDir, 'game');

  // Pause button, then resume. The menu must be DRAWN above the (opaque) game scene, not only
  // active: read the rendered pixel inside the pause card, left of the buttons.
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await page.waitForTimeout(500); // card pop-in settles
  const size = logicalSize((await state(page)).meta.orientation as Orientation);
  const inCard = await pixel(page, size.width / 2 - 240, size.height / 2);
  await shot(page, gameDir, 'pause');
  expect(colorNear(inCard, DEFAULT_THEME.colors.surface), `pause card pixel ${JSON.stringify(inCard)}`).toBe(true);
  await act(page, 'resume');
  await waitForScene(page, 'game');

  // Tab hidden → auto-pause (platform lifecycle); the round clock must not run while paused.
  const before = (await state(page)).data.timeLeft as number;
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  await page.waitForTimeout(1500);
  await act(page, 'resume');
  await waitForScene(page, 'game');
  expect((await state(page)).data.timeLeft as number).toBeGreaterThan(before - 0.5);

  // Let the timer run out.
  await waitForScene(page, 'result', 30_000);
  const end = await state(page);
  expect(end.data.score).toBeGreaterThanOrEqual(5);
  expect(end.data.newBest).toBe(true);
  await page.waitForTimeout(1200); // count-up + new-best badge finish before the screenshot
  await shot(page, gameDir, 'result');
  // The new-best badge is a row of the score card: nothing on the result screen may overlap.
  const rects = (await state(page)).data.rects as Record<string, number[]>;
  expect(Object.keys(rects)).toContain('badge');
  expect(findOverlaps(rects), JSON.stringify(rects)).toEqual([]);

  // Rewarded flow: the web adapter grants, so the score doubles.
  await act(page, 'double');
  await page.waitForFunction(() => window.__OYUN__?.state().data.doubled === true);
  expect((await state(page)).data.score).toBe((end.data.score as number) * 2);

  await act(page, 'menu');
  await waitForScene(page, 'menu');
  expect((await state(page)).data.best).toBe((end.data.score as number) * 2);

  expect(errors).toEqual([]);
});

/**
 * Game time must follow the wall clock under automation: headless Chromium is never a focused
 * window and runs at a low frame rate on a loaded machine, where Phaser's default smoothing
 * clamps every frame to 16.7 ms (core turns that off with ?test=1 / navigator.webdriver).
 */
test('round clock follows the wall clock in headless mode', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 1 });
  await act(page, 'play');
  await waitForScene(page, 'game');
  const r = await clockRate(page, 'timeLeft', 3000);
  const msg = `round clock ran ${r.game.toFixed(2)} s in ${r.wall.toFixed(2)} s of wall time (${r.frames} frames, ${r.longFrames} over 200 ms)`;
  expect(r.rate, msg).toBeGreaterThan(0.85);
  expect(r.rate, msg).toBeLessThan(1.15);
  expect(errors).toEqual([]);
});
