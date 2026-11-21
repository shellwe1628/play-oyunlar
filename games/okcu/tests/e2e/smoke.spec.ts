import { act, clockRate, collectErrors, colorNear, expect, openGame, pixel, shot, state, test, waitForScene } from '@oyun/core/e2e';
import { DEFAULT_THEME, findOverlaps } from '@oyun/core/pure';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

async function phase(page: Page): Promise<string> {
  return (await state(page)).data.phase as string;
}

/**
 * Gate smoke test (built game, ?test=1&seed=1, phone viewport): the title is the first shot;
 * the scripted player clears wave 1, picks a card, pauses, then stops shooting until the run
 * ends; the result screen shows the wave and the coins are saved.
 */
test('title → wave 1 cleared → card → stop shooting → result, coins saved', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });
  const s0 = await state(page);
  expect(s0.scene).toBe('game');
  expect(s0.data.phase).toBe('title');
  expect(s0.data.coins).toBe(0);
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'title');

  // the first shot IS the start: the aimbot fires through the same release handler a finger uses
  for (let i = 0; i < 40 && (await phase(page)) !== 'cards'; i++) {
    const p = await phase(page);
    if (p === 'title' || p === 'play') await act(page, 'aimbot', { error: 0.004 });
    await page.waitForTimeout(400);
    if (i === 0) await shot(page, gameDir, 'first-shot');
  }
  await page.waitForFunction(() => window.__OYUN__?.state().data.phase === 'cards', null, { timeout: 20_000 });
  const cleared = await state(page);
  expect(cleared.data.wave).toBe(1);
  expect(cleared.data.kos).toBeGreaterThanOrEqual(1);
  expect(cleared.data.firstKoShot).toBeLessThanOrEqual(3);
  expect((cleared.data.offer as string[]).length).toBe(3);
  // progress is banked at the wave clear, not only at death
  // (achievements unlocked on the way, like the first knockout, pay their coins on top)
  expect(cleared.data.savedCoins).toBe((cleared.data.coins as number) + (cleared.data.featCoins as number));
  expect(cleared.data.best).toBe(2);
  await page.waitForTimeout(800); // cards slam in
  await shot(page, gameDir, 'cards');
  await act(page, 'pick-card', 0);
  await page.waitForFunction(() => window.__OYUN__?.state().data.phase === 'play', null, { timeout: 10_000 });
  const w2 = await state(page);
  expect(w2.data.wave).toBe(2);
  expect((w2.data.cards as string[]).length).toBe(1);

  // the round clock follows the wall clock under automation
  const r = await clockRate(page, 'time', 2500);
  expect(r.rate, `game ${r.game.toFixed(2)} s in ${r.cappedWall.toFixed(2)} s`).toBeGreaterThan(0.85);
  expect(r.rate).toBeLessThan(1.15);

  // pause: the menu is drawn above the opaque game scene
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await page.waitForTimeout(500);
  const inCard = await pixel(page, 360 - 240, 640);
  await shot(page, gameDir, 'pause');
  expect(colorNear(inCard, DEFAULT_THEME.colors.surface), JSON.stringify(inCard)).toBe(true);
  await act(page, 'resume');
  await waitForScene(page, 'game');

  // stop shooting; let the archers win (game time sped up through the documented advance action)
  for (let i = 0; i < 60; i++) {
    const s = await state(page);
    if (s.scene !== 'game') break;
    // the run can end between the state read and the action (scene already switching)
    await act(page, 'advance', 2).catch(() => undefined);
    await page.waitForTimeout(100);
  }
  await waitForScene(page, 'result', 20_000);
  const end = await state(page);
  expect(end.data.score).toBe(2);
  expect(end.data.coins as number).toBeGreaterThan(0);
  expect(end.data.savedCoins).toBe((end.data.coins as number) + (end.data.featCoins as number));
  expect(end.data.newBest).toBe(true);
  expect(end.data.canRevive).toBe(true);
  await page.waitForTimeout(1300);
  await shot(page, gameDir, 'result');
  const rects = end.data.rects as Record<string, number[]>;
  expect(findOverlaps(rects), JSON.stringify(rects)).toEqual([]);

  // rewarded double coins (the web adapter grants)
  await act(page, 'double');
  await page.waitForFunction(() => window.__OYUN__?.state().data.doubled === true, null, { timeout: 10_000 });
  expect((await state(page)).data.savedCoins).toBe((end.data.coins as number) * 2 + (end.data.featCoins as number));

  // upgrades are one tap away and the coins can be spent
  await act(page, 'shop');
  await waitForScene(page, 'shop');
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'shop');
  const before = (await state(page)).data.coins as number;
  if (before >= 25) {
    await act(page, 'buy', 'hp');
    expect((await state(page)).data.coins).toBe(before - 25);
  }
  await act(page, 'back');
  await waitForScene(page, 'game');
  expect((await state(page)).data.phase).toBe('title');
  expect(errors).toEqual([]);
});

/** Touch helpers: real touch events through the Chrome DevTools protocol (Playwright has no drag for touch). */
async function touchApi(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.x, y: r.y, k: r.width / 720 };
  });
  const toCss = (x: number, y: number) => ({ x: box.x + x * box.k, y: box.y + y * box.k });
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  return {
    /** Drag from logical (x0, y0) by the pull vector (dx, dy), in steps, then lift. */
    async drag(x0: number, y0: number, dx: number, dy: number, steps = 6): Promise<void> {
      const a = toCss(x0, y0);
      await send('touchStart', [{ ...a, id: 1 }]);
      for (let i = 1; i <= steps; i++) {
        const p = toCss(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
        await send('touchMove', [{ ...p, id: 1 }]);
      }
      await send('touchEnd', []);
    },
    async tap(x: number, y: number): Promise<void> {
      const a = toCss(x, y);
      await send('touchStart', [{ ...a, id: 1 }]);
      await send('touchEnd', []);
    },
    send,
    toCss,
  };
}

/**
 * Real touch only (no test actions for input): a drag-and-release knocks out the wave-1 archer
 * and a tap picks a card. The drag is computed from the game's published mapping
 * (state.drag) and the ideal shot (state.solution); the test then waits on game state, so it
 * does not depend on this machine's frame rate. Also checks a tiny drag cancels instead of
 * firing, and a cancelled touch never leaves the bow drawn.
 */
test('real touch: drag to knock out an archer, tap to pick a card', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'en' });
  const t = await touchApi(page);
  const startX = 380;
  const startY = 560; // open sky: not on a button, the finger covers no archer

  // a tiny drag is a cancel, not a dud arrow
  await t.drag(startX, startY, -12, 8, 3);
  await page.waitForTimeout(300);
  expect((await state(page)).data.shots).toBe(0);
  expect((await state(page)).data.phase).toBe('title');

  // a cancelled touch (system gesture) never leaves the bow drawn
  const a = t.toCss(startX, startY);
  const b = t.toCss(startX - 120, startY + 100);
  await t.send('touchStart', [{ ...a, id: 1 }]);
  await t.send('touchMove', [{ ...b, id: 1 }]);
  await page.waitForFunction(() => window.__OYUN__?.state().data.aiming === true, null, { timeout: 5000 });
  // the browser cancels the pointer (system gesture). A CDP touchCancel works too but makes
  // Chrome log an intervention as a console error, which the gate counts; pointercancel is the
  // event the game listens for (touchcancel takes the same path on a phone).
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('pointercancel')));
  await page.waitForFunction(() => window.__OYUN__?.state().data.aiming === false, null, { timeout: 5000 });
  await t.send('touchEnd', []); // the finger finally lifts: nothing fires
  await page.waitForTimeout(300);
  expect((await state(page)).data.shots).toBe(0);

  const hapticsBefore = await page.evaluate(() => {
    const calls = window.__OYUN__!.state().meta.platformCalls as string[];
    return calls.filter((c) => c === 'haptic').length;
  });
  for (let attempt = 0; attempt < 6 && ((await state(page)).data.kos as number) < 1; attempt++) {
    const d = (await state(page)).data;
    const sol = d.solution as { angle: number; power: number };
    const drag = d.drag as { dead: number; full: number };
    const len = drag.dead + sol.power * (drag.full - drag.dead);
    await page.waitForFunction(() => (window.__OYUN__?.state().data.reload as number) === 0, null, { timeout: 5000 });
    await t.drag(startX, startY, -Math.cos(sol.angle) * len, -Math.sin(sol.angle) * len);
    if (attempt === 0) await shot(page, gameDir, 'touch-release');
    await page.waitForFunction((n) => (window.__OYUN__?.state().data.shots as number) > n, d.shots as number, { timeout: 5000 });
    if (attempt === 0) {
      // the release's feedback really plays: a haptic through the platform, and wave 1 is announced
      await page.waitForFunction(
        (n) => {
          // core lists the web adapter's call names: a new 'haptic' (the release) and the
          // run's analytics ('track' for run_start / wave_start) must have happened
          const calls = window.__OYUN__!.state().meta.platformCalls as string[];
          return calls.filter((c) => c === 'haptic').length > n && calls.includes('track');
        },
        hapticsBefore,
        { timeout: 5000 },
      );
    }
    await page.waitForTimeout(1500);
  }
  const s = await state(page);
  expect(s.data.kos).toBeGreaterThanOrEqual(1);
  // every release played its feedback (snap, whistle, push, puffs, haptic) and wave 1 was announced once
  expect(s.data.shotFx).toBe(s.data.shots);
  expect(s.data.waveFx).toBe(1);
  expect(s.data.shots as number).toBeGreaterThanOrEqual(1);

  await page.waitForFunction(() => window.__OYUN__?.state().data.phase === 'cards', null, { timeout: 20_000 });
  await page.waitForTimeout(900);
  const rects = (await state(page)).data.rects as Record<string, number[]>;
  const c = rects.card1!;
  const offer = (await state(page)).data.offer as string[];
  await t.tap(c[0]! + c[2]! / 2, c[1]! + c[3]! / 2);
  await page.waitForFunction(() => window.__OYUN__?.state().data.phase === 'play', null, { timeout: 10_000 });
  expect((await state(page)).data.cards).toEqual([offer[1]]);
  expect((await state(page)).data.wave).toBe(2);

  // quitting mid-run from the pause menu keeps what was earned
  const earned = (await state(page)).data.coins as number;
  expect(earned).toBeGreaterThan(0);
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await act(page, 'quit');
  await page.waitForFunction(() => window.__OYUN__?.state().scene === 'game' && window.__OYUN__?.state().data.phase === 'title', null, { timeout: 10_000 });
  const after = await state(page);
  expect(after.data.savedCoins).toBe(earned + (after.data.featCoins as number));
  expect(errors).toEqual([]);
});
