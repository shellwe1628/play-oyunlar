import type { OyunContext } from '@oyun/core';
import { gameSave } from './save';
import { DigSim } from './sim/dig';

/** Write at most this often while digging (ms); important events write immediately. */
const SAVE_EVERY_MS = 2000;
/** Away time below this is not worth a popup (s). */
export const OFFLINE_MIN_SECONDS = 60;

/**
 * One dig per game: the sim, its save store and the save cadence. Scenes come and go
 * (dig ↔ museum); the session and its sim stay.
 */
export class Session {
  readonly sim: DigSim;
  private dirty = false;
  private lastWrite = 0;
  /** Wall-clock ms when the app went to the background, for the offline haul on return. */
  hiddenAt = 0;
  /** The boot-time offline check has run. */
  bootOfflineDone = false;

  constructor(private readonly oyun: OyunContext) {
    const store = gameSave(oyun);
    this.sim = new DigSim(oyun.rng.int(1, 2 ** 31 - 1), store.data);
    // Closing the tab or the app must lose nothing.
    const bye = (): void => void this.flush();
    window.addEventListener('pagehide', bye);
    window.addEventListener('beforeunload', bye);
  }

  /** Wall-clock ms of the last successful save of a previous session (0 = never). */
  get lastSeen(): number {
    return gameSave(this.oyun).data.lastSeen;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Throttled save; call every frame. */
  autosave(now = Date.now()): void {
    if (this.dirty && now - this.lastWrite >= SAVE_EVERY_MS) this.flush(now);
  }

  /** Save now (purchases, rare finds, travel, going to the background, leaving a scene). */
  flush(now = Date.now()): boolean {
    const snapshot = this.sim.toSave();
    snapshot.lastSeen = now;
    const ok = gameSave(this.oyun).update((d) => Object.assign(d, snapshot));
    this.lastWrite = now;
    if (ok) this.dirty = false;
    return ok;
  }
}

const sessions = new WeakMap<OyunContext, Session>();

export function session(oyun: OyunContext): Session {
  let s = sessions.get(oyun);
  if (!s) {
    s = new Session(oyun);
    sessions.set(oyun, s);
  }
  return s;
}
