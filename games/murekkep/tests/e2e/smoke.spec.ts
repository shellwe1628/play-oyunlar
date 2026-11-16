import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

interface GameData {
  tick: number;
  phase: string;
  shares: number[];
  reserve: number;
  cap: number;
  commit: number;
  speed: number;
  mapId: string;
  targets: { cell: number; x: number; y: number }[];
  slider: { x0: number; x1: number; y: number };
  speedButton: { x: number; y: number };
}

const game = async (page: Page): Promise<GameData> => (await state(page)).data as unknown as GameData;

/** Logical canvas point (720×1280) → page CSS pixels. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas').boundingBox())!;
  const s = box.width / 720;
  return { x: box.x + x * s, y: box.y + y * s };
}

/**
 * Gate smoke test: built game, ?test=1&seed=1, phone viewport. Menu → sheets → match on sheet 1
 * → pause/resume → auto-play to the end → result → saved stars on the sheet screen.
 */
test('menu → sheets → match → result, stars saved', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });

  expect((await state(page)).scene).toBe('menu');
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'maps');
  const maps = (await state(page)).data as { unlocked: boolean[]; stars: number[] };
  expect(maps.unlocked[0]).toBe(true);
  expect(maps.unlocked[1]).toBe(false);
  await shot(page, gameDir, 'maps');

  await act(page, 'sheet', { index: 0 });
  await waitForScene(page, 'game');
  const g0 = await game(page);
  expect(g0.mapId).toBe('c1');
  expect(g0.phase).toBe('playing');
  expect(g0.shares).toHaveLength(3);

  // An attack through the same handler a tap uses: commits 40 % of the reserve.
  const before = await game(page);
  await act(page, 'attack', { cell: before.targets[0]!.cell, percent: 40 });
  const after = await game(page);
  expect(after.commit).toBe(40);
  expect(after.reserve).toBeLessThan(before.reserve);
  await shot(page, gameDir, 'game');

  // Pause button, then resume; tab hidden → auto-pause and the sim does not advance.
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'game');
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  const frozen = (await state(page)).scenes;
  expect(frozen).toContain('game');
  await page.waitForTimeout(800);
  await act(page, 'resume');
  await waitForScene(page, 'game');

  // Built-in player policy plays; fast-forward to the end.
  await act(page, 'auto-play', { ticks: 100_000 });
  await act(page, 'fast-forward', 400);
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'game-mid');
  await act(page, 'fast-forward', 6000);
  await waitForScene(page, 'result', 20_000);
  const end = (await state(page)).data as { won: boolean; stars: number; level: string; score: number; canNext: boolean };
  expect(end.level).toBe('c1');
  expect(end.score).toBeGreaterThanOrEqual(0);
  if (end.won) {
    expect(end.stars).toBeGreaterThanOrEqual(1);
    expect(end.canNext).toBe(true);
  } else expect(end.stars).toBe(0);
  await page.waitForTimeout(1400);
  await shot(page, gameDir, 'result');

  // Saved: the sheet screen shows the same stars and the next sheet's lock.
  await act(page, 'menu');
  await waitForScene(page, 'maps');
  const saved = (await state(page)).data as { unlocked: boolean[]; stars: number[] };
  expect(saved.stars[0]).toBe(end.stars);
  expect(saved.unlocked[1]).toBe(end.won);

  expect(errors).toEqual([]);
});

/** Real pointer input: touch taps on the map and the speed button, a mouse drag on the slider. */
test('real taps and slider drags drive the match', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { seed: 2, lang: 'en' });
  await act(page, 'play');
  await waitForScene(page, 'maps');
  await act(page, 'sheet', { index: 0 });
  await waitForScene(page, 'game');
  await page.waitForTimeout(400);

  // Drag the slider thumb from 30 % to the far right.
  const g = await game(page);
  const from = await toPage(page, g.slider.x0 + ((30 - 10) / 90) * (g.slider.x1 - g.slider.x0), g.slider.y);
  const to = await toPage(page, g.slider.x1 + 20, g.slider.y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  expect((await game(page)).commit).toBe(100);
  // Drag back to the middle.
  const mid = await toPage(page, (g.slider.x0 + g.slider.x1) / 2, g.slider.y);
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 6 });
  await page.mouse.up();
  expect((await game(page)).commit).toBe(55);

  // Speed button by touch.
  const sp = await toPage(page, g.speedButton.x, g.speedButton.y);
  await page.touchscreen.tap(sp.x, sp.y);
  await expect.poll(async () => (await game(page)).speed).toBe(2);

  // Tap a border cell: a wave leaves and land grows.
  const area0 = (await game(page)).shares[0]!;
  const reserve0 = (await game(page)).reserve;
  const t = (await game(page)).targets[0]!;
  const p = await toPage(page, t.x, t.y);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(async () => (await game(page)).reserve).toBeLessThan(reserve0);
  await expect.poll(async () => (await game(page)).shares[0]!, { timeout: 10_000 }).toBeGreaterThan(area0);
  expect(errors).toEqual([]);
});
