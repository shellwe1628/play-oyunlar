/**
 * Playwright helpers for game smoke tests (node side only; never import from game code).
 *   import { smokeConfig } from '@oyun/core/e2e'        // playwright.config.ts
 *   import { test, expect, openGame, act, state, waitForScene, shot } from '@oyun/core/e2e'
 */
import { existsSync } from 'node:fs';
import { defineConfig, devices, expect, test, type Page, type PlaywrightTestConfig } from '@playwright/test';
import type { OyunTestApi, TestState } from './testhook';
import type { Orientation } from './ui/layout';

export { expect, test };
export type { TestState };

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
