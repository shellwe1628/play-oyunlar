import { collectErrors, expect, openGame, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

interface Pt {
  x: number;
  y: number;
}
interface DigUi {
  block: Pt;
  upgrades: Pt;
  museum: Pt;
  glint: Pt | null;
  buy: Record<string, Pt>;
  drawerClose: Pt;
}
interface Dig {
  rolls: number;
  dust: number;
  glint: boolean;
  drawerOpen: boolean;
  levels: Record<string, number>;
  costs: Record<string, number | null>;
  lastFind: { source: string; luck: number } | null;
  ui: DigUi;
}
const dig = async (page: Page): Promise<Dig> => (await state(page)).data as unknown as Dig;

/** A real touch at a logical (720×1280) point: through the browser's input pipeline, not the hook. */
async function touch(page: Page, p: Pt): Promise<void> {
  const r = await page.evaluate(() => {
    const b = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  await page.touchscreen.tap(r.x + (p.x / 720) * r.w, r.y + (p.y / 1280) * r.h);
}

/**
 * Real-touch playthrough. The test hook is used only to read state and to learn where things
 * are on screen; every action is a touchscreen tap.
 */
test('plays with real touch: dig, glint, upgrade, museum', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 2, lang: 'en' });
  await page.waitForTimeout(400);
  await touch(page, { x: 360, y: 1280 * 0.62 }); // Play
  await waitForScene(page, 'dig');
  await page.waitForTimeout(300);

  // Tap the block until a fossil drops.
  let d = await dig(page);
  for (let i = 0; i < 80 && d.rolls === 0; i++) {
    await touch(page, d.ui.block);
    d = await dig(page);
  }
  expect(d.rolls).toBeGreaterThan(0);
  expect(d.lastFind?.source).toBe('tap');

  // A brand-new dig shows its first glint after 8 s: wait for it, then tap it.
  await page.waitForFunction(() => window.__OYUN__?.state().data.glint === true, null, { timeout: 150_000, polling: 100 });
  d = await dig(page);
  const before = d.rolls;
  await touch(page, d.ui.glint!);
  await page.waitForFunction((n) => (window.__OYUN__?.state().data.rolls as number) > n, before, { timeout: 10_000 });
  d = await dig(page);
  expect(d.lastFind?.source).toBe('glint');
  expect(d.glint).toBe(false);

  // Dig until the first upgrade is affordable, open the drawer and buy it by tapping.
  for (let i = 0; i < 400 && d.dust < (d.costs.pick ?? Infinity); i++) {
    await touch(page, d.ui.block);
    if (i % 5 === 0) d = await dig(page);
  }
  d = await dig(page);
  expect(d.dust).toBeGreaterThanOrEqual(d.costs.pick!);
  await touch(page, d.ui.upgrades);
  await page.waitForFunction(() => window.__OYUN__?.state().data.drawerOpen === true);
  await page.waitForTimeout(400); // drawer slides in
  d = await dig(page);
  await touch(page, d.ui.buy.pick!);
  await page.waitForFunction(() => (window.__OYUN__?.state().data.levels as Record<string, number>).pick === 1, null, { timeout: 10_000 });
  await shot(page, gameDir, 'touch-drawer');
  await touch(page, d.ui.drawerClose);
  await page.waitForFunction(() => window.__OYUN__?.state().data.drawerOpen === false);
  await page.waitForTimeout(400);

  // Museum, then a detail card, all by touch.
  await touch(page, d.ui.museum);
  await waitForScene(page, 'museum');
  await page.waitForTimeout(400);
  const m = (await state(page)).data as unknown as { cards: { found: boolean }[]; ui: { cards: Pt[]; back: Pt } };
  const idx = m.cards.findIndex((c) => c.found);
  expect(idx).toBeGreaterThanOrEqual(0);
  await touch(page, m.ui.cards[idx]!);
  await page.waitForFunction(() => window.__OYUN__?.state().data.detail === true);
  await shot(page, gameDir, 'touch-detail');
  await touch(page, { x: 360, y: 120 });
  await page.waitForFunction(() => window.__OYUN__?.state().data.detail === false);
  await touch(page, m.ui.back);
  await waitForScene(page, 'dig');

  expect(errors).toEqual([]);
});
