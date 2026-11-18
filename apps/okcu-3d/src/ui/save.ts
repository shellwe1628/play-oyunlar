/**
 * The 3D game's own save: the 2D game's schema, versions, migrations, validation and repair
 * (games/okcu/src/save.ts `saveOptions` / `repairSave`), under its own key so the two builds never
 * share or overwrite each other's progress: `oyun:okcu-3d:save`.
 */
import { createSaveStore, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import { repairSave, saveOptions } from '@okcu/save';
import { dailyKey, type SaveData } from '@sim/meta';

export const GAME_ID = 'okcu-3d';
/** the best wave the first 3D build kept on its own before it had a save */
const OLD_BEST_KEY = 'oyun:okcu-3d:best';

export function openSave(storage: StorageAdapter): SaveStore<SaveData> {
  const store = createSaveStore(saveOptions(storage, GAME_ID));
  // additive fields (same version) are filled in memory and written with the next update
  Object.assign(store.data, repairSave(store.data));
  const old = Number(storage.getItem(OLD_BEST_KEY));
  if (Number.isFinite(old) && old > store.data.best) {
    store.update((d) => {
      d.best = Math.floor(old);
    });
  }
  return store;
}

/** Calendar key for the daily run (local date), as the 2D game makes it. */
export function todayKey(): string {
  const now = new Date();
  return dailyKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
