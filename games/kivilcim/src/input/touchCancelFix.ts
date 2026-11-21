import type Phaser from 'phaser';

interface TouchManagerInternals {
  target: EventTarget | null;
  capture: boolean;
  enabled: boolean;
  manager: { enabled: boolean; onTouchCancel(e: TouchEvent): void } | null;
  onTouchCancel: (e: TouchEvent) => void;
}

const fixed = new WeakSet<object>();

/**
 * Phaser 4.2.1's TouchManager calls preventDefault() on every touchcancel, which Chrome refuses
 * for non-cancelable events and reports as a console error ("Ignored attempt to cancel a
 * touchcancel event with cancelable=false"). The other touch handlers check `cancelable`; this
 * swaps the canvas touchcancel listener for an identical one that does too. Candidate for core.
 */
export function fixTouchCancel(game: Phaser.Game): void {
  const tm = game.input.touch as unknown as TouchManagerInternals | null;
  if (!tm || !tm.target || fixed.has(tm)) return;
  fixed.add(tm);
  tm.target.removeEventListener('touchcancel', tm.onTouchCancel as EventListener);
  const handler = (event: TouchEvent): void => {
    const manager = tm.manager;
    if (!event.defaultPrevented && tm.enabled && manager && manager.enabled) {
      manager.onTouchCancel(event);
      if (tm.capture && event.cancelable) event.preventDefault();
    }
  };
  tm.onTouchCancel = handler;
  tm.target.addEventListener('touchcancel', handler as EventListener, { passive: !tm.capture });
}
