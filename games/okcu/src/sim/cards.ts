/** In-run upgrade cards and the stats they produce (pure). */
import type { Rng } from '@oyun/core/pure';
import { UPGRADE_EFFECT, type MetaLevels } from './meta';
import { TUNING } from './tuning';

export const CARD_IDS = ['heavy', 'double', 'split', 'fire', 'bounce', 'pierce', 'quick', 'vitality', 'magnet', 'shield', 'longsight', 'vampire'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** max stacks and draw weight */
export const CARDS: Record<CardId, { max: number; weight: number }> = {
  heavy: { max: 5, weight: 10 },
  double: { max: 2, weight: 7 },
  split: { max: 2, weight: 7 },
  fire: { max: 4, weight: 8 },
  bounce: { max: 3, weight: 6 },
  pierce: { max: 3, weight: 6 },
  quick: { max: 4, weight: 9 },
  vitality: { max: 6, weight: 9 },
  magnet: { max: 2, weight: 4 },
  shield: { max: 2, weight: 5 },
  longsight: { max: 2, weight: 4 },
  vampire: { max: 3, weight: 6 },
};

export interface PlayerStats {
  dmgMul: number;
  impulseMul: number;
  /** arrows per shot, fired 0.12 s apart */
  volleys: number;
  /** extra arrows fanned out each side */
  splitPairs: number;
  fireDps: number;
  fireTime: number;
  bounces: number;
  pierce: number;
  reload: number;
  maxHp: number;
  appleHealMul: number;
  appleRadiusMul: number;
  shieldCharges: number;
  previewMul: number;
  lifesteal: number;
  coinMul: number;
  rerolls: number;
  starterCard: boolean;
}

export function countCards(cards: readonly CardId[], id: CardId): number {
  let n = 0;
  for (const c of cards) if (c === id) n += 1;
  return n;
}

export function statsFor(cards: readonly CardId[], meta: MetaLevels): PlayerStats {
  const n = (id: CardId) => countCards(cards, id);
  const fire = n('fire');
  return {
    dmgMul: 1.3 ** n('heavy') * (1 + UPGRADE_EFFECT.dmg * meta.dmg),
    impulseMul: 1.35 ** n('heavy'),
    volleys: 1 + n('double'),
    splitPairs: n('split'),
    fireDps: fire > 0 ? 8 + 6 * fire : 0,
    fireTime: fire > 0 ? 2.5 + 0.5 * fire : 0,
    bounces: n('bounce'),
    pierce: n('pierce'),
    reload: TUNING.reload * 0.72 ** n('quick'),
    maxHp: TUNING.playerMaxHp + 25 * n('vitality') + UPGRADE_EFFECT.hp * meta.hp,
    appleHealMul: 1 + 0.6 * n('magnet'),
    appleRadiusMul: 1 + 1.1 * n('magnet'),
    shieldCharges: n('shield'),
    previewMul: 1 + 0.6 * n('longsight'),
    lifesteal: 3 * n('vampire'),
    coinMul: 1 + UPGRADE_EFFECT.coins * meta.coins,
    rerolls: 1 + meta.reroll,
    starterCard: meta.starter > 0,
  };
}

/** n distinct cards, weighted, never one already at its cap. */
export function drawOffer(rng: Rng, held: readonly CardId[], n: number): CardId[] {
  const pool = CARD_IDS.filter((id) => countCards(held, id) < CARDS[id].max);
  const out: CardId[] = [];
  while (out.length < n && pool.length > 0) {
    let total = 0;
    for (const id of pool) total += CARDS[id].weight;
    let roll = rng.next() * total;
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= CARDS[pool[i]!].weight;
      if (roll < 0) {
        pick = i;
        break;
      }
    }
    out.push(pool[pick]!);
    pool.splice(pick, 1);
  }
  return out;
}
