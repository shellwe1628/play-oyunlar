import { fileURLToPath } from 'node:url';
import { collectErrors, expect, openGame, shot, state, test } from '@oyun/core/e2e';
import type { CDPSession, Page } from '@playwright/test';
import { buildLevel } from '../../src/sim/levels';
import { K_REF, prepare, reactionWindow, solve, switchTicks } from '../../src/sim/solver';

const gameDir = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

type Data = Record<string, unknown> & { phase: string; tick: number; dir: number; held: boolean; progress: number; retryReady: boolean; attempts: number; x: number };
const data = async (page: Page): Promise<Data> => (await state(page)).data as Data;

/** Real touch through Chrome's input pipeline (trusted touch → pointer events → the game). */
function fingers(cdp: CDPSession) {
  const at = (id: number) => ({ x: 120 + id * 60, y: 520, id, radiusX: 8, radiusY: 8, force: 1 });
  return {
    down: (...ids: number[]) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ids.map(at) }),
    /** touchEnd: the fingers still down after the lift. */
    up: (...remaining: number[]) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: remaining.map(at) }),
    cancel: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }),
  };
}

/**
 * Plays level 1 with real touches only (CDP touch events through Chrome's input pipeline; the
 * test hook is used to READ state, never to give input).
 *
 * Why the clock: on this build machine a CDP touch takes 0.3-1 s to reach the page and frames
 * take ~200 ms, while the spark crosses half the shaft in 0.6 s, so racing real time cannot
 * work. The test therefore owns the page clock (Playwright clock: rAF, timers and
 * performance.now are faked) and advances game time in steps, sending each touch between
 * frames. Input still travels the real path; only time is controlled.
 *
 * What it proves:
 *  1. a finger-down on the title starts the run and the spark goes right on that press;
 *  2. the finger-up flips it left on the next frame;
 *  3. following the solver's timeline with real touches (each landing within one 1/60 s frame of
 *     its tick) gets past 30 % of level 1;
 *  4. two fingers: lifting one keeps the hold, lifting both releases; touchcancel releases;
 *  5. after a death, a real tap restarts the run.
 * It does NOT prove anything about real-time latency on a phone (see the smoke test's retry
 * timing and the frame-time numbers for that).
 */
test('real touch: press/release steer, past 30 % of level 1, multi-touch and cancel are safe, tap to retry', async ({ page }) => {
  test.setTimeout(600_000); // heavy on a loaded software-rendering machine (see GAME.md)
  const errors = collectErrors(page);

  // The plan: level 1's first 36 % with long holds and the widest clearance at that tempo.
  const full = buildLevel(1);
  const p = prepare({ ...full, length: full.length * 0.36 });
  const win = Math.floor((reactionWindow(p) * 120) / 1000);
  const hold = Math.max(K_REF, Math.min(48, Math.floor(win * 0.6)));
  let lo = 0;
  let hi = 120;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (solve(p, { minClear: mid, minHoldTicks: hold, startHeld: 1 })) lo = mid;
    else hi = mid;
  }
  const plan = solve(p, { minClear: lo, minHoldTicks: hold, startHeld: 1 });
  expect(plan).not.toBeNull();
  const sw = switchTicks(plan!.held);
  expect(sw[0]).toBe(0);

  await page.clock.install({ time: new Date('2026-11-17T10:00:00') });
  await openGame(page, { seed: 1, lang: 'en' });
  expect((await data(page)).phase).toBe('title');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000); // ahead of the page round-trip
  const frame = (): Promise<void> => page.clock.runFor(17);
  const cdp = await page.context().newCDPSession(page);
  const f = fingers(cdp);
  /**
   * A CDP touch can resolve before the page has handled it. Never advance the clock until the
   * page reports the hold state the touch should produce (it is set inside the pointer handler,
   * so this needs no frame).
   */
  const landed = async (held: boolean): Promise<void> => {
    for (let k = 0; k < 200; k++) {
      if ((await data(page)).held === held) return;
    }
    throw new Error(`touch did not land (held should be ${held})`);
  };

  // 1. Press on the title: the run starts, the spark goes right.
  await f.down(1);
  await landed(true);
  await frame();
  let d = await data(page);
  let frames = 1;
  while (d.tick === 0 && frames < 3) {
    await frame();
    frames++;
    d = await data(page);
  }
  console.warn(`first press: run started, first tick after ${frames} frame(s)`);
  expect(d.phase).toBe('playing');
  expect(d.held).toBe(true);
  expect(d.dir).toBe(1);
  expect(d.tick).toBeGreaterThan(0);

  // 2-3. Follow the solver with real touches, closed loop: before each move, plan from where the
  // spark really is (tick, x, input, time since the last change) and act when the plan says the
  // input changes now. Frames are whole, so a touch lands up to a tick or two off; re-planning
  // absorbs that instead of letting the errors add up.
  let held: 0 | 1 = 1;
  let lastSwitch = 0;
  let switches = 0;
  let sawRelease = false;
  const nextChange = (tick: number, x: number, h: 0 | 1, since: number): number => {
    // Prefer the planned tempo and clearance; accept quicker inputs and less room if needed.
    for (const k of [hold, 24, K_REF]) {
      for (const c of [lo, lo / 2, 0]) {
        const r = solve(p, { minClear: c, minHoldTicks: k, from: { tick, x, held: h, since } });
        if (r) {
          for (let j = tick; j < r.held.length; j++) if (r.held[j] !== h) return j;
          return Infinity;
        }
      }
    }
    throw new Error(`no plan from tick ${tick} x ${x}`);
  };
  for (;;) {
    d = await data(page);
    if (d.phase !== 'playing' || d.progress > 31) break;
    const next = nextChange(d.tick, d.x, held, d.tick - lastSwitch);
    if (!Number.isFinite(next)) break;
    if (next - d.tick > 1) {
      await page.clock.runFor(Math.max(17, Math.min(1500, Math.floor(((next - d.tick - 2) * 1000) / 120 / 17) * 17)));
      continue;
    }
    held = held === 1 ? 0 : 1;
    if (held === 0) await f.up();
    else await f.down(1);
    await landed(held === 1);
    lastSwitch = d.tick;
    await frame();
    switches++;
    if (process.env.TOUCH_DEBUG) {
      const a = await data(page);
      console.warn(`switch ${switches}: due ${next}, sent at ${d.tick}, after frame tick ${a.tick} dir ${a.dir} x ${a.x}`);
    }
    if (switches === 1) {
      // A release applies from the first tick ending at or after it: depending on where the
      // touch landed inside the frame that tick is in this frame or the next one.
      let a = await data(page);
      if (a.dir !== -1) {
        await frame();
        a = await data(page);
      }
      expect(a.held).toBe(false);
      expect(a.dir).toBe(-1);
      sawRelease = true;
    }
  }
  const i = switches + 1;
  d = await data(page);
  console.warn(`real touch: ${i - 1} switches sent, reached ${d.progress} % of level 1 (phase ${d.phase}); plan holds ≥ ${hold} ticks, clearance ${lo} px`);
  expect(sawRelease).toBe(true);
  expect(d.phase).toBe('playing');
  expect(d.progress).toBeGreaterThan(30);
  await shot(page, gameDir, 'touch-30');

  // 4. Two fingers, lift one: still held. Lift the other: released. A cancel releases too.
  await f.down(1, 2);
  await landed(true);
  await f.up(2);
  await frame();
  expect((await data(page)).held).toBe(true); // finger 2 still down
  await f.up();
  await landed(false);
  await f.down(3);
  await landed(true);
  await f.cancel();
  await landed(false);

  // 5. Let go: the spark dies. Then a real tap restarts the run.
  for (let k = 0; k < 60 && (await data(page)).phase === 'playing'; k++) await page.clock.runFor(200);
  expect((await data(page)).phase).toBe('dead');
  await page.clock.runFor(400);
  expect((await data(page)).retryReady).toBe(true);
  const before = (await data(page)).attempts;
  await f.down(1);
  await landed(true);
  await f.up();
  await landed(false);
  await frame();
  d = await data(page);
  expect(d.phase).toBe('playing');
  expect(d.attempts).toBe(before + 1);
  expect(errors).toEqual([]);
});
