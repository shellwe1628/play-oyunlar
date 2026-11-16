import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene, type TestState } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/** Poll the shift's test state until a condition holds (input lands on the next frame). */
type Wait = 'camera' | 'selected' | 'cleared' | 'hint';
async function until(page: Page, kind: Wait, arg: string | number, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    ([k, a]) => {
      const d = window.__OYUN__!.state().data as { camera: number; selected: string | null; hint: string; active: { id: number }[] };
      if (k === 'camera') return d.camera === a;
      if (k === 'selected') return d.selected === a;
      if (k === 'hint') return d.hint.includes(String(a));
      return d.selected === null && !d.active.some((x) => x.id === a);
    },
    [kind, arg] as const,
    { timeout },
  );
}

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
  await waitForScene(page, 'nights', 30_000);
  await act(page, 'night', night);
  await waitForScene(page, 'briefing', 30_000); // first shift on a fresh save
  await act(page, 'ok');
  await waitForScene(page, 'game', 30_000);
}

/** A save that has read the briefing and unlocked `nights` (test fixture, set before load). */
async function seedSave(page: Page, unlocked: number): Promise<void> {
  await page.addInitScript((n) => {
    const data = { unlocked: n, nightBest: [0, 0, 0, 0, 0, 0, 0], log: [], shifts: 0, daily: { date: '', best: 0, streak: 0, last: '' }, briefed: true };
    localStorage.setItem('oyun:fener:save', JSON.stringify({ v: 1, data }));
  }, unlocked);
}

/**
 * Gate smoke test: built game, ?test=1, phone viewport, any console/page error fails.
 * 1) win night 1 by reporting every anomaly as it appears (test-hook actions), pause/resume,
 *    tab-hide auto-pause, result, next night (interstitial), quit, logbook;
 * 2) lose night 1 by doing nothing (brink → second-wind offer runs out);
 * 3) a full night driven by real pointer taps (tabs, monitor, type chips).
 */
test('win a night by reporting everything', async ({ page }) => {
  test.setTimeout(240_000); // a whole night, fast-forwarded in 4 s steps
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });
  expect((await state(page)).scene).toBe('menu');
  await shot(page, gameDir, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'nights', 30_000);
  await shot(page, gameDir, 'nights');
  await act(page, 'night', 1);
  await waitForScene(page, 'briefing', 30_000);
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'briefing');
  await act(page, 'ok');
  await waitForScene(page, 'game', 30_000);
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'game-grace');

  // Pause button, then resume.
  await act(page, 'pause');
  await waitForScene(page, 'pause', 30_000);
  await page.waitForTimeout(300);
  await shot(page, gameDir, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'game', 30_000);

  // Tab hidden → auto-pause; the shift clock must not run while paused.
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause', 30_000);
  const pausedAt = await page.evaluate(() => window.__OYUN__!.state().scene);
  expect(pausedAt).toBe('pause');
  await act(page, 'resume');
  await waitForScene(page, 'game', 30_000);
  const t0 = (await state(page)).data.elapsed as number;
  await act(page, 'pause');
  await waitForScene(page, 'pause', 30_000);
  await page.waitForTimeout(1500);
  await act(page, 'resume');
  await waitForScene(page, 'game', 30_000);
  // 1.5 s in the pause menu: only the few frames around the open/close may have counted
  expect(((await state(page)).data.elapsed as number) - t0).toBeLessThan(1.2);

  let reported = 0;
  let midShot = false;
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    const g = game(s);
    if (g.phase === 'won' || g.phase === 'lost') {
      // the shift is over and the scene is handing off: the pause button must do nothing now
      await act(page, 'pause');
      break;
    }
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
    await act(page, 'fast-forward', 4);
  }
  await waitForScene(page, 'result', 30_000);
  const end = await state(page);
  expect(end.scenes).toEqual(['result']);
  expect(end.data.won).toBe(true);
  expect(reported).toBeGreaterThanOrEqual(5);
  expect(end.data.score as number).toBeGreaterThan(reported * 100);
  expect(end.data.canNext).toBe(true);
  await page.waitForTimeout(1300);
  await shot(page, gameDir, 'result-won');

  // Next night through the interstitial break.
  await act(page, 'next');
  await waitForScene(page, 'game', 30_000);
  expect(game(await state(page)).night).toBe(2);
  await act(page, 'pause');
  await waitForScene(page, 'pause', 30_000);
  await act(page, 'quit');
  await waitForScene(page, 'menu', 30_000);
  const menu = await state(page);
  expect(menu.data.unlocked).toBe(2);
  expect(menu.data.log as number).toBeGreaterThan(0);

  await act(page, 'logbook');
  await waitForScene(page, 'logbook', 30_000);
  expect((await state(page)).data.found as number).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'logbook');
  await act(page, 'tab', 2);
  await act(page, 'back');
  await waitForScene(page, 'menu', 30_000);
  expect(errors).toEqual([]);
});

test('lose a night by doing nothing; daily shift starts', async ({ page }) => {
  test.setTimeout(120_000);
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
  await waitForScene(page, 'result', 30_000);
  const end = await state(page);
  expect(end.data.won).toBe(false);
  expect(end.data.score).toBe(0);
  expect(end.data.canNext).toBe(false);
  await page.waitForTimeout(1300);
  await shot(page, gameDir, 'result-lost');

  await act(page, 'menu');
  await waitForScene(page, 'menu', 30_000);
  expect((await state(page)).data.unlocked).toBe(1);
  await act(page, 'daily');
  await waitForScene(page, 'game', 30_000);
  expect((await state(page)).data.mode).toBe('daily');
  await act(page, 'pause');
  await waitForScene(page, 'pause', 30_000);
  await act(page, 'quit');
  await waitForScene(page, 'menu', 30_000);
  expect(errors).toEqual([]);
});

test('a full night with real pointer taps', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 3, lang: 'en' });
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 720;
  const tap = (x: number, y: number) => page.touchscreen.tap(box.x + x * k, box.y + y * k);

  await tap(360, 1280 * 0.62); // Start shift
  await waitForScene(page, 'nights', 30_000);
  await page.waitForTimeout(300);
  await tap(360, 270); // Night 1
  await waitForScene(page, 'briefing', 30_000);
  await page.waitForTimeout(600);
  await tap(360, 640); // one tap anywhere dismisses the briefing
  await waitForScene(page, 'game', 30_000);
  await page.waitForTimeout(300);

  // During the grace period a tap on an object must not open the chooser.
  const g0 = game(await state(page));
  expect(g0.phase).toBe('grace');
  await tap(g0.feed.x + 320, g0.feed.y + 250); // the lantern lens
  await until(page, 'hint', 'Nothing has changed yet');
  const s0 = (await state(page)).data;
  expect(s0.chipsVisible).toBe(false);
  expect(s0.selected).toBe(null);
  expect(s0.hint).toContain('Nothing has changed yet');

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
        await until(page, 'camera', a.camera);
      }
      await tap(g.feed.x + a.at.x, g.feed.y + a.at.y);
      await until(page, 'selected', a.objectId);
      if (!chipShot) {
        await page.waitForTimeout(200);
        await shot(page, gameDir, 'game-chips');
        chipShot = true;
      }
      const c = g.ui.chips[a.type]!;
      await tap(c.x, c.y);
      await until(page, 'cleared', a.id);
      reported++;
    }
    await act(page, 'fast-forward', 4);
  }
  await waitForScene(page, 'result', 30_000);
  const end = await state(page);
  expect(end.data.won).toBe(true);
  expect(reported).toBeGreaterThanOrEqual(5);
  expect((end.data.lines as string[])[1]).toContain(`Reports ${reported}`);
  expect((end.data.lines as string[])[1]).toContain('False 0');
  expect(errors).toEqual([]);
});

test('real taps on a night with intruders: an intruder is reported by tapping it', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await seedSave(page, 5);
  await openGame(page, { seed: 4, lang: 'tr' });
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 720;
  const tap = (x: number, y: number) => page.touchscreen.tap(box.x + x * k, box.y + y * k);
  await act(page, 'play');
  await waitForScene(page, 'nights', 30_000);
  await act(page, 'night', 5);
  await waitForScene(page, 'game', 30_000);
  expect(game(await state(page)).night).toBe(5);

  const kinds = new Set<string>();
  let shotTaken = false;
  for (let i = 0; i < 400; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    const g = game(s);
    if (g.phase === 'won' || g.phase === 'lost') break;
    if (g.phase === 'brink') await act(page, 'secondWind');
    for (const a of g.active) {
      if (game(await state(page)).camera !== a.camera) {
        const t = g.ui.tabs[a.camera]!;
        await tap(t.x, t.y);
        await until(page, 'camera', a.camera);
      }
      await tap(g.feed.x + a.at.x, g.feed.y + a.at.y);
      await until(page, 'selected', a.objectId);
      if (a.type === 'intruder' && !shotTaken) {
        await page.waitForTimeout(150);
        await shot(page, gameDir, 'game-intruder');
        shotTaken = true;
      }
      const c = g.ui.chips[a.type]!;
      await tap(c.x, c.y);
      await until(page, 'cleared', a.id);
      kinds.add(a.type);
    }
    await act(page, 'fast-forward', 4);
  }
  await waitForScene(page, 'result', 30_000);
  expect(kinds.has('intruder')).toBe(true);
  expect((await state(page)).data.won).toBe(true);
  expect(errors).toEqual([]);
});
