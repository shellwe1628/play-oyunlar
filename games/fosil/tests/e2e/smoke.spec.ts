import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene, type TestState } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';

const gameDir = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

type Dig = {
  layer: number;
  unlocked: number;
  digPower: number;
  dust: number;
  luck: number;
  combo: number;
  museum: { found: number; total: number; perLayer: number[] };
  lastFind: { id: string; odds: number; grade: number } | null;
  costs: Record<'pick' | 'luck' | 'assistant' | 'offline', number | null>;
  taps: number;
  rolls: number;
  ceremony: string | null;
};
const dig = async (page: Page): Promise<Dig> => (await state(page)).data as unknown as Dig;

/** Buy the cheapest useful upgrade while affordable (what the pacing policy does). */
async function buyCheapest(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = await dig(page);
    const options = (['pick', 'luck', 'assistant'] as const)
      .map((id) => ({ id, cost: d.costs[id] }))
      .filter((o): o is { id: 'pick' | 'luck' | 'assistant'; cost: number } => o.cost !== null)
      .sort((a, b) => a.cost - b.cost);
    const next = options[0];
    if (!next || next.cost > d.dust) return;
    await act(page, 'buy', next.id);
  }
}

/** Close whatever covers the dig (grand reveal, rank-up, daily) the way a tap would, once it accepts one. */
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = (await state(page)).data as { overlay?: string | null };
    if (!s.overlay) return;
    await page.waitForFunction(() => window.__OYUN__?.state().data.overlayReady === true, null, { timeout: 30_000 });
    await act(page, s.overlay === 'grand' ? 'dismiss' : s.overlay === 'offline' ? 'claim' : 'close');
    await page.waitForTimeout(200);
  }
}

/**
 * Gate smoke test: built game, ?test=1&seed=1, phone viewport. Menu → dig, tap (through the same
 * handler a finger uses) until layer 2 unlocks, open the museum, pause/resume, background the tab,
 * reload the page and check that the save survived. Fails on any console or page error.
 */
test('dig until layer 2 opens, visit the museum, reload and keep everything', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 1, lang: 'tr' });
  expect((await state(page)).scene).toBe('menu');
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'dig');

  const start = await dig(page);
  expect(start.digPower).toBe(1);
  expect(start.luck).toBe(1);
  expect(start.museum.found).toBe(0);

  // Dig until the Ice Age opens.
  let d = start;
  for (let round = 0; round < 400 && d.unlocked < 1; round++) {
    await act(page, 'tap', 8);
    await buyCheapest(page);
    d = await dig(page);
  }
  expect(d.unlocked).toBeGreaterThanOrEqual(1);
  expect(d.museum.found).toBeGreaterThan(4);
  expect(d.lastFind).not.toBeNull();
  expect(d.rolls).toBeGreaterThan(20);
  await page.waitForTimeout(600);
  await shot(page, gameDir, 'dig');

  // Time passes: combo drains, a glint can appear; tap it like a player would.
  await settle(page);
  await act(page, 'advance', 45);
  d = await dig(page);
  expect(d.combo).toBe(0);
  if ((await state(page)).data.glint) await act(page, 'glint');

  // Travel down to the Ice Age and dig there.
  await settle(page);
  await act(page, 'travel', 1);
  d = await dig(page);
  expect(d.layer).toBe(1);
  await act(page, 'tap', 30);

  // The upgrade drawer opens without hiding the dig site.
  await act(page, 'drawer');
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'drawer');
  await act(page, 'drawer');

  // Pause button, then resume; then the tab goes to the background (auto pause).
  await act(page, 'pause');
  await waitForScene(page, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'dig');
  await setHidden(page, true);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'dig');

  // Museum.
  await settle(page);
  const before = await dig(page);
  await act(page, 'museum');
  await waitForScene(page, 'museum');
  await page.waitForTimeout(500);
  const museum = (await state(page)).data as { tab: number; found: number; cards: { found: boolean; odds: number }[] };
  expect(museum.tab).toBe(1);
  expect(museum.cards).toHaveLength(12);
  expect(museum.cards.every((c) => c.odds >= 2)).toBe(true);
  await shot(page, gameDir, 'museum');
  await act(page, 'tab', 0);
  const topsoil = (await state(page)).data as { found: number };
  expect(topsoil.found).toBe(before.museum.perLayer[0]);
  await act(page, 'open', 0);
  await page.waitForTimeout(300);
  await shot(page, gameDir, 'museum-detail');
  await act(page, 'close');
  await act(page, 'back');
  await waitForScene(page, 'dig');

  // Ranks: your own ladder, records and goals (never anyone else's).
  const scored = (await state(page)).data as { score: number; rank: number; scoreParts: Record<string, number> };
  expect(scored.score).toBeGreaterThan(0);
  expect(scored.score).toBe(Object.entries(scored.scoreParts).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + v, 0));
  await act(page, 'ranks');
  await waitForScene(page, 'ranks');
  const ranks = (await state(page)).data as { score: number; rank: number; ranks: number; tab: string; canExpedition: boolean };
  expect(ranks.score).toBe(scored.score);
  expect(ranks.rank).toBe(scored.rank);
  expect(ranks.ranks).toBeGreaterThanOrEqual(10);
  expect(ranks.canExpedition).toBe(false);
  await shot(page, gameDir, 'ranks');
  for (const tab of ['records', 'goals'] as const) {
    await act(page, 'tab', tab);
    expect(((await state(page)).data as { tab: string }).tab).toBe(tab);
    await shot(page, gameDir, `ranks-${tab}`);
  }
  await act(page, 'scroll', 400);
  await act(page, 'back');
  await waitForScene(page, 'dig');
  const saved = await dig(page);

  // Close and reopen: nothing is lost.
  await page.reload();
  await page.waitForFunction(() => window.__OYUN__?.ready === true, null, { timeout: 20_000 });
  const menu: TestState = await state(page);
  expect(menu.scene).toBe('menu');
  expect((menu.data as { found: number }).found).toBe(saved.museum.found);
  await act(page, 'play');
  await waitForScene(page, 'dig');
  const after = await dig(page);
  expect(after.unlocked).toBe(saved.unlocked);
  expect(after.layer).toBe(saved.layer);
  expect(after.museum).toEqual(saved.museum);
  expect(after.taps).toBe(saved.taps);
  expect(after.dust).toBeGreaterThanOrEqual(saved.dust);
  expect(after.digPower).toBeGreaterThanOrEqual(saved.digPower);
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'reloaded');

  expect(errors).toEqual([]);
});
