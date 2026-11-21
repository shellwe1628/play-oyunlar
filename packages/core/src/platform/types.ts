/**
 * The only way game code talks to a distribution platform (web portal, CrazyGames, native app).
 * Game code never imports an SDK or checks which platform it runs on.
 */
export type PlatformName = 'web' | 'crazygames' | 'capacitor';

/** 'unavailable' = no ad provider or no fill; the game continues as if nothing happened. */
export type InterstitialResult = 'shown' | 'unavailable' | 'error';
/** Give the reward only on 'granted'. */
export type RewardedResult = 'granted' | 'dismissed' | 'unavailable' | 'error';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'error';
export type AnalyticsParams = Readonly<Record<string, string | number | boolean>>;

/** Why the game must pause: tab/app hidden, an ad is playing, or the platform asked. */
export type PauseReason = 'hidden' | 'ad' | 'system';
export interface LifecycleEvent {
  type: 'pause' | 'resume';
  reason: PauseReason;
}

export interface Platform {
  readonly name: PlatformName;
  /** True while any pause reason is active. */
  readonly paused: boolean;
  /** Called once by createGame before boot. Never rejects. */
  init(): Promise<void>;
  /** Full-screen ad at a natural break (between rounds). Emits pause/resume around it. */
  showInterstitial(placement: string): Promise<InterstitialResult>;
  /** Opt-in ad for a reward. Emits pause/resume around it. */
  showRewarded(placement: string): Promise<RewardedResult>;
  haptic(kind: HapticKind): void;
  /** Analytics event. Use snake_case names: level_start, level_end, reward_claimed. */
  track(event: string, params?: AnalyticsParams): void;
  /** Player is actively playing (CrazyGames requires these around real gameplay). */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Subscribe to pause/resume. Returns unsubscribe. */
  onLifecycle(listener: (event: LifecycleEvent) => void): () => void;
  /** Remove every listener this adapter added. */
  dispose(): void;
}

/** The part of `document` the adapters need; injectable for tests. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
