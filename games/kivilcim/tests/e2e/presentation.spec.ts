import { act, collectErrors, expect, openGame, state, test } from '@oyun/core/e2e';
import type { Browser } from '@playwright/test';

/**
 * The presentation (worlds, wall FX, object and skin animations) must never feed back into the
 * sim. The same seeded autopilot run on the same stepped clock, once with the presentation on and
 * once with it off (?fx=0), must produce the same sim, tick for tick: the game keeps a running
 * hash of the spark's state after every tick.
 */
async function run(browser: Browser, fx: boolean): Promise<{ hash: number; tick: number; x: number; y: number; gems: number; fxOn: boolean }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.clock.install({ time: new Date('2026-11-17T10:00:00') });
  await openGame(page, { seed: 1, lang: 'en', query: fx ? 'fx=1' : 'fx=0' });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000);
  await act(page, 'start', { mode: 'level', level: 6 });
  await act(page, 'autopilot', true);
  for (let k = 0; k < 150; k++) await page.clock.fastForward(33);
  const d = (await state(page)).data as Record<string, number | boolean>;
  expect(errors).toEqual([]);
  await ctx.close();
  return { hash: d.simHash as number, tick: d.tick as number, x: d.x as number, y: d.y as number, gems: d.gems as number, fxOn: d.fx as boolean };
}

test('presentation on or off, the sim runs identically', async ({ browser }) => {
  test.setTimeout(400_000);
  const on = await run(browser, true);
  const off = await run(browser, false);
  console.warn(`fx on: tick ${on.tick} hash ${on.hash}; fx off: tick ${off.tick} hash ${off.hash}`);
  expect(on.fxOn).toBe(true);
  expect(off.fxOn).toBe(false);
  expect(on.tick).toBeGreaterThan(500);
  expect({ ...off, fxOn: true }).toEqual(on);
});
