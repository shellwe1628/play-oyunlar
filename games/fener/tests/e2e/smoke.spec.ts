import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene, type TestState } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

interface Active {
  id: number;
  camera: number;
  objectId: string;
  type: string;
  at: { x: number; y: number };
}
interface Pt {
  x: number;
  y: number;
}
const game = (s: TestState) =>
  s.data as unknown as {
    phase: string;
    camera: number;
    score: number;
    night: number;
    clock: string;
    active: Active[];
    feed: { x: number; y: number };
    ui: { tabs: Pt[]; chips: Record<string, Pt> };
    stats: { correct: number; typed: number; falseReports: number };
  };

async function startNight(page: Page, night: number): Promise<void> {
  await act(page, 'play');
  await waitForScene(page, 'nights');
  await act(page, 'night', night);
  await waitForScene(page, 'game');
}

/**
 * Gate smoke test: built game, ?test=1, phone viewport, any console/page error fails.
 * 1) win night 1 by reporting every anomaly as it appears (test-hook actions), pause/resume,
 *    tab-hide auto-pause, result, next night (interstitial), quit, logbook;
 * 2) lose night 1 by doing nothing (brink → second-wind offer runs out);
 * 3) a full night driven by real pointer taps (tabs, monitor, type chips).
 */
test('win a night by reporting everything', async ({ page }) => {
  test.setTimeout(120_000); // a whole night, fast-forwarded in 2 s steps
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });
  expect((await state(page)).scene).toBe('menu');
  await shot(page, gameDir, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'nights');
  await shot(page, gameDir, 'nights');
  await act(page, 'night', 1);
  await waitForScene(page, 'game');
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'game-grace');

  // Pause button, then resume.
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await page.waitForTimeout(300);
  await shot(page, gameDir, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'game');

  // Tab hidden → auto-pause; the shift clock must not run while paused.
  const before = game(await state(page)).clock;
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  await page.waitForTimeout(1500);
  await act(page, 'resume');
  await waitForScene(page, 'game');
  expect(game(await state(page)).clock).toBe(before);

  let reported = 0;
  let midShot = false;
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    const g = game(s);
    if (g.phase === 'won' || g.phase === 'lost') break;
    for (const a of g.active) {
      await act(page, 'switch', a.camera);
      if (!midShot) {
        await page.waitForTimeout(250);
        await shot(page, gameDir, 'game-anomaly');
        midShot = true;
      }
      await act(page, 'report', { camera: a.camera, objectId: a.objectId, type: a.type });
      reported++;
    }
    await act(page, 'fast-forward', 2);
  }
  await waitForScene(page, 'result', 15_000);
  const end = await state(page);
  expect(end.data.won).toBe(true);
  expect(reported).toBeGreaterThanOrEqual(5);
  expect(end.data.score as number).toBeGreaterThan(reported * 100);
  expect(end.data.canNext).toBe(true);
  await page.waitForTimeout(1300);
  await shot(page, gameDir, 'result-won');

  // Next night through the interstitial break.
  await act(page, 'next');
  await waitForScene(page, 'game');
  expect(game(await state(page)).night).toBe(2);
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await act(page, 'quit');
  await waitForScene(page, 'menu');
  const menu = await state(page);
  expect(menu.data.unlocked).toBe(2);
  expect(menu.data.log as number).toBeGreaterThan(0);

  await act(page, 'logbook');
  await waitForScene(page, 'logbook');
  expect((await state(page)).data.found as number).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'logbook');
  await act(page, 'tab', 2);
  await act(page, 'back');
  await waitForScene(page, 'menu');
  expect(errors).toEqual([]);
});

test('lose a night by doing nothing; daily shift starts', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 2, lang: 'en' });
  await startNight(page, 1);
  let sawBrink = false;
  for (let i = 0; i < 100; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    const g = game(s);
    if (g.phase === 'lost') break;
    if (g.phase === 'brink' && !sawBrink) {
      sawBrink = true;
      expect(g.active).toHaveLength(4);
      await page.waitForTimeout(500);
      await shot(page, gameDir, 'game-brink');
    }
    await act(page, 'fast-forward', 3);
  }
  expect(sawBrink).toBe(true);
  await waitForScene(page, 'result', 15_000);
  const end = await state(page);
  expect(end.data.won).toBe(false);
  expect(end.data.score).toBe(0);
  expect(end.data.canNext).toBe(false);
  await page.waitForTimeout(1300);
  await shot(page, gameDir, 'result-lost');

  await act(page, 'menu');
  await waitForScene(page, 'menu');
  expect((await state(page)).data.unlocked).toBe(1);
  await act(page, 'daily');
  await waitForScene(page, 'game');
  expect((await state(page)).data.mode).toBe('daily');
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await act(page, 'quit');
  await waitForScene(page, 'menu');
  expect(errors).toEqual([]);
});

test('a full night with real pointer taps', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 3, lang: 'en' });
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 720;
  const tap = (x: number, y: number) => page.touchscreen.tap(box.x + x * k, box.y + y * k);

  await tap(360, 1280 * 0.62); // Start shift
  await waitForScene(page, 'nights');
  await page.waitForTimeout(300);
  await tap(360, 270); // Night 1
  await waitForScene(page, 'game');
  await page.waitForTimeout(300);

  let reported = 0;
  let chipShot = false;
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    const g = game(s);
    if (g.phase === 'won' || g.phase === 'lost') break;
    for (const a of g.active) {
      if (game(await state(page)).camera !== a.camera) {
        const t = g.ui.tabs[a.camera]!;
        await tap(t.x, t.y);
        await page.waitForTimeout(60);
      }
      expect(game(await state(page)).camera).toBe(a.camera);
      await tap(g.feed.x + a.at.x, g.feed.y + a.at.y);
      await page.waitForTimeout(60);
      const sel = (await state(page)).data;
      expect(sel.selected).toBe(a.objectId);
      if (!chipShot) {
        await page.waitForTimeout(200);
        await shot(page, gameDir, 'game-chips');
        chipShot = true;
      }
      const c = g.ui.chips[a.type]!;
      await tap(c.x, c.y);
      await page.waitForTimeout(60);
      reported++;
    }
    await act(page, 'fast-forward', 2);
  }
  await waitForScene(page, 'result', 15_000);
  const end = await state(page);
  expect(end.data.won).toBe(true);
  expect(reported).toBeGreaterThanOrEqual(5);
  expect((end.data.lines as string[])[1]).toContain(`Reports ${reported}`);
  expect((end.data.lines as string[])[1]).toContain('False 0');
  expect(errors).toEqual([]);
});
