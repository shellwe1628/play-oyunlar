import { basePlatform, type AdapterOptions } from './base';
import type { AnalyticsParams, HapticKind, Platform } from './types';

export type WebHistoryEntry =
  | { call: 'track'; event: string; params: AnalyticsParams | undefined }
  | { call: 'haptic'; kind: HapticKind }
  | { call: 'interstitial' | 'rewarded'; placement: string }
  | { call: 'gameplayStart' | 'gameplayStop' };

export interface WebPlatform extends Platform {
  /** Last 100 calls, newest last. Exposed in test-hook state as `platform`. */
  readonly history: readonly WebHistoryEntry[];
}

/**
 * Plain web: no ads, no haptics, no analytics backend.
 * Rewarded ads resolve 'granted' so reward flows can be played and tested without a provider.
 */
export function createWebPlatform(opts: AdapterOptions = {}): WebPlatform {
  const { common } = basePlatform('web', opts);
  const history: WebHistoryEntry[] = [];
  const log = (entry: WebHistoryEntry): void => {
    history.push(entry);
    if (history.length > 100) history.shift();
  };
  return {
    ...common,
    get paused() {
      return common.paused;
    },
    history,
    init: () => Promise.resolve(),
    showInterstitial(placement) {
      log({ call: 'interstitial', placement });
      return Promise.resolve('unavailable');
    },
    showRewarded(placement) {
      log({ call: 'rewarded', placement });
      return Promise.resolve('granted');
    },
    haptic(kind) {
      log({ call: 'haptic', kind });
    },
    track(event, params) {
      log({ call: 'track', event, params });
    },
    gameplayStart() {
      log({ call: 'gameplayStart' });
    },
    gameplayStop() {
      log({ call: 'gameplayStop' });
    },
  };
}
