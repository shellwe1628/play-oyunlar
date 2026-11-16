import { describe, expect, it } from 'vitest';
import {
  createCapacitorPlatform,
  createCrazyGamesPlatform,
  createLifecycle,
  createWebPlatform,
  detectPlatform,
  type CrazyGamesSdk,
  type LifecycleEvent,
  type Platform,
  type VisibilitySource,
} from '../src/platform';

function fakeDocument(): VisibilitySource & { setHidden(h: boolean): void; listeners: number } {
  let hidden = false;
  const fns = new Set<() => void>();
  return {
    get hidden() {
      return hidden;
    },
    get listeners() {
      return fns.size;
    },
    addEventListener: (_type, fn) => void fns.add(fn),
    removeEventListener: (_type, fn) => void fns.delete(fn),
    setHidden(h) {
      hidden = h;
      for (const fn of fns) fn();
    },
  };
}

function fakeCrazySdk(mode: 'finish' | 'error'): CrazyGamesSdk & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    environment: 'crazygames',
    init: () => {
      calls.push('init');
      return Promise.resolve();
    },
    ad: {
      requestAd: (type, cb) => {
        calls.push(`ad:${type}`);
        cb.adStarted?.();
        queueMicrotask(() => (mode === 'finish' ? cb.adFinished?.() : cb.adError?.(new Error('no fill'))));
      },
    },
    game: {
      gameplayStart: () => void calls.push('start'),
      gameplayStop: () => void calls.push('stop'),
    },
  };
}

const adapters: Record<string, (doc: VisibilitySource) => Platform> = {
  web: (doc) => createWebPlatform({ document: doc }),
  'crazygames (no sdk)': (doc) => createCrazyGamesPlatform({ document: doc, sdk: null }),
  'crazygames (sdk)': (doc) => createCrazyGamesPlatform({ document: doc, sdk: fakeCrazySdk('finish') }),
  'capacitor (no bridge)': (doc) => createCapacitorPlatform({ document: doc, bridge: null }),
};

describe.each(Object.entries(adapters))('Platform contract: %s', (_name, make) => {
  it('init resolves and calls never throw', async () => {
    const p = make(fakeDocument());
    await expect(p.init()).resolves.toBeUndefined();
    expect(() => p.haptic('light')).not.toThrow();
    expect(() => p.track('level_start', { level: 1 })).not.toThrow();
    expect(() => p.gameplayStart()).not.toThrow();
    expect(() => p.gameplayStop()).not.toThrow();
  });

  it('ads resolve to a known outcome', async () => {
    const p = make(fakeDocument());
    await p.init();
    expect(['shown', 'unavailable', 'error']).toContain(await p.showInterstitial('between_rounds'));
    expect(['granted', 'dismissed', 'unavailable', 'error']).toContain(await p.showRewarded('continue'));
  });

  it('emits pause/resume when the page is hidden and shown, and stops after dispose', () => {
    const doc = fakeDocument();
    const p = make(doc);
    const events: LifecycleEvent[] = [];
    p.onLifecycle((e) => events.push(e));
    doc.setHidden(true);
    expect(p.paused).toBe(true);
    doc.setHidden(false);
    expect(p.paused).toBe(false);
    expect(events).toEqual([
      { type: 'pause', reason: 'hidden' },
      { type: 'resume', reason: 'hidden' },
    ]);
    p.dispose();
    expect(doc.listeners).toBe(0);
  });
});

describe('web platform', () => {
  it('grants rewarded ads so game flows are testable, and has no interstitial', async () => {
    const p = createWebPlatform({ document: fakeDocument() });
    expect(await p.showRewarded('double')).toBe('granted');
    expect(await p.showInterstitial('between_rounds')).toBe('unavailable');
  });
  it('records calls in history for tests', () => {
    const p = createWebPlatform({ document: fakeDocument() });
    p.track('level_end', { score: 3 });
    p.haptic('success');
    expect(p.history).toEqual([
      { call: 'track', event: 'level_end', params: { score: 3 } },
      { call: 'haptic', kind: 'success' },
    ]);
  });
});

describe('crazygames platform', () => {
  it('pauses during an ad and grants a finished rewarded ad', async () => {
    const sdk = fakeCrazySdk('finish');
    const p = createCrazyGamesPlatform({ document: fakeDocument(), sdk });
    const events: LifecycleEvent[] = [];
    p.onLifecycle((e) => events.push(e));
    await p.init();
    expect(await p.showRewarded('continue')).toBe('granted');
    expect(events).toEqual([
      { type: 'pause', reason: 'ad' },
      { type: 'resume', reason: 'ad' },
    ]);
    expect(sdk.calls).toEqual(['init', 'ad:rewarded']);
  });
  it('maps ad errors to "error" and resumes', async () => {
    const p = createCrazyGamesPlatform({ document: fakeDocument(), sdk: fakeCrazySdk('error') });
    await p.init();
    expect(await p.showInterstitial('x')).toBe('error');
    expect(p.paused).toBe(false);
  });
  it('forwards gameplay start/stop to the SDK', async () => {
    const sdk = fakeCrazySdk('finish');
    const p = createCrazyGamesPlatform({ document: fakeDocument(), sdk });
    await p.init();
    p.gameplayStart();
    p.gameplayStop();
    expect(sdk.calls).toEqual(['init', 'start', 'stop']);
  });
  it('is unavailable without the SDK', async () => {
    const p = createCrazyGamesPlatform({ document: fakeDocument(), sdk: null });
    await p.init();
    expect(await p.showRewarded('x')).toBe('unavailable');
  });
});

describe('capacitor platform', () => {
  it('maps haptics to the Haptics plugin when the bridge has it', () => {
    const calls: unknown[] = [];
    const p = createCapacitorPlatform({
      document: fakeDocument(),
      bridge: {
        isNativePlatform: () => true,
        Plugins: {
          Haptics: {
            impact: (o) => void calls.push(['impact', o.style]),
            notification: (o) => void calls.push(['notification', o.type]),
          },
        },
      },
    });
    p.haptic('heavy');
    p.haptic('error');
    expect(calls).toEqual([
      ['impact', 'HEAVY'],
      ['notification', 'ERROR'],
    ]);
  });
});

describe('lifecycle', () => {
  it('stays paused until every reason has resumed', () => {
    const l = createLifecycle();
    const events: LifecycleEvent[] = [];
    l.on((e) => events.push(e));
    l.pause('hidden');
    l.pause('ad');
    l.resume('hidden');
    expect(l.paused).toBe(true);
    l.resume('ad');
    expect(l.paused).toBe(false);
    expect(events).toEqual([
      { type: 'pause', reason: 'hidden' },
      { type: 'resume', reason: 'ad' },
    ]);
  });
  it('ignores duplicate pause and stray resume', () => {
    const l = createLifecycle();
    const events: LifecycleEvent[] = [];
    l.on((e) => events.push(e));
    l.resume('ad');
    l.pause('ad');
    l.pause('ad');
    expect(events).toHaveLength(1);
  });
  it('on() returns an unsubscribe function', () => {
    const l = createLifecycle();
    let n = 0;
    const off = l.on(() => n++);
    off();
    l.pause('system');
    expect(n).toBe(0);
  });
});

describe('detectPlatform', () => {
  it('defaults to web', () => {
    expect(detectPlatform({ search: '', hostname: 'localhost' })).toBe('web');
  });
  it('honours an explicit build-time choice', () => {
    expect(detectPlatform({ search: '', hostname: 'x', forced: 'crazygames' })).toBe('crazygames');
  });
  it('detects a native Capacitor shell', () => {
    expect(detectPlatform({ search: '', hostname: 'localhost', capacitorNative: true })).toBe('capacitor');
  });
  it('detects CrazyGames hosts and ?platform=', () => {
    expect(detectPlatform({ search: '', hostname: 'games.crazygames.com' })).toBe('crazygames');
    expect(detectPlatform({ search: '?platform=crazygames', hostname: 'localhost' })).toBe('crazygames');
  });
  it('test mode always uses web so smoke tests are deterministic', () => {
    expect(detectPlatform({ search: '?test=1', hostname: 'x', forced: 'capacitor', capacitorNative: true })).toBe('web');
  });
});
