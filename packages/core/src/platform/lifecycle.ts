import type { LifecycleEvent, PauseReason, VisibilitySource } from './types';

export interface Lifecycle {
  readonly paused: boolean;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  on(listener: (event: LifecycleEvent) => void): () => void;
  clear(): void;
}

/**
 * Reference-counted pause state: paused while any reason is active. Emits 'pause' on the first
 * reason and 'resume' when the last reason clears (so an ad shown while hidden does not resume early).
 */
export function createLifecycle(): Lifecycle {
  const reasons = new Set<PauseReason>();
  const listeners = new Set<(event: LifecycleEvent) => void>();
  const emit = (event: LifecycleEvent): void => {
    for (const fn of [...listeners]) fn(event);
  };
  return {
    get paused() {
      return reasons.size > 0;
    },
    pause(reason) {
      if (reasons.has(reason)) return;
      reasons.add(reason);
      if (reasons.size === 1) emit({ type: 'pause', reason });
    },
    resume(reason) {
      if (!reasons.delete(reason)) return;
      if (reasons.size === 0) emit({ type: 'resume', reason });
    },
    on(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    clear() {
      listeners.clear();
    },
  };
}

/** Pause with reason 'hidden' while the document is hidden. Returns the unbind function. */
export function bindVisibility(lifecycle: Lifecycle, doc: VisibilitySource | null): () => void {
  if (!doc) return () => undefined;
  const onChange = (): void => {
    if (doc.hidden) lifecycle.pause('hidden');
    else lifecycle.resume('hidden');
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}

export function defaultDocument(): VisibilitySource | null {
  return typeof document === 'undefined' ? null : document;
}
