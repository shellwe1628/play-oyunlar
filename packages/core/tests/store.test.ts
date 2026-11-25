import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Pure from '../src/pure';

/**
 * Loads the pure entry as a store build or a web build. (Vite folds STORE_BUILD into a literal at
 * build time; here the constant's module is swapped instead.)
 */
async function load(store: boolean): Promise<typeof Pure> {
  vi.resetModules();
  vi.doMock('../src/store', () => ({ STORE_BUILD: store }));
  return import('../src/pure');
}

afterEach(() => {
  vi.doUnmock('../src/store');
  vi.resetModules();
});

describe('STORE_BUILD', () => {
  it('is off in tests and web builds (VITE_OYUN_STORE unset)', async () => {
    vi.resetModules();
    expect((await import('../src/store')).STORE_BUILD).toBe(false);
  });

  it('a store build ignores ?test=1, ?seed= and installs no test hook', async () => {
    const core = await load(true);
    expect(core.parseTestParams('?test=1&seed=5')).toEqual({ enabled: false, seed: null });
    const hook = core.createTestHook();
    hook.register('game', { actions: { autopilot: () => undefined } });
    expect(hook.api.actions()).toEqual([]);
    const target = {};
    core.installTestHook(target, hook, true);
    expect('__OYUN__' in target).toBe(false);
  });

  it('a store build picks the platform from the build only, never from the URL or the host', async () => {
    const { detectPlatform, createPlatform } = await load(true);
    expect(detectPlatform({ search: '?test=1', hostname: 'x', forced: 'capacitor', capacitorNative: true })).toBe('capacitor');
    expect(detectPlatform({ search: '?platform=crazygames', hostname: 'games.crazygames.com' })).toBe('web');
    expect(detectPlatform({ forced: 'crazygames' })).toBe('web');
    expect(detectPlatform({ capacitorNative: true })).toBe('capacitor');
    expect(detectPlatform({ forced: 'web', capacitorNative: true })).toBe('web');
    expect(createPlatform('crazygames').name).toBe('web');
  });

  it('a web build keeps the test hook and the URL switches', async () => {
    const core = await load(false);
    expect(core.parseTestParams('?test=1&seed=5')).toEqual({ enabled: true, seed: 5 });
    expect(core.detectPlatform({ search: '?platform=crazygames', hostname: 'localhost' })).toBe('crazygames');
  });
});
