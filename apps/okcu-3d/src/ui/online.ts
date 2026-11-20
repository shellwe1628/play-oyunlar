/**
 * Noodle Archers' online board (Google Play Games, behind the age question: @oyun/core/online).
 * Board ids must match store/apps.json playGames.boards for com.playoyunlar.noodlearchers.
 *   wave  the best wave reached (hard difficulty, the only one the 3D game plays)
 */
import { createOnline, openOnlinePanel, type Online } from '@oyun/core/online';
import { DEFAULT_THEME, type SaveStore, type StorageAdapter } from '@oyun/core/pure';
import type { SaveData } from '@sim/meta';

let online: Online | null = null;

/** Once at boot (main.ts): Play Games starts only for an adult answer already on file. */
export function startOnline(storage: StorageAdapter, save: SaveStore<SaveData>): Online {
  if (online) return online;
  online = createOnline({
    storage,
    boards: [{ id: 'wave', title: { en: 'Best wave', tr: 'En iyi dalga' } }],
    scores: () => ({ wave: save.data.best }),
  });
  void online.start();
  return online;
}

/** New bests go up (signed-in adults only; otherwise nothing happens). */
export function syncOnline(): void {
  void online?.sync();
}

export function openOnline(): void {
  if (!online) return;
  const lang = document.documentElement.lang === 'en' ? 'en' : 'tr';
  openOnlinePanel(online, { lang, theme: DEFAULT_THEME });
}
