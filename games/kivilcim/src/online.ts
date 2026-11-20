/**
 * Sparkrise's online boards (Google Play Games, behind the age question: @oyun/core/online).
 * Board ids must match store/apps.json playGames.boards for com.playoyunlar.sparkrise.
 *   rank     the rank score (Ranks screen): stars, levels, endless, daily, collection, feats
 *   endless  the best endless height in metres
 */
import type { OyunContext } from '@oyun/core';
import { createOnline, openOnlinePanel, type Online } from '@oyun/core/online';
import { gameSave } from './save';
import { progressScore } from './sim/meta';

let online: Online | null = null;

export function gameOnline(ctx: OyunContext): Online {
  if (online) return online;
  online = createOnline({
    storage: ctx.storage,
    boards: [
      { id: 'rank', title: { en: 'Rank score', tr: 'Rütbe puanı' } },
      { id: 'endless', title: { en: 'Endless height', tr: 'Sonsuz yükseklik' }, format: (n, lang) => `${n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')} m` },
    ],
    scores: () => {
      const d = gameSave(ctx).data;
      return { rank: progressScore(d), endless: d.endlessBest };
    },
  });
  void online.start();
  return online;
}

export function openOnline(ctx: OyunContext): void {
  openOnlinePanel(gameOnline(ctx), { lang: ctx.lang, theme: ctx.theme });
}
