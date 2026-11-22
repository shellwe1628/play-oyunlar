import type { OyunContext } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import { gameSave } from './save';
import { awayCredit } from './sim/clock';
import { DigSim, type Find, type OfflineHaul, type SimEvent } from './sim/dig';

/** Write at most this often while digging (ms); important events write immediately. */
const SAVE_EVERY_MS = 2000;
/** Away time below this is credited quietly, without a popup (s). */
export const OFFLINE_MIN_SECONDS = 60;

/** Pause reasons that mean the app left the screen (not an ad): save, and credit away time on return. */
export function backgroundAware(reason: PauseReason): boolean {
  return reason === 'hidden' || reason === 'system';
}

function mergeHauls(a: OfflineHaul, b: OfflineHaul): OfflineHaul {
  const found = { ...a.found };
  for (const [id, n] of Object.entries(b.found)) found[id] = (found[id] ?? 0) + n;
  const best = !a.best || (b.best && b.best.odds > a.best.odds) ? b.best : a.best;
  return {
    seconds: a.seconds + b.seconds,
    hits: a.hits + b.hits,
    blocks: a.blocks + b.blocks,
    dust: a.dust + b.dust,
    found,
    newSpecies: [...a.newSpecies, ...b.newSpecies],
    fusions: a.fusions + b.fusions,
    best,
    unlocked: b.unlocked ?? a.unlocked,
    lucks: [...new Set([...a.lucks, ...b.lucks])].sort((x, y) => x - y), // never one luck some rolls did not use
    notable: [...a.notable, ...b.notable],
    rolls: a.rolls + b.rolls,
    quests: [...a.quests, ...b.quests],
    questDust: a.questDust + b.questDust,
  };
}

/**
 * One dig per game: the sim, its save store, the save cadence and away time. Scenes come and go
 * (menu, dig, museum); the session and its sim stay. Every scene handles going to the background
 * the same way: `background()` on pause, `foreground()` on resume.
 */
export class Session {
  readonly sim: DigSim;
  private dirty = false;
  private lastWrite = 0;
  /** Offline haul waiting to be shown on the dig screen (already applied to the sim and saved). */
  pendingHaul: OfflineHaul | null = null;
  /** Finds made while the dig screen was not showing (museum), waiting for their reveal. */
  pendingFinds: Find[] = [];
  /** Blocks found while away from the dig screen whose reveal is not worth replaying one by one. */
  pendingQuiet = 0;
  /** Sim events (goals, rank-ups, relics…) that happened off the dig screen, replayed there. */
  pendingEvents: SimEvent[] = [];
  private bootClaimed = false;

  constructor(private readonly oyun: OyunContext) {
    const store = gameSave(oyun);
    this.sim = new DigSim(oyun.rng.int(1, 2 ** 31 - 1), store.data);
    // weak spots only come and go while the dig screen shows (it says so itself, see DigScene)
    this.sim.setWatching(false);
    // Closing the tab or the app must lose nothing.
    const bye = (): void => void this.flush();
    window.addEventListener('pagehide', bye);
    window.addEventListener('beforeunload', bye);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Throttled save; call every frame. */
  autosave(now = Date.now()): void {
    if (this.dirty && now - this.lastWrite >= SAVE_EVERY_MS) this.flush(now);
  }

  /** Save now. The stored last-seen time only ever moves forward (no clock farming). */
  flush(now = Date.now()): boolean {
    const store = gameSave(this.oyun);
    const snapshot = this.sim.toSave();
    snapshot.lastSeen = awayCredit(store.data.lastSeen, now).lastSeen;
    const ok = store.update((d) => Object.assign(d, snapshot));
    this.lastWrite = now;
    if (ok) this.dirty = false;
    return ok;
  }

  /** The app goes to the background (any scene). */
  background(now = Date.now()): void {
    this.flush(now);
  }

  /**
   * Credit time away since the last save: on the first scene after boot and on every return from
   * the background. The haul is applied and saved at once; a big one waits in `pendingHaul`.
   */
  foreground(now = Date.now()): void {
    const { seconds } = awayCredit(gameSave(this.oyun).data.lastSeen, now);
    if (seconds > 0) {
      const haul = this.sim.claimOffline(seconds);
      if (haul.blocks > 0) this.pendingHaul = this.pendingHaul ? mergeHauls(this.pendingHaul, haul) : haul;
    }
    this.flush(now);
  }

  /** The haul to show now, if it is worth a popup; small ones are dropped quietly (already applied). */
  takeHaul(): OfflineHaul | null {
    const h = this.pendingHaul;
    this.pendingHaul = null;
    if (h && h.seconds >= OFFLINE_MIN_SECONDS) return h;
    if (h) this.sim.clearOfflineBonus();
    return null;
  }

  /** Run the boot-time away credit once per app start. */
  boot(): void {
    if (this.bootClaimed) return;
    this.bootClaimed = true;
    this.foreground();
  }

  /** A find made off the dig screen: save it now and queue its reveal. */
  queueEvents(events: readonly SimEvent[]): void {
    // only what deserves a moment on the dig screen; transient ones (fever, chain) are dropped
    for (const e of events) if (e.kind === 'quest' || e.kind === 'rank' || e.kind === 'relic') this.pendingEvents.push(e);
  }

  queueFind(f: Find): void {
    if (f.isNew || f.fossil.odds >= 100 || f.setCompleted !== null || f.unlocked !== null || f.fusions > 0) this.pendingFinds.push(f);
    else this.pendingQuiet++;
    this.flush();
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
