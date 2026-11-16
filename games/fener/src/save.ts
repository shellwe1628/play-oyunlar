import type { OyunContext } from '@oyun/core';
import { createSaveStore, type SaveOptions, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { SHIFT } from './sim/night';
import { freshSave, type SaveData } from './sim/progress';

/**
 * Save schema version. Bump it (and add a migration) when a field is renamed, removed or
 * changes type. Adding a field only needs a default in freshSave().
 */
export const SAVE_VERSION = 1;

const isNum = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n);

export function isSaveData(d: unknown): d is SaveData {
  if (typeof d !== 'object' || d === null) return false;
  const s = d as SaveData;
  return (
    isNum(s.unlocked) &&
    s.unlocked >= 1 &&
    s.unlocked <= SHIFT.nights &&
    Array.isArray(s.nightBest) &&
    s.nightBest.length === SHIFT.nights &&
    s.nightBest.every(isNum) &&
    Array.isArray(s.log) &&
    s.log.every((k) => typeof k === 'string') &&
    isNum(s.shifts) &&
    typeof s.daily === 'object' &&
    s.daily !== null &&
    typeof s.daily.date === 'string' &&
    typeof s.daily.last === 'string' &&
    isNum(s.daily.best) &&
    isNum(s.daily.streak)
  );
}

export function saveOptions(storage: StorageAdapter, gameId: string): SaveOptions<SaveData> {
  return {
    key: `oyun:${gameId}:save`,
    version: SAVE_VERSION,
    defaults: freshSave,
    migrations: {},
    validate: isSaveData,
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
