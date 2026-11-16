import { describe, expect, it } from 'vitest';
import { createTestHook, installTestHook, parseTestParams } from '../src/testhook';

describe('parseTestParams', () => {
  it('is disabled without ?test=1', () => {
    expect(parseTestParams('')).toEqual({ enabled: false, seed: null });
    expect(parseTestParams('?test=0&seed=3')).toEqual({ enabled: false, seed: 3 });
  });
  it('reads test and seed', () => {
    expect(parseTestParams('?test=1&seed=1')).toEqual({ enabled: true, seed: 1 });
  });
  it('ignores a non-integer seed', () => {
    expect(parseTestParams('?test=1&seed=abc').seed).toBeNull();
    expect(parseTestParams('?test=1&seed=1.5').seed).toBeNull();
  });
});

describe('test hook', () => {
  it('reports not ready and no scene before anything registers', () => {
    const hook = createTestHook();
    expect(hook.api.ready).toBe(false);
    expect(hook.api.state()).toEqual({ ready: false, scene: null, scenes: [], meta: {}, data: {} });
  });

  it('state() reflects the most recently registered scene and its data', () => {
    const hook = createTestHook();
    hook.register('menu', { state: () => ({ best: 3 }) });
    hook.setReady();
    expect(hook.api.ready).toBe(true);
    expect(hook.api.state()).toMatchObject({ ready: true, scene: 'menu', scenes: ['menu'], data: { best: 3 } });
  });

  it('act() calls the action of the top-most scene that has it', () => {
    const hook = createTestHook();
    const calls: string[] = [];
    hook.register('game', { actions: { tap: (p) => void calls.push(`game:${JSON.stringify(p)}`), pause: () => void calls.push('game:pause') } });
    hook.register('pause', { actions: { resume: () => void calls.push('pause:resume') } });
    hook.api.act('resume');
    hook.api.act('tap', { x: 1 });
    expect(calls).toEqual(['pause:resume', 'game:{"x":1}']);
    expect(hook.api.actions().sort()).toEqual(['pause', 'resume', 'tap']);
  });

  it('act() throws on an unknown action so scripted tests fail loudly', () => {
    const hook = createTestHook();
    hook.register('menu', { actions: { play: () => undefined } });
    expect(() => hook.api.act('jump')).toThrow(/unknown action "jump"/);
  });

  it('unregistering removes the scene', () => {
    const hook = createTestHook();
    const off = hook.register('menu', {});
    hook.register('game', {});
    off();
    expect(hook.api.state().scenes).toEqual(['game']);
  });

  it('re-registering a key moves it to the top', () => {
    const hook = createTestHook();
    hook.register('a', {});
    hook.register('b', {});
    hook.register('a', {});
    expect(hook.api.state().scene).toBe('a');
    expect(hook.api.state().scenes).toEqual(['b', 'a']);
  });

  it('meta providers add global state', () => {
    const hook = createTestHook();
    hook.setMeta(() => ({ seed: 1, lang: 'en' }));
    expect(hook.api.state().meta).toEqual({ seed: 1, lang: 'en' });
  });
});

describe('installTestHook', () => {
  it('installs window.__OYUN__ only when enabled', () => {
    const target: { __OYUN__?: unknown } = {};
    installTestHook(target, createTestHook(), false);
    expect(target.__OYUN__).toBeUndefined();
    const hook = createTestHook();
    installTestHook(target, hook, true);
    expect(target.__OYUN__).toBe(hook.api);
  });
});
