import { basePlatform, type AdapterOptions } from './base';
import type { InterstitialResult, Platform, RewardedResult } from './types';

/**
 * The subset of the CrazyGames HTML5 SDK v3 this adapter calls.
 * UNVERIFIED STUB: written from the SDK's documented shape, never run against the real SDK here.
 * The SDK is a script tag (https://sdk.crazygames.com/crazygames-sdk-v3.js) that the CrazyGames
 * build must add to index.html; without it every ad resolves 'unavailable'.
 */
export interface CrazyGamesSdk {
  environment?: 'local' | 'crazygames' | 'disabled';
  init(): Promise<void>;
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (error: unknown) => void },
    ): void;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
  };
}

export interface CrazyGamesOptions extends AdapterOptions {
  /** Defaults to `window.CrazyGames.SDK`; `null` = no SDK. */
  sdk?: CrazyGamesSdk | null;
}

function globalSdk(): CrazyGamesSdk | null {
  const w = globalThis as { CrazyGames?: { SDK?: CrazyGamesSdk } };
  return w.CrazyGames?.SDK ?? null;
}

export function createCrazyGamesPlatform(opts: CrazyGamesOptions = {}): Platform {
  const { common, lifecycle } = basePlatform('crazygames', opts);
  const sdk = opts.sdk === undefined ? globalSdk() : opts.sdk;
  let ready = false;

  const request = <R extends string>(type: 'midgame' | 'rewarded', ok: R, fail: R, none: R): Promise<R> => {
    if (!sdk || !ready) return Promise.resolve(none);
    return new Promise<R>((resolve) => {
      let settled = false;
      const done = (r: R): void => {
        if (settled) return;
        settled = true;
        lifecycle.resume('ad');
        resolve(r);
      };
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => lifecycle.pause('ad'),
          adFinished: () => done(ok),
          adError: () => done(fail),
        });
      } catch {
        done(fail);
      }
    });
  };

  const safe = (fn: () => void): void => {
    if (!sdk || !ready) return;
    try {
      fn();
    } catch {
      /* platform calls must never break the game */
    }
  };

  return {
    ...common,
    get paused() {
      return common.paused;
    },
    async init() {
      if (!sdk) return;
      try {
        await sdk.init();
        ready = true;
      } catch {
        ready = false;
      }
    },
    showInterstitial: () => request<InterstitialResult>('midgame', 'shown', 'error', 'unavailable'),
    showRewarded: () => request<RewardedResult>('rewarded', 'granted', 'error', 'unavailable'),
    haptic: () => undefined,
    track: () => undefined, // CrazyGames has no custom analytics events
    gameplayStart: () => safe(() => sdk?.game.gameplayStart()),
    gameplayStop: () => safe(() => sdk?.game.gameplayStop()),
  };
}
