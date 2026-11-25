import { act, collectErrors, expect, openGame, setHidden, shot, state, test, waitForScene } from '@oyun/core/e2e';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

interface Pt {
  x: number;
  y: number;
}
interface Dig {
  layer: number;
  unlocked: number;
  digPower: number;
  dust: number;
  luck: number;
  rolls: number;
  blockHp: number;
  blockDamage: number;
  status: string;
  overlay: string | null;
  museum: { found: number; perLayer: number[] };
  costs: Record<'pick' | 'luck' | 'assistant' | 'offline', number | null>;
  weak: (Pt & { life: number; mult: number }) | null;
  sharp: number;
  precise: number;
  rush: { open: boolean; ready: boolean; active: boolean; left: number; blocks: number; finds: number; best: number; count: number; wait: number };
  rushCard: { blocks: number; dust: number; rolls: number; kinds: number; record: boolean; best: number } | null;
  rushAsk: boolean;
  rushEnded: string | null;
  sharpZone: boolean;
  ui: { block: Pt; map: Pt; rush: Pt; rushClaim: Pt | null; rushStart: Pt | null; rushAskClose: Pt | null };
}
interface MapState {
  from: string;
  layer: number;
  unlocked: number;
  scroll: number;
  maxScroll: number;
  window: { top: number; bottom: number };
  bands: (Pt & { layer: number; open: boolean; current: boolean; next: boolean; found: number; unlockPower: number })[];
  ui: { back: Pt };
}
const dig = async (page: Page): Promise<Dig> => (await state(page)).data as unknown as Dig;
const map = async (page: Page): Promise<MapState> => (await state(page)).data as unknown as MapState;

/** A real touch at a logical (720×1280) point: through the browser's input pipeline, not the hook. */
async function touch(page: Page, p: Pt): Promise<void> {
  const r = await page.evaluate(() => {
    const b = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  await page.touchscreen.tap(r.x + (p.x / 720) * r.w, r.y + (p.y / 1280) * r.h);
}

/** Close whatever covers the dig, except the rush card (the test looks at that one itself). */
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = await dig(page);
    if (!s.overlay || s.overlay === 'rush' || s.overlay === 'rushAsk') return;
    await page.waitForFunction(() => window.__OYUN__?.state().data.overlayReady === true, null, { timeout: 30_000 });
    await act(page, s.overlay === 'grand' ? 'dismiss' : s.overlay === 'offline' ? 'claim' : 'close');
    await page.waitForTimeout(200);
  }
}

/**
 * The three additions of the map-and-rush round, as a new player meets them: a weak spot and a
 * precise hit, the first Dig Rush with its result card and cooldown, the depth map and travelling
 * from it; then a reload. Buttons are pressed by real touch; the hook reads state and lets game
 * time pass. Fails on any console or page error.
 */
test('weak spot, dig rush and depth map: a new player meets all three, and the save keeps them', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openGame(page, { seed: 3, lang: 'en' });
  await page.waitForTimeout(300);
  await act(page, 'play');
  await waitForScene(page, 'dig');
  let d = await dig(page);
  expect(d.weak).toBeNull();
  expect(d.sharpZone).toBe(false); // no count showing: that spot is dig site
  expect(d.rush.open).toBe(false); // not offered before four Topsoil species
  expect(d.rush.best).toBe(0);

  // --- weak spot: a new dig shows its first one within seconds; a touch on it is a precise hit
  await act(page, 'tap', 2);
  let hit = false;
  for (let attempt = 0; attempt < 4 && !hit; attempt++) {
    await act(page, 'waitWeak', 12);
    d = await dig(page);
    if (!d.weak) continue;
    expect(d.weak.mult).toBe(4 + 0.5 * Math.min(4, d.sharp));
    // on the block face, clear of the HP bar below it
    expect(Math.abs(d.weak.x - d.ui.block.x)).toBeLessThan(230);
    expect(Math.abs(d.weak.y - d.ui.block.y)).toBeLessThan(200);
    const before = d.precise;
    await touch(page, d.weak);
    hit = await page
      .waitForFunction((n) => (window.__OYUN__?.state().data.precise as number) > n, before, { timeout: 4000 })
      .then(() => true)
      .catch(() => false); // under load the spot can fade before the touch lands: wait for the next
  }
  expect(hit).toBe(true);
  d = await dig(page);
  expect(d.precise).toBe(1);
  expect(d.sharp).toBe(1);
  expect(d.weak).toBeNull(); // used up
  expect(d.sharpZone).toBe(true); // the sharp-eye count takes taps only while it shows
  await shot(page, gameDir, 'harita-precise');

  // --- until the rush is offered
  for (let round = 0; round < 80 && !d.rush.open; round++) {
    await act(page, 'tap', 4);
    await settle(page);
    d = await dig(page);
  }
  expect(d.rush.open).toBe(true);
  expect(d.rush.ready).toBe(true);
  expect(d.museum.perLayer[0]).toBeGreaterThanOrEqual(4);
  await settle(page);

  // --- the rush: started by touch, 45 s of game time, every break a find at the luck on screen
  d = await dig(page);
  const normalHp = d.blockHp;
  const foundBefore = d.museum.found;
  const rollsBefore = d.rolls;
  const dustBefore = d.dust;
  // one tap on the button only opens the start card: it can be closed again and nothing has started
  await touch(page, d.ui.rush);
  await page.waitForFunction(() => window.__OYUN__?.state().data.rushAsk === true, null, { timeout: 10_000 });
  await page.waitForTimeout(500);
  d = await dig(page);
  expect(d.rush.active).toBe(false);
  await shot(page, gameDir, 'harita-rush-start-card');
  await touch(page, d.ui.rushAskClose!);
  await page.waitForFunction(() => window.__OYUN__?.state().data.rushAsk === false, null, { timeout: 10_000 });
  d = await dig(page);
  expect(d.rush.active).toBe(false);
  expect(d.rush.ready).toBe(true); // closing it costs nothing
  await page.waitForTimeout(300);
  // again, and Start: one tap from the card
  await touch(page, d.ui.rush);
  await page.waitForFunction(() => window.__OYUN__?.state().data.rushAsk === true, null, { timeout: 10_000 });
  await page.waitForTimeout(400);
  d = await dig(page);
  await touch(page, d.ui.rushStart!);
  await page.waitForFunction(() => (window.__OYUN__?.state().data.rush as { active: boolean }).active === true, null, { timeout: 10_000 });
  d = await dig(page);
  expect(d.rushAsk).toBe(false);
  expect(d.rush.left).toBeGreaterThan(40);
  expect(d.blockHp).toBeLessThanOrEqual(Math.max(1, Math.ceil(normalHp * 0.3) * 1.5)); // 30 % (×1.5 if golden)
  expect(d.status).toContain(String(d.luck)); // the status line names the luck the finds roll at
  await page.waitForTimeout(400);
  await shot(page, gameDir, 'harita-rush');
  // a short trip to the background (well under a minute) does not end it: its clock just waited
  await act(page, 'tap', 4);
  await act(page, 'advance', 2);
  await settle(page);
  const beforeAway = (await dig(page)).rush;
  await setHidden(page, true);
  await page.waitForTimeout(1200);
  await setHidden(page, false);
  await waitForScene(page, 'pause');
  await act(page, 'resume');
  await waitForScene(page, 'dig');
  d = await dig(page);
  expect(d.rush.active).toBe(true);
  expect(d.rush.blocks).toBe(beforeAway.blocks);
  expect(d.rush.left).toBeLessThanOrEqual(beforeAway.left);
  expect(d.rush.left).toBeGreaterThan(beforeAway.left - 1.5); // the 1.2 s away were not taken off it
  let lastLeft = d.rush.left;
  for (let i = 0; i < 120 && d.rush.active; i++) {
    await act(page, 'tap', 4);
    await act(page, 'advance', 1);
    await settle(page);
    d = await dig(page);
    if (d.rush.active) {
      expect(d.rush.left).toBeLessThanOrEqual(lastLeft); // the clock only runs down
      lastLeft = d.rush.left;
      expect(d.layer).toBe(0);
    }
  }
  expect(d.rush.active).toBe(false);
  await page.waitForFunction(() => window.__OYUN__?.state().data.rushCard !== null, null, { timeout: 20_000 });
  d = await dig(page);
  const card = d.rushCard!;
  expect(card.blocks).toBeGreaterThan(20);
  expect(card.rolls).toBeGreaterThanOrEqual(card.blocks);
  expect(card.dust).toBeGreaterThan(0);
  expect(card.best).toBe(0); // the first rush
  expect(card.record).toBe(true);
  expect(d.rushEnded).toBe('time');
  expect(d.rush.best).toBe(card.blocks);
  expect(d.rush.count).toBe(1);
  expect(d.rolls - rollsBefore).toBeGreaterThanOrEqual(card.rolls); // real finds, in the museum
  expect(d.museum.found).toBeGreaterThanOrEqual(foundBefore);
  expect(d.dust).toBeGreaterThanOrEqual(dustBefore + card.dust);
  // the cooldown: three hours of wall-clock time from the start
  expect(d.rush.ready).toBe(false);
  expect(d.rush.wait).toBeGreaterThan(3 * 3600 - 600);
  expect(d.rush.wait).toBeLessThanOrEqual(3 * 3600);
  await page.waitForTimeout(1500);
  await shot(page, gameDir, 'harita-rush-card');
  await touch(page, d.ui.rushClaim!);
  await page.waitForFunction(() => window.__OYUN__?.state().data.rushCard === null, null, { timeout: 10_000 });
  // the block that was being dug is back at its normal health; a second rush does not start
  d = await dig(page);
  expect(d.blockHp).toBeGreaterThanOrEqual(normalHp);
  await touch(page, d.ui.rush);
  await page.waitForTimeout(400);
  d = await dig(page);
  expect(d.rushAsk).toBe(false); // cooling down: no card, only the note that says when
  expect(d.rush.active).toBe(false);
  expect(d.rush.count).toBe(1);

  // --- until the Ice Age is open (the rush usually did it), then the depth map by touch
  for (let round = 0; round < 400 && d.unlocked < 1; round++) {
    await act(page, 'tap', 8);
    for (const id of ['pick', 'assistant'] as const) {
      const cost = d.costs[id];
      if (cost !== null && cost <= d.dust) await act(page, 'buy', id);
    }
    await settle(page);
    d = await dig(page);
  }
  expect(d.unlocked).toBeGreaterThanOrEqual(1);
  // (a rank-up waits for a quiet moment and may open just now: close it and touch again)
  let power = 0;
  for (let attempt = 0; attempt < 5 && (await state(page)).scene !== 'map'; attempt++) {
    await settle(page);
    await page.waitForTimeout(600);
    await settle(page);
    d = await dig(page);
    power = d.digPower;
    await touch(page, d.ui.map);
    await waitForScene(page, 'map', 4000).catch(() => undefined);
  }
  await waitForScene(page, 'map');
  await page.waitForTimeout(900);
  let m = await map(page);
  expect(m.from).toBe('dig');
  expect(m.bands).toHaveLength(13);
  expect(m.bands.filter((b) => b.current).map((b) => b.layer)).toEqual([0]);
  expect(m.bands.map((b) => b.open)).toEqual(m.bands.map((b) => b.layer <= m.unlocked));
  expect(m.bands.filter((b) => b.next).map((b) => b.layer)).toEqual([m.unlocked + 1]);
  expect(m.bands[1]!.unlockPower).toBe(300);
  expect(m.bands[0]!.found).toBe(d.museum.perLayer[0]);
  await shot(page, gameDir, 'harita-map');
  // a locked band says what opens it and goes nowhere
  const locked = m.bands.find((b) => !b.open)!;
  await act(page, 'scrollTo', locked.layer);
  m = await map(page);
  await touch(page, m.bands[locked.layer]!);
  await page.waitForTimeout(500);
  expect((await state(page)).scene).toBe('map');
  expect((await map(page)).layer).toBe(0);
  // scrolling by a real drag moves the map
  await act(page, 'scrollTo', 3);
  const before = (await map(page)).scroll;
  const box = await page.evaluate(() => {
    const b = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.4, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await map(page)).scroll).toBeGreaterThan(before);
  expect((await state(page)).scene).toBe('map'); // a drag is not a tap
  // an open band: travel there; the descent ends on the dig screen
  await act(page, 'scrollTo', 1);
  m = await map(page);
  const ice = m.bands[1]!;
  expect(ice.y).toBeGreaterThan(m.window.top);
  expect(ice.y).toBeLessThan(m.window.bottom);
  await touch(page, ice);
  await waitForScene(page, 'dig');
  await page.waitForFunction(() => window.__OYUN__?.state().data.travelling === false, null, { timeout: 15_000 });
  d = await dig(page);
  expect(d.layer).toBe(1);
  expect(d.digPower).toBeGreaterThanOrEqual(power); // the map changed nothing but the layer
  await page.waitForTimeout(500);
  await shot(page, gameDir, 'harita-arrived');
  const saved = d;

  // --- close and reopen: the best, the cooldown and the layer are kept
  await page.reload();
  await page.waitForFunction(() => window.__OYUN__?.ready === true, null, { timeout: 20_000 });
  await act(page, 'map'); // the map opens from the menu too
  await waitForScene(page, 'map');
  m = await map(page);
  expect(m.from).toBe('menu');
  expect(m.layer).toBe(1);
  await act(page, 'back');
  await waitForScene(page, 'menu');
  await act(page, 'play');
  await waitForScene(page, 'dig');
  await settle(page);
  d = await dig(page);
  expect(d.layer).toBe(1);
  expect(d.rush.best).toBe(saved.rush.best);
  expect(d.rush.count).toBe(1);
  expect(d.rush.ready).toBe(false);
  expect(d.rush.wait).toBeGreaterThan(3 * 3600 - 1800);
  expect(d.precise).toBeGreaterThanOrEqual(1);

  expect(errors).toEqual([]);
});
