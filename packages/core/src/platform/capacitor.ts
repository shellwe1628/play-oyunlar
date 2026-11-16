import { basePlatform, type AdapterOptions } from './base';
import type { HapticKind, Platform } from './types';

/**
 * The subset of `window.Capacitor` this adapter touches.
 * UNVERIFIED STUB: no Android SDK or Xcode in the build environment. Haptics work only once
 * `@capacitor/haptics` is added to the native project; no ad provider is wired, so ads resolve
 * 'unavailable'; analytics is a no-op until a provider is chosen. Pause/resume comes from
 * `visibilitychange`, which the Android/iOS WebView fires when the app is backgrounded.
 */
export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Haptics?: {
      impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): unknown;
      notification(options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): unknown;
    };
  };
}

export interface CapacitorOptions extends AdapterOptions {
  /** Defaults to `window.Capacitor`; `null` = not running natively. */
  bridge?: CapacitorBridge | null;
}

export function capacitorBridge(): CapacitorBridge | null {
  return (globalThis as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

export function createCapacitorPlatform(opts: CapacitorOptions = {}): Platform {
  const { common } = basePlatform('capacitor', opts);
  const bridge = opts.bridge === undefined ? capacitorBridge() : opts.bridge;

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

  return {
    ...common,
    get paused() {
      return common.paused;
    },
    init: () => Promise.resolve(),
    showInterstitial: () => Promise.resolve('unavailable'),
    showRewarded: () => Promise.resolve('unavailable'),
    haptic,
    track: () => undefined,
    gameplayStart: () => undefined,
    gameplayStop: () => undefined,
  };
}
