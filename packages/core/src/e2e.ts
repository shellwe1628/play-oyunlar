/**
 * Playwright helpers for game smoke tests (node side only; never import from game code).
 *   import { smokeConfig } from '@oyun/core/e2e'        // playwright.config.ts
 *   import { test, expect, openGame, act, state, waitForScene, shot } from '@oyun/core/e2e'
 */
import { existsSync } from 'node:fs';
import { defineConfig, devices, expect, test, type Page, type PlaywrightTestConfig } from '@playwright/test';
import type { OyunTestApi, Rgba, TestState } from './testhook';
import { MAX_FRAME_MS } from './time';
import type { Orientation } from './ui/layout';

export { expect, test };
export type { Rgba, TestState };

/** Phone viewports the gate uses. Portrait = 390×844 (iPhone 12-15 CSS size). */
export const VIEWPORTS = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
} as const;

export interface SmokeConfigOptions {
  orientation: Orientation;
  /** Directory of the game (where dist/ is). Usually import.meta.dirname. */
  gameDir: string;
  /** Preview port; the gate passes OYUN_PORT. */
  port?: number;
}

/** Preinstalled Chromium of the build machine; used when Playwright's own lookup has no browser. */
export const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Browser executable: OYUN_CHROMIUM if set; else, when PLAYWRIGHT_BROWSERS_PATH is not set and
 * the machine's preinstalled Chromium exists, that one; else Playwright's default lookup (CI).
 */
function chromiumPath(): string | undefined {
  if (process.env.OYUN_CHROMIUM) return process.env.OYUN_CHROMIUM;
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(DEFAULT_CHROMIUM)) return DEFAULT_CHROMIUM;
  return undefined;
}

/**
 * Playwright config for a game smoke test: serves the BUILT game with `vite preview`,
 * Chromium only, phone viewport with touch, tracing/video off, artifacts under tests/artifacts.
 */
export function smokeConfig(opts: SmokeConfigOptions): PlaywrightTestConfig {
  const port = opts.port ?? Number(process.env.OYUN_PORT ?? 4319);
  const exe = chromiumPath();
  return defineConfig({
    testDir: `${opts.gameDir}/tests/e2e`,
    outputDir: `${opts.gameDir}/tests/artifacts/test-results`,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 60_000,
    reporter: [['list']],
    use: {
      ...devices['Desktop Chrome'],
      baseURL: `http://127.0.0.1:${port}`,
      viewport: VIEWPORTS[opts.orientation],
      hasTouch: true,
      deviceScaleFactor: 2,
      trace: 'off',
      video: 'off',
      screenshot: 'off',
      ...(exe ? { launchOptions: { executablePath: exe } } : {}),
    },
    webServer: {
      command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
      cwd: opts.gameDir,
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  });
}

/** Collects console errors and page errors. Assert it is empty at the end of every test. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Open the built game in test mode and wait for `__OYUN__.ready`. */
export async function openGame(page: Page, opts: { seed?: number; lang?: 'en' | 'tr'; query?: string } = {}): Promise<void> {
  const q = new URLSearchParams({ test: '1', seed: String(opts.seed ?? 1) });
  if (opts.lang) q.set('lang', opts.lang);
  await page.goto(`/?${q.toString()}${opts.query ? `&${opts.query}` : ''}`);
  await page.waitForFunction(() => window.__OYUN__?.ready === true, null, { timeout: 20_000 });
}

export async function state(page: Page): Promise<TestState> {
  return page.evaluate(() => (window.__OYUN__ as OyunTestApi).state());
}

export async function act(page: Page, name: string, payload?: unknown): Promise<void> {
  await page.evaluate(([n, p]) => (window.__OYUN__ as OyunTestApi).act(n, p), [name, payload] as const);
}

/** Colour the renderer drew at logical (x, y) on the next frame (`__OYUN__.pixel`). */
export async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return page.evaluate(([px, py]) => (window.__OYUN__ as OyunTestApi).pixel(px, py), [x, y] as const);
}

/** True when `actual` is within `tolerance` per channel of the 0xRRGGBB colour `expected`. */
export function colorNear(actual: Rgba, expected: number, tolerance = 6): boolean {
  const r = (expected >> 16) & 0xff;
  const g = (expected >> 8) & 0xff;
  const b = expected & 0xff;
  return Math.abs(actual.r - r) <= tolerance && Math.abs(actual.g - g) <= tolerance && Math.abs(actual.b - b) <= tolerance;
}

export interface ClockRate {
  /** Game seconds the timer moved. */
  game: number;
  /** Wall seconds between the two reads. */
  wall: number;
  /** Wall seconds counted frame by frame with each frame capped at MAX_FRAME_MS (what core passes on). */
  cappedWall: number;
  /** Animation frames in the window, and how many were longer than MAX_FRAME_MS. */
  frames: number;
  longFrames: number;
  /** game / cappedWall: 1 = game time follows real time. */
  rate: number;
}

/**
 * Game-clock rate: reads `data[key]` (seconds) at two animation frames `ms` of wall time apart,
 * inside the page. A countdown (like `timeLeft`) is read as positive elapsed time. Frames longer
 * than core's MAX_FRAME_MS cap (200 ms) are counted at the cap, because that is all a scene is
 * given for them; `longFrames` says how often that happened.
 */
export async function clockRate(page: Page, key: string, ms = 3000): Promise<ClockRate> {
  return page.evaluate(
    ([k, wait, cap]) =>
      new Promise<ClockRate>((resolve) => {
        const api = window.__OYUN__ as OyunTestApi;
        const read = (): number => Number(api.state().data[k]);
        requestAnimationFrame((start) => {
          const v0 = read();
          let last = start;
          let capped = 0;
          let frames = 0;
          let longFrames = 0;
          const frame = (now: number): void => {
            const d = now - last;
            last = now;
            frames += 1;
            if (d > cap) longFrames += 1;
            capped += Math.min(d, cap);
            if (now - start < wait) {
              requestAnimationFrame(frame);
              return;
            }
            const game = Math.abs(read() - v0);
            const cappedWall = capped / 1000;
            resolve({ game, wall: (now - start) / 1000, cappedWall, frames, longFrames, rate: game / cappedWall });
          };
          requestAnimationFrame(frame);
        });
      }),
    [key, ms, MAX_FRAME_MS] as const,
  );
}

/** Wait until the top scene is `key` (scene changes are queued to the next frame + a fade). */
export async function waitForScene(page: Page, key: string, timeout = 15_000): Promise<void> {
  await page.waitForFunction((k) => window.__OYUN__?.state().scene === k, key, { timeout });
}

/**
 * Simulate the tab/app going to the background and back (fires a real visibilitychange).
 * Phaser sleeps its loop while hidden, so scene changes show up after `hidden=false`.
 */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Full-page screenshot into `<gameDir>/tests/artifacts/<name>.png`. */
export async function shot(page: Page, gameDir: string, name: string): Promise<string> {
  const path = `${gameDir}/tests/artifacts/${name}.png`;
  await page.screenshot({ path });
  return path;
}
