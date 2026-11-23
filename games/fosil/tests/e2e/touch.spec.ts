import { collectErrors, expect, openGame, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

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
 * Something may cover the dig between two reads (a rank-up waits for a quiet moment, and under load
 * any pause in the test is one): wait until it accepts a tap, close it by touch like a player.
 */
async function clearOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = (await state(page)).data as { overlay?: string | null; overlayReady?: boolean };
    if (!s.overlay || s.overlay === 'grand') {
      if (s.overlay === 'grand') {
        await page.waitForFunction(() => window.__OYUN__?.state().data.canDismiss === true, null, { timeout: 30_000 });
        await touch(page, { x: 360, y: 640 });
        await page.waitForTimeout(300);
        continue;
      }
      return;
    }
    await page.waitForFunction(() => window.__OYUN__?.state().data.overlayReady === true, null, { timeout: 30_000 });
    await touch(page, { x: 360, y: 300 });
    await page.waitForTimeout(300);
  }
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
  const menu = (await state(page)).data as unknown as { ui: { play: Pt } };
  await touch(page, menu.ui.play); // Play
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

  // A brand-new dig shows its first glint after 8 s: wait for it, then tap it. Under load a glint can
  // fade (3 s) between reading its position and the touch landing: then wait for the next one.
  let glintFound = false;
  for (let attempt = 0; attempt < 4 && !glintFound; attempt++) {
    await page.waitForFunction(() => window.__OYUN__?.state().data.glint === true, null, { timeout: 150_000, polling: 100 });
    await clearOverlays(page);
    d = await dig(page);
    if (!d.glint || !d.ui.glint) continue;
    const before = d.rolls;
    await touch(page, d.ui.glint);
    await page.waitForFunction((n) => (window.__OYUN__?.state().data.rolls as number) > n || window.__OYUN__?.state().data.glint === false, before, { timeout: 10_000 });
    await page.waitForTimeout(200);
    d = await dig(page);
    glintFound = d.lastFind?.source === 'glint';
  }
  expect(glintFound).toBe(true);
  expect(d.glint).toBe(false);

  // Dig until the first upgrade is affordable, open the drawer and buy it by tapping.
  for (let i = 0; i < 400 && d.dust < (d.costs.pick ?? Infinity); i++) {
    await touch(page, d.ui.block);
    if (i % 5 === 0) d = await dig(page);
  }
  await clearOverlays(page);
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
  await clearOverlays(page);
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

test('the main menu links the privacy policy (a tap opens it outside the game)', async ({ page, context }) => {
  const errors = collectErrors(page);
  await context.route('https://oyunlar.carsihani.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>policy</p>' }));
  await openGame(page, { seed: 1, lang: 'tr' });
  await waitForScene(page, 'menu');
  await page.waitForTimeout(1200); // the entrance settles
  await shot(page, gameDir, 'menu-privacy');
  const menu = (await state(page)).data as unknown as { ui: { privacy: Pt; museum: Pt; ranks: Pt } };
  // under the drawers, clear of them by more than half a touch target
  expect(menu.ui.privacy.y - menu.ui.museum.y).toBeGreaterThan(196 / 2 + 44);
  const popup = context.waitForEvent('page');
  await touch(page, menu.ui.privacy);
  expect((await popup).url()).toBe('https://oyunlar.carsihani.me/gizlilik/fosil/');
  await expect(page.locator('canvas')).toBeVisible(); // the game stays where it was
  expect((await state(page)).scene).toBe('menu');
  expect(errors).toEqual([]);
});
