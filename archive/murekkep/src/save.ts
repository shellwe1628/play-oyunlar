import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { freshSave, normalizeSave, type SaveData } from './sim/progress';

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
      // Any length: a build with more or fewer sheets pads/truncates (normalizeSave), never wipes.
      const nums = (a: unknown): boolean => Array.isArray(a) && a.every((v) => Number.isFinite(v));
      return (
        nums(s.stars) &&
        nums(s.bestSeconds) &&
        [s.matches, s.wins, s.dailyBest, s.streak, s.speed].every((v) => Number.isFinite(v)) &&
        typeof s.dailyDate === 'string' &&
        typeof s.lastDailyWin === 'string' &&
        Array.isArray(s.tips)
      );
    },
    storage,
    onError: (e) => console.warn('[save]', e),
  };
}

const stores = new WeakMap<StorageAdapter, SaveStore<SaveData>>();

/** Load the save and bring it to the current sheet count (persisted only if it changed). */
export function loadGameSave(storage: StorageAdapter, gameId: string): SaveStore<SaveData> {
  const store = createSaveStore(saveOptions(storage, gameId));
  const before = JSON.stringify(store.data);
  normalizeSave(store.data);
  if (JSON.stringify(store.data) !== before) store.update(() => undefined);
  return store;
}

/** The game's save store (one per storage adapter). */
export function gameSave(ctx: OyunContext): SaveStore<SaveData> {
  let store = stores.get(ctx.storage);
  if (!store) {
    store = loadGameSave(ctx.storage, ctx.info.id);
    stores.set(ctx.storage, store);
  }
  return store;
}
