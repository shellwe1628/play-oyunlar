import type { OyunContext } from '@oyun/core';
import { CAMPAIGN } from './sim/campaign';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { freshSave, type SaveData } from './sim/progress';

/**
 * Save schema version. Bump it (and add a migration) when a field is renamed, removed or
 * changes type. Adding a field only needs a default in SAVE_DEFAULTS.
 */
export const SAVE_VERSION = 1;

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults: freshSave,
    migrations: {},
    validate: (d): d is SaveData => {
      if (typeof d !== 'object' || d === null) return false;
      const s = d as SaveData;
      const nums = (a: unknown): boolean => Array.isArray(a) && a.length === CAMPAIGN.length && a.every((v) => Number.isFinite(v));
      return (
        nums(s.stars) &&
        nums(s.bestSeconds) &&
        [s.matches, s.wins, s.dailyBest, s.streak, s.commit, s.speed].every((v) => Number.isFinite(v)) &&
        typeof s.dailyDate === 'string' &&
        typeof s.lastDailyWin === 'string'
      );
    },
    storage,
    onError: (e) => console.warn('[save]', e),
  };
}

const stores = new WeakMap<StorageAdapter, SaveStore<SaveData>>();

/** The game's save store (one per storage adapter). */
export function gameSave(ctx: OyunContext): SaveStore<SaveData> {
  let store = stores.get(ctx.storage);
  if (!store) {
    store = createSaveStore(saveOptions(ctx.storage, ctx.info.id));
    stores.set(ctx.storage, store);
  }
  return store;
}
