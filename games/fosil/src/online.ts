/**
 * Fossil Odds' online board (Google Play Games, behind the age question: @oyun/core/online).
 * Board ids must match store/apps.json playGames.boards for com.playoyunlar.fossilodds.
 *   score  the collection score of the Ranks screen (species, grades, sets, depth, relics,
 *          expeditions); it only ever grows
 */
import type { OyunContext } from '@oyun/core';
import { createOnline, openOnlinePanel, type Online } from '@oyun/core/online';
import { session } from './session';

let online: Online | null = null;

export function gameOnline(ctx: OyunContext): Online {
  if (online) return online;
  online = createOnline({
    storage: ctx.storage,
    boards: [{ id: 'score', title: { en: 'Collection score', tr: 'Koleksiyon puanı' } }],
    scores: () => ({ score: session(ctx).sim.score.total }),
  });
  void online.start();
  return online;
}

export function openOnline(ctx: OyunContext): void {
  openOnlinePanel(gameOnline(ctx), { lang: ctx.lang, theme: ctx.theme, privacyUrl: 'https://oyunlar.carsihani.me/gizlilik/fosil/' });
}
