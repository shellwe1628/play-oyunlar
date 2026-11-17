import type { OyunScene } from '@oyun/core';
import { at, LAYERS, TIERS, type Achievement } from '../sim/data';
import { lang } from './ui';

/** Local calendar day number (days since 1970 in the player's time zone), for the daily dig. */
export function today(now = Date.now()): number {
  const offset = new Date(now).getTimezoneOffset() * 60_000;
  return Math.floor((now - offset) / 86_400_000);
}

/** A counted noun with a readable whole number ("1,000 fossils" / "1.000 fosil"). */
function counted(scene: OyunScene, base: string, n: number): string {
  const text = n.toLocaleString(lang(scene) === 'tr' ? 'tr-TR' : 'en-US');
  return scene.t(n === 1 ? `${base}.one` : base, { n: text });
}

/** The goal as a sentence: "Find 100 fossils", "Reach Coal Swamp". */
export function questText(scene: OyunScene, a: Achievement): string {
  switch (a.kind) {
    case 'finds':
      return scene.t('quest.finds', { c: counted(scene, 'n.fossils', a.target) });
    case 'species':
      return scene.t('quest.species', { c: counted(scene, 'n.species', a.target) });
    case 'tier':
      return scene.t('quest.tier', { tier: scene.t(`tier.${at(TIERS, a.tier ?? 0).id}`) });
    case 'sets':
      return scene.t('quest.sets', { c: counted(scene, 'n.sets', a.target) });
    case 'depth':
      return scene.t('quest.depth', { name: scene.t(`layer.${at(LAYERS, a.target - 1).id}`) });
    case 'gold':
      return scene.t('quest.gold', { c: counted(scene, 'n.golds', a.target) });
    case 'relics':
      return scene.t('quest.relics', { c: counted(scene, 'n.relics', a.target) });
    case 'expeditions':
      return scene.t('quest.expeditions', { c: counted(scene, 'n.expeditions', a.target) });
  }
}

/** "2 h 05 min" / "12 min". */
export function duration(scene: OyunScene, seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return scene.t('rec.timeShort', { m });
  return scene.t('rec.time', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}
