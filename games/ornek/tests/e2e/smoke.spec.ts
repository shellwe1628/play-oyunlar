import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';

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

  // Pause button, then resume.
  await act(page, 'pause');
  await waitForScene(page, 'pause');
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
  await page.waitForTimeout(1200); // count-up + toast finish before the screenshot
  await shot(page, gameDir, 'result');

  // Rewarded flow: the web adapter grants, so the score doubles.
  await act(page, 'double');
  await page.waitForFunction(() => window.__OYUN__?.state().data.doubled === true);
  expect((await state(page)).data.score).toBe((end.data.score as number) * 2);

  await act(page, 'menu');
  await waitForScene(page, 'menu');
  expect((await state(page)).data.best).toBe((end.data.score as number) * 2);

  expect(errors).toEqual([]);
});
