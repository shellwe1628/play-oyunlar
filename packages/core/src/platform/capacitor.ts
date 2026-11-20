import { basePlatform, type AdapterOptions } from './base';
import type { HapticKind, Platform, RewardedResult } from './types';

/**
 * The calls this adapter makes on `@capacitor-community/admob` (native plugin id "AdMob"), reached
 * through `window.Capacitor.Plugins.AdMob` like the other native plugins (no JS import: the web
 * bundle stays the same for every platform). Only rewarded ads are used.
 */
export interface AdMobBridge {
  initialize(options: {
    tagForChildDirectedTreatment: boolean;
    tagForUnderAgeOfConsent: boolean;
    maxAdContentRating: 'General';
  }): Promise<unknown>;
  prepareRewardVideoAd(options: { adId: string; isTesting: boolean; npa: boolean; immersiveMode: boolean }): Promise<unknown>;
  /** Resolves when the reward is earned (the ad may still be on screen); rejects with code REWARDED_AD_CANCELLED when closed early. */
  showRewardVideoAd(options?: { adId?: string }): Promise<unknown>;
  /** Native bridge: returns `{ remove }`; registerPlugin proxies: a Promise of it. */
  addListener(eventName: string, listener: (data?: unknown) => void): unknown;
}

/**
 * The subset of `window.Capacitor` this adapter touches.
 * Haptics work only once `@capacitor/haptics` is added to the native project; analytics is a
 * no-op until a provider is chosen. Pause/resume for the app going to the background comes from
 * `visibilitychange`, which the Android/iOS WebView fires; around a rewarded ad the adapter
 * pauses with reason 'ad' itself.
 */
export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Haptics?: {
      impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): unknown;
      notification(options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): unknown;
    };
    AdMob?: AdMobBridge;
  };
}

export interface CapacitorOptions extends AdapterOptions {
  /** Defaults to `window.Capacitor`; `null` = not running natively. */
  bridge?: CapacitorBridge | null;
  /** Rewarded ad unit id. Default: `VITE_OYUN_ADMOB_REWARDED` (set per platform by tools/aab.mjs, tools/ipa.mjs). None = rewarded is 'unavailable'. */
  rewardedAdId?: string;
  /** Ask for Google's test creatives instead of real ads. Default: `VITE_OYUN_ADMOB_TEST === '1'`. */
  testAds?: boolean;
  /** How long a tap waits for an ad that is not loaded yet before answering 'unavailable'. */
  loadTimeoutMs?: number;
  /** After the reward, how long to wait for the "dismissed" event before resuming anyway. */
  dismissTimeoutMs?: number;
}

export function capacitorBridge(): CapacitorBridge | null {
  return (globalThis as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

/** AdMob event names (RewardAdPluginEvents in the plugin). */
const EV = {
  rewarded: 'onRewardedVideoAdReward',
  dismissed: 'onRewardedVideoAdDismissed',
  failedToShow: 'onRewardedVideoAdFailedToShow',
} as const;
/** Google says a loaded rewarded ad expires after one hour; reload a bit before that. */
const AD_MAX_AGE_MS = 55 * 60_000;

// Build-time settings (statically replaced by Vite; undefined in other builds).
const ENV_REWARDED = import.meta.env.VITE_OYUN_ADMOB_REWARDED as string | undefined;
const ENV_TEST = import.meta.env.VITE_OYUN_ADMOB_TEST as string | undefined;

/**
 * Native app (Google Play / App Store) adapter: Google AdMob rewarded ads.
 *
 * Every user is treated as a child (the apps are in Google Play's Families programme, audience
 * "all ages"): initialize() tags every request child-directed (COPPA, TFCD) and under the age of
 * consent (GDPR, TFUA), caps ad content at G, and every request asks for non-personalised ads
 * (npa). No App Tracking Transparency prompt and no IDFA; the Android build strips the AD_ID
 * permission (tools/aab.mjs).
 *
 * Consent: no UMP request and no consent form. With TFUA set, Google's UMP SDK does not ask for
 * consent (it is not allowed to for users under the age of consent), and child-directed requests
 * get no personalised ads, so there is nothing to consent to; showing a GDPR form to children is
 * what Families asks apps not to do.
 */
export function createCapacitorPlatform(opts: CapacitorOptions = {}): Platform {
  const { common, lifecycle } = basePlatform('capacitor', opts);
  const bridge = opts.bridge === undefined ? capacitorBridge() : opts.bridge;
  const admob = bridge?.Plugins?.AdMob ?? null;
  const adId = (opts.rewardedAdId ?? ENV_REWARDED ?? '').trim();
  const testAds = opts.testAds ?? ENV_TEST === '1';
  const loadTimeoutMs = opts.loadTimeoutMs ?? 8000;
  const dismissTimeoutMs = opts.dismissTimeoutMs ?? 60_000;

  /** SDK started (false = failed or no plugin). Set by init(). */
  let started: Promise<boolean> | null = null;
  /** The load in flight or done: resolves true when an ad is ready to show. */
  let loading: Promise<boolean> | null = null;
  let loadedAt = 0;
  let busy = false;

  const haptic = (kind: HapticKind): void => {
    const h = bridge?.Plugins?.Haptics;
    if (!h) return;
    try {
      if (kind === 'success') void h.notification({ type: 'SUCCESS' });
      else if (kind === 'error') void h.notification({ type: 'ERROR' });
      else void h.impact({ style: kind === 'light' ? 'LIGHT' : kind === 'medium' ? 'MEDIUM' : 'HEAVY' });
    } catch {
      /* never break the game */
    }
  };

  /** Calls the plugin; a synchronous throw becomes a rejection. */
  const call = <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const start = (): Promise<boolean> => {
    if (!admob || !adId) return Promise.resolve(false);
    started ??= call(() =>
      admob.initialize({ tagForChildDirectedTreatment: true, tagForUnderAgeOfConsent: true, maxAdContentRating: 'General' }),
    ).then(
      () => true,
      () => false,
    );
    return started;
  };

  /** Load one ad unless one is loaded (and fresh) or loading. Never rejects. */
  const preload = (): Promise<boolean> => {
    if (!admob || !adId) return Promise.resolve(false);
    if (loading && !(loadedAt > 0 && Date.now() - loadedAt > AD_MAX_AGE_MS)) return loading;
    loadedAt = 0;
    const p: Promise<boolean> = start().then((ok) =>
      !ok
        ? false
        : call(() => admob.prepareRewardVideoAd({ adId, isTesting: testAds, npa: true, immersiveMode: true })).then(
            () => {
              loadedAt = Date.now();
              return true;
            },
            () => false,
          ),
    );
    loading = p;
    // a failed load is forgotten so the next tap tries again
    void p.then((ok) => {
      if (!ok && loading === p) loading = null;
    });
    return p;
  };

  const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    new Promise<T>((resolve) => {
      const timer = setTimeout(() => resolve(fallback), ms);
      void p.then((v) => {
        clearTimeout(timer);
        resolve(v);
      });
    });

  /** Show the loaded ad; pause('ad') until it is closed. Never rejects. */
  const present = (plugin: AdMobBridge): Promise<RewardedResult> =>
    new Promise<RewardedResult>((resolve) => {
      let rewarded = false;
      let settled = false;
      let fallback: ReturnType<typeof setTimeout> | undefined;
      const handles: unknown[] = [];
      const remove = (h: unknown): void => {
        try {
          void (h as { remove?: () => unknown } | null)?.remove?.();
        } catch {
          /* ignore */
        }
      };
      const finish = (r: RewardedResult): void => {
        if (settled) return;
        settled = true;
        if (fallback !== undefined) clearTimeout(fallback);
        handles.splice(0).forEach(remove);
        lifecycle.resume('ad');
        resolve(r);
      };
      const listen = (event: string, fn: () => void): void => {
        try {
          void Promise.resolve(plugin.addListener(event, fn)).then(
            (h) => (settled ? remove(h) : handles.push(h)),
            () => undefined,
          );
        } catch {
          /* the show promise still settles the call */
        }
      };
      listen(EV.rewarded, () => {
        rewarded = true;
      });
      listen(EV.dismissed, () => finish(rewarded ? 'granted' : 'dismissed'));
      listen(EV.failedToShow, () => finish(rewarded ? 'granted' : 'error'));
      lifecycle.pause('ad');
      call(() => plugin.showRewardVideoAd()).then(
        () => {
          // earned; the ad is usually still on screen: resume when it is dismissed
          rewarded = true;
          fallback = setTimeout(() => finish('granted'), dismissTimeoutMs);
        },
        (e: unknown) => {
          if (rewarded) finish('granted');
          else finish((e as { code?: unknown } | null)?.code === 'REWARDED_AD_CANCELLED' ? 'dismissed' : 'error');
        },
      );
    });

  const showRewarded = async (): Promise<RewardedResult> => {
    if (!admob || !adId || busy) return 'unavailable';
    busy = true;
    try {
      if (!(await withTimeout(preload(), loadTimeoutMs, false))) return 'unavailable';
      loading = null; // this ad is used up
      loadedAt = 0;
      return await present(admob);
    } catch {
      return 'error';
    } finally {
      busy = false;
      void preload(); // the next one is ready by the next offer
    }
  };

  return {
    ...common,
    get paused() {
      return common.paused;
    },
    init() {
      // Not awaited: the game boots while the SDK starts and the first ad loads.
      void preload();
      return Promise.resolve();
    },
    showInterstitial: () => Promise.resolve('unavailable'),
    showRewarded,
    haptic,
    track: () => undefined,
    gameplayStart: () => undefined,
    gameplayStop: () => undefined,
  };
}
