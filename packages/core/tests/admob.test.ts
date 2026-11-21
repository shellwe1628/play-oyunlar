import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapacitorPlatform, type AdMobBridge, type LifecycleEvent, type VisibilitySource } from '../src/platform';

const doc: VisibilitySource = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };

type Outcome = 'reward' | 'cancel' | 'failShow';
interface FakeOptions {
  /** What loading does: 'fill' resolves, 'nofill' rejects, 'hang' never settles. */
  load?: 'fill' | 'nofill' | 'hang';
  outcome?: Outcome;
  initFails?: boolean;
  /** Use Promise-returning addListener (registerPlugin proxy) instead of the native bridge's sync handle. */
  asyncListeners?: boolean;
}

/** Behaves like the plugin: show resolves on reward and rejects REWARDED_AD_CANCELLED on an early close; Dismissed follows. */
function fakeAdMob(o: FakeOptions = {}): AdMobBridge & { calls: string[]; options: unknown[]; listeners: Map<string, Set<() => void>> } {
  const calls: string[] = [];
  const options: unknown[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const emit = (e: string): void => {
    for (const fn of [...(listeners.get(e) ?? [])]) fn();
  };
  return {
    calls,
    options,
    listeners,
    initialize(opts) {
      calls.push('initialize');
      options.push(opts);
      return o.initFails ? Promise.reject(new Error('init')) : Promise.resolve();
    },
    prepareRewardVideoAd(opts) {
      calls.push('prepare');
      options.push(opts);
      if (o.load === 'hang') return new Promise(() => undefined);
      if (o.load === 'nofill') return Promise.reject(Object.assign(new Error('No fill'), { code: '3' }));
      return Promise.resolve({ adUnitId: opts.adId });
    },
    showRewardVideoAd() {
      calls.push('show');
      const outcome = o.outcome ?? 'reward';
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (outcome === 'failShow') {
            reject(Object.assign(new Error('fail'), { code: '1' }));
            emit('onRewardedVideoAdFailedToShow');
            return;
          }
          if (outcome === 'reward') {
            emit('onRewardedVideoAdReward');
            resolve({ type: 'coins', amount: 1 });
            setTimeout(() => emit('onRewardedVideoAdDismissed'), 5);
            return;
          }
          reject(Object.assign(new Error('Rewarded ad dismissed before earning a reward.'), { code: 'REWARDED_AD_CANCELLED' }));
          emit('onRewardedVideoAdDismissed');
        }, 5);
      });
    },
    addListener(event, fn) {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
      const handle = { remove: () => void set.delete(fn) };
      return o.asyncListeners ? Promise.resolve(handle) : handle;
    },
  };
}

const make = (admob: AdMobBridge | undefined, extra: Parameters<typeof createCapacitorPlatform>[0] = {}) =>
  createCapacitorPlatform({ document: doc, bridge: { isNativePlatform: () => true, Plugins: { AdMob: admob } }, rewardedAdId: 'ca-app-pub-1/2', testAds: false, ...extra });

const listenerCount = (a: ReturnType<typeof fakeAdMob>): number => [...a.listeners.values()].reduce((n, s) => n + s.size, 0);

afterEach(() => {
  vi.useRealTimers();
});

describe('capacitor platform: AdMob rewarded', () => {
  it('initializes child-directed (TFCD, TFUA, G) and preloads a non-personalised ad', async () => {
    const admob = fakeAdMob();
    const p = make(admob);
    await p.init();
    await vi.waitFor(() => expect(admob.calls).toEqual(['initialize', 'prepare']));
    expect(admob.options[0]).toEqual({ tagForChildDirectedTreatment: true, tagForUnderAgeOfConsent: true, maxAdContentRating: 'General' });
    expect(admob.options[1]).toEqual({ adId: 'ca-app-pub-1/2', isTesting: false, npa: true, immersiveMode: true });
  });

  it.each([false, true])('grants after the reward, pausing for the ad (async listeners: %s)', async (asyncListeners) => {
    const admob = fakeAdMob({ asyncListeners });
    const p = make(admob);
    const events: LifecycleEvent[] = [];
    p.onLifecycle((e) => events.push(e));
    await p.init();
    expect(await p.showRewarded('continue')).toBe('granted');
    expect(events).toEqual([
      { type: 'pause', reason: 'ad' },
      { type: 'resume', reason: 'ad' },
    ]);
    expect(p.paused).toBe(false);
    // resumed only after the ad closed, listeners removed, next ad preloaded
    await vi.waitFor(() => expect(admob.calls).toEqual(['initialize', 'prepare', 'show', 'prepare']));
    expect(listenerCount(admob)).toBe(0);
  });

  it('answers "dismissed" when the ad is closed before the reward', async () => {
    const admob = fakeAdMob({ outcome: 'cancel' });
    const p = make(admob);
    await p.init();
    expect(await p.showRewarded('double')).toBe('dismissed');
    expect(p.paused).toBe(false);
  });

  it('answers "error" when the ad fails to show', async () => {
    const p = make(fakeAdMob({ outcome: 'failShow' }));
    await p.init();
    expect(await p.showRewarded('double')).toBe('error');
    expect(p.paused).toBe(false);
  });

  it('answers "unavailable" on no fill, without pausing, and loads again on the next tap', async () => {
    const admob = fakeAdMob({ load: 'nofill' });
    const p = make(admob);
    const events: LifecycleEvent[] = [];
    p.onLifecycle((e) => events.push(e));
    await p.init();
    expect(await p.showRewarded('continue')).toBe('unavailable');
    expect(events).toEqual([]);
    expect(admob.calls).not.toContain('show');
    const prepares = admob.calls.filter((c) => c === 'prepare').length;
    expect(await p.showRewarded('continue')).toBe('unavailable');
    expect(admob.calls.filter((c) => c === 'prepare').length).toBeGreaterThan(prepares);
  });

  it('answers "unavailable" when loading takes longer than the timeout', async () => {
    vi.useFakeTimers();
    const admob = fakeAdMob({ load: 'hang' });
    const p = make(admob, { loadTimeoutMs: 8000 });
    await p.init();
    const r = p.showRewarded('continue');
    await vi.advanceTimersByTimeAsync(8000);
    expect(await r).toBe('unavailable');
    expect(admob.calls).not.toContain('show');
    expect(p.paused).toBe(false);
  });

  it('answers "unavailable" without the plugin, without an ad unit id, or when the SDK fails to start', async () => {
    const noPlugin = make(undefined);
    await noPlugin.init();
    expect(await noPlugin.showRewarded('x')).toBe('unavailable');

    const admob = fakeAdMob();
    const noId = make(admob, { rewardedAdId: '' });
    await noId.init();
    expect(await noId.showRewarded('x')).toBe('unavailable');
    expect(admob.calls).toEqual([]);

    const initFails = make(fakeAdMob({ initFails: true }));
    await initFails.init();
    expect(await initFails.showRewarded('x')).toBe('unavailable');

    const noBridge = createCapacitorPlatform({ document: doc, bridge: null, rewardedAdId: 'x' });
    expect(await noBridge.showRewarded('x')).toBe('unavailable');
  });

  it('never throws when the plugin throws synchronously', async () => {
    const admob = fakeAdMob();
    admob.showRewardVideoAd = () => {
      throw new Error('boom');
    };
    const p = make(admob);
    await p.init();
    expect(await p.showRewarded('x')).toBe('error');
    expect(p.paused).toBe(false);
  });

  it('a second tap while an ad is up is "unavailable"', async () => {
    const p = make(fakeAdMob());
    await p.init();
    const first = p.showRewarded('a');
    expect(await p.showRewarded('b')).toBe('unavailable');
    expect(await first).toBe('granted');
  });

  it('asks for test ads when testAds is set', async () => {
    const admob = fakeAdMob();
    const p = make(admob, { testAds: true });
    await p.init();
    await vi.waitFor(() => expect(admob.options[1]).toMatchObject({ isTesting: true, npa: true }));
  });
});
