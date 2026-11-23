import { act, collectErrors, expect, openGame, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Online ranking (@oyun/core/online) in the real game, with a fake Play Games plugin standing in
 * for tools/aab/PlayGamesPlugin.java: nothing reaches Play Games before the age question, a child
 * answer blocks it for good (and the panel says why), an adult answer signs in and sends the
 * bests. On iOS (fake GameCenter plugin) there is no age question: straight to sign-in.
 */
const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

async function fakePlayGames(page: Page, platform: 'android' | 'ios' = 'android'): Promise<void> {
  await page.addInitScript((platform) => {
    const calls: string[] = [];
    (window as unknown as { __pgs: string[] }).__pgs = calls;
    const plugin = {
      available: () => Promise.resolve({ value: true }),
      init: () => (calls.push('init'), Promise.resolve({ signedIn: false })),
      signIn: () => (calls.push('signIn'), Promise.resolve({ signedIn: true, name: 'Test Player' })),
      submitScore: (o: { board: string; score: number }) => (calls.push(`submit:${o.board}:${o.score}`), Promise.resolve({})),
      showBoard: (o: { board: string }) => (calls.push(`show:${o.board}`), Promise.resolve({})),
      loadMine: (o: { board: string }) => Promise.resolve(o.board === 'rank' ? { score: 120, rank: 42 } : {}),
    };
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: platform === 'ios' ? { GameCenter: plugin } : { PlayGames: plugin },
    };
  }, platform);
}
const calls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __pgs: string[] }).__pgs);

async function openRanksPanel(page: Page): Promise<void> {
  await waitForScene(page, 'game');
  await act(page, 'ranks');
  await waitForScene(page, 'ranks');
  await act(page, 'online');
  await expect(page.getByTestId('online-panel')).toBeVisible();
}

test('online: age question first, an adult signs in and the bests go up', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePlayGames(page);
  await openGame(page, { seed: 1, lang: 'tr' });
  await openRanksPanel(page);
  const panel = page.getByTestId('online-panel');
  await expect(panel).toHaveAttribute('data-state', 'ask-age');
  expect(await calls(page)).toEqual([]); // nothing touched Play Games yet
  await page.waitForTimeout(300);
  await shot(page, gameDir, 'online-age');

  await page.getByTestId('online-year').selectOption('1990');
  await page.getByTestId('online-age-next').click();
  await expect(panel).toHaveAttribute('data-state', 'signed-out');
  expect(await calls(page)).toEqual(['init']);
  await shot(page, gameDir, 'online-signin');

  await page.getByTestId('online-signin').click();
  await expect(panel).toHaveAttribute('data-state', 'signed-in');
  await expect(page.getByTestId('online-open-rank')).toBeVisible();
  await expect(panel).toContainText('Test Player');
  await expect(panel).toContainText('#42');
  await page.waitForTimeout(200);
  await shot(page, gameDir, 'online-boards');
  await page.getByTestId('online-open-rank').click();
  expect(await calls(page)).toContain('show:rank');

  await page.getByTestId('online-close').click();
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('online: a child answer blocks Play Games for good', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePlayGames(page);
  await openGame(page, { seed: 1, lang: 'en' });
  await openRanksPanel(page);
  const year = new Date().getFullYear() - 9;
  await page.getByTestId('online-year').selectOption(String(year));
  await page.getByTestId('online-age-next').click();
  await expect(page.getByTestId('online-panel')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('online-panel')).toContainText('Online ranking is for players aged 13 and over.');
  await expect(page.getByTestId('online-panel').locator('button:not([data-testid="online-close"])')).toHaveCount(0);
  await shot(page, gameDir, 'online-blocked');
  await page.getByTestId('online-close').click();
  // reopening keeps it blocked, and Play Games was never initialised
  await act(page, 'online');
  await expect(page.getByTestId('online-panel')).toHaveAttribute('data-state', 'blocked');
  expect(await calls(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('online on iOS: no age question, Game Center sign-in straight away', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePlayGames(page, 'ios');
  await openGame(page, { seed: 1, lang: 'en' });
  await openRanksPanel(page);
  const panel = page.getByTestId('online-panel');
  await expect(panel).toHaveAttribute('data-state', 'signed-out');
  await expect(page.getByTestId('online-year')).toHaveCount(0);
  await expect(panel).toContainText('Game Center');
  expect(await calls(page)).toEqual([]); // nothing started before the tap
  await page.getByTestId('online-signin').click();
  await expect(panel).toHaveAttribute('data-state', 'signed-in');
  expect(await calls(page)).toContain('init');
  expect(errors).toEqual([]);
});

test('online: without the native plugin the panel explains where it lives', async ({ page }) => {
  await openGame(page, { seed: 1, lang: 'en' });
  await openRanksPanel(page);
  await expect(page.getByTestId('online-panel')).toHaveAttribute('data-state', 'unavailable');
  // App Store 5.1.1: the privacy policy is one tap away inside the game
  await expect(page.getByTestId('online-privacy')).toHaveAttribute('href', 'https://oyunlar.carsihani.me/gizlilik/kivilcim/');
});

test('the title screen links the privacy policy; a tap on it opens the page and starts no run', async ({ page, context }) => {
  const errors = collectErrors(page);
  await context.route('https://oyunlar.carsihani.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>policy</p>' }));
  await openGame(page, { seed: 1, lang: 'tr' });
  await waitForScene(page, 'game');
  await page.waitForTimeout(1200); // the entrance settles
  await shot(page, gameDir, 'title-privacy');
  const d = (await state(page)).data as { phase: string; privacy: { x: number; y: number } | null };
  expect(d.phase).toBe('title');
  expect(d.privacy).not.toBeNull();
  const r = await page.evaluate(() => {
    const b = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const popup = context.waitForEvent('page');
  await page.touchscreen.tap(r.x + (d.privacy!.x / 720) * r.w, r.y + (d.privacy!.y / 1280) * r.h);
  expect((await popup).url()).toBe('https://oyunlar.carsihani.me/gizlilik/kivilcim/');
  await page.waitForTimeout(300);
  expect(((await state(page)).data as { phase: string }).phase).toBe('title');
  expect(errors).toEqual([]);
});
