/** In-run upgrade cards, their synergies and the stats they produce (pure). */
import type { Rng } from '@oyun/core/pure';
import { bowDamage } from './bow';
import { WEAPONS, weaponDamage, weaponPerks, type Projectile, type WeaponId } from './weapons';
import { UPGRADE_EFFECT, type MetaLevels } from './meta';
import { TUNING } from './tuning';
import type { Difficulty } from './waves';

export const CARD_IDS = [
  'heavy',
  'double',
  'split',
  'fire',
  'bounce',
  'pierce',
  'quick',
  'vitality',
  'magnet',
  'shield',
  'longsight',
  'vampire',
  // cards that change how you play, not just numbers
  'seeker',
  'overdraw',
  'chain',
  'keen',
  'zen',
  'boom',
  // new arrow heads, offered once the run reaches their chapter (see CARDS[id].from)
  'frost',
  'blast',
] as const;
export type CardId = (typeof CARD_IDS)[number];

/** max stacks, draw weight and the first chapter (index) whose card picks offer it (0 if absent) */
export const CARDS: Record<CardId, { max: number; weight: number; from?: number }> = {
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
  seeker: { max: 2, weight: 5 },
  overdraw: { max: 2, weight: 5 },
  chain: { max: 3, weight: 5 },
  keen: { max: 3, weight: 6 },
  zen: { max: 2, weight: 5 },
  boom: { max: 2, weight: 5 },
  // frost arrows arrive with the snow (chapter 2), blast arrows with the desert walls (chapter 3)
  frost: { max: 2, weight: 6, from: 1 },
  blast: { max: 2, weight: 6, from: 2 },
};

/**
 * Cards limited to some weapons (absent = every weapon); a card fits a weapon only if it changes
 * something for that weapon's projectile. Every card not listed works the same on all six:
 * heavy (dmgMul/impulse, the rocket burst too), fire/frost/vampire/chain/keen (on a body hit, the
 * rocket's contact hit included), quick (reload), boom (knockouts), zen (focus), vitality,
 * magnet, shield (the player). Limited ones (world.ts fireVolley / updateArrows / ledgeHit /
 * hitShield / stickOrPierce / burst):
 * - double, split: one slow rocket is the firework's shot (reload ×2, full-radius burst); more
 *   rockets would stack whole bursts, so not for firework.
 * - bounce: ledgeHit turns a boomerang before any bounce and its shield glance ignores bounces;
 *   a rocket would bounce instead of bursting (the bounce branch runs first) - not for either.
 *   Sling: +1 bounce.
 * - pierce: stickOrPierce lets a boomerang cut through anyway (pierce is moot) and ends a rocket
 *   before pierce is read - not for either.
 * - seeker: flyBoomerang never steers; the rocket bursts at a 0.45 s fuse before steering pays
 *   off - not for either.
 * - overdraw: a boomerang's draw power sets how far it flies before turning, a range choice, not
 *   a power shot - not for boomerang.
 * - longsight: the 15-step preview already spans 0.48 s, past the rocket's 0.45 s fuse - not
 *   for firework.
 * - blast: burst() uses the rocket's own radius and share, never the card's - not for firework.
 */
export const CARD_WEAPONS: Partial<Record<CardId, readonly WeaponId[]>> = {
  double: ['bow', 'crossbow', 'spear', 'boomerang', 'sling'],
  split: ['bow', 'crossbow', 'spear', 'boomerang', 'sling'],
  bounce: ['bow', 'crossbow', 'spear', 'sling'],
  pierce: ['bow', 'crossbow', 'spear', 'sling'],
  seeker: ['bow', 'crossbow', 'spear', 'sling'],
  overdraw: ['bow', 'crossbow', 'spear', 'sling', 'firework'],
  longsight: ['bow', 'crossbow', 'spear', 'boomerang', 'sling'],
  blast: ['bow', 'crossbow', 'spear', 'boomerang', 'sling'],
};

/** Does card `id` do something with `weapon`? (classic is always the bow, which fits every card) */
export function cardFits(id: CardId, weapon: WeaponId): boolean {
  return CARD_WEAPONS[id]?.includes(weapon) ?? true;
}

/** Two cards that do something extra together (shown on the card when it completes a pair). */
export const SYNERGIES = [
  { id: 'inferno', a: 'fire', b: 'boom' },
  { id: 'storm', a: 'pierce', b: 'chain' },
  { id: 'swarm', a: 'split', b: 'seeker' },
  { id: 'siege', a: 'heavy', b: 'overdraw' },
  { id: 'hawk', a: 'keen', b: 'longsight' },
  { id: 'shatter', a: 'frost', b: 'blast' },
] as const satisfies readonly { id: string; a: CardId; b: CardId }[];
export type SynergyId = (typeof SYNERGIES)[number]['id'];

export function activeSynergies(cards: readonly CardId[]): SynergyId[] {
  return SYNERGIES.filter((s) => cards.includes(s.a) && cards.includes(s.b)).map((s) => s.id);
}

/** The synergy picking `card` would complete with what is already held (null if none). */
export function synergyFor(held: readonly CardId[], card: CardId): SynergyId | null {
  for (const s of SYNERGIES) {
    if ((s.a === card && held.includes(s.b) && !held.includes(s.a)) || (s.b === card && held.includes(s.a) && !held.includes(s.b))) return s.id;
  }
  return null;
}

export interface PlayerStats {
  /** hard: the selected weapon (classic is always the bow) and what it shoots */
  weapon: WeaponId;
  projectile: Projectile;
  gravityMul: number;
  speedMul: number;
  headMul: number;
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
  /** seeker: turn rate toward the nearest head, rad/s (0 = none); swarm: every arrow seeks */
  seek: number;
  swarm: boolean;
  /** overdraw: damage multiplier of a full-power shot (power ≥ 0.92), 1 = none; siege: +shove, breaks shields */
  overdraw: number;
  siege: boolean;
  /** chain: share of a hit's damage that jumps to the nearest other enemy; storm: two jumps */
  chainShare: number;
  chainJumps: number;
  /** critical hit chance and multiplier (hawk: bigger crits) */
  crit: number;
  critMul: number;
  /** focus meter gain multiplier and powered-up seconds */
  focusGain: number;
  focusTime: number;
  /** boom: knocked-out enemies burst for this much damage (0 = none); inferno: the burst burns */
  boomDmg: number;
  inferno: boolean;
  /** frost: a hit chills the archer for this many seconds (0 = none) … */
  frostTime: number;
  /** … and its draw, cool-down and hops run at this share of their speed while chilled */
  frostSlow: number;
  /** blast: arrows burst where they land; others within the radius take this share of a body hit */
  blastShare: number;
  blastRadius: number;
  /** shatter: the burst chills what it hits */
  shatter: boolean;
}

export function countCards(cards: readonly CardId[], id: CardId): number {
  let n = 0;
  for (const c of cards) if (c === id) n += 1;
  return n;
}

export const BASE_CRIT = 0.06;
export const FOCUS_TIME = 5;

/**
 * 'hard' (the 3D build) moves power from the run's cards to the forged bow: heavy cards add
 * (+20 % damage, +22 % push each) instead of multiplying, and the bow's damage counts
 * ×bowDamage^HARD_BOW_POW (×5.2 at +20), so every forge strike is a jump players feel.
 */
export const HARD_BOW_POW = 1.6;

export function statsFor(held: readonly CardId[], meta: MetaLevels, d: Difficulty = 'classic'): PlayerStats {
  const hard = d === 'hard';
  // a held card that does nothing with the weapon (a daily, a draft or the starter card) is ignored
  const weapon: WeaponId = hard ? meta.weapon : 'bow';
  const cards = held.filter((c) => cardFits(c, weapon));
  const n = (id: CardId) => countCards(cards, id);
  const fire = n('fire');
  const syn = activeSynergies(cards);
  const hawk = syn.includes('hawk');
  const wd = WEAPONS[weapon];
  const perks = hard ? weaponPerks(weapon, meta.wlevel) : weaponPerks('bow', 1);
  return {
    weapon: wd.id,
    projectile: wd.projectile,
    gravityMul: wd.gravityMul,
    speedMul: wd.speedMul,
    headMul: wd.headMul,
    dmgMul: hard ? (1 + 0.2 * n('heavy')) * weaponDamage(meta.wlevel) ** HARD_BOW_POW * wd.dmgMul : 1.3 ** n('heavy') * bowDamage(meta.bow),
    impulseMul: hard ? 1 + 0.22 * n('heavy') : 1.35 ** n('heavy'),
    volleys: 1 + n('double'),
    splitPairs: n('split'),
    fireDps: fire > 0 ? 8 + 6 * fire : 0,
    fireTime: fire > 0 ? 2.5 + 0.5 * fire : 0,
    bounces: n('bounce') + (hard ? perks.bounces : 0),
    pierce: n('pierce') + (hard ? perks.pierce : 0),
    reload: TUNING.reload * 0.72 ** n('quick') * (hard ? wd.reloadMul * perks.reloadMul : 1),
    maxHp: TUNING.playerMaxHp + 25 * n('vitality') + UPGRADE_EFFECT.hp * meta.hp,
    appleHealMul: 1 + 0.6 * n('magnet'),
    appleRadiusMul: 1 + 1.1 * n('magnet'),
    shieldCharges: n('shield'),
    previewMul: 1 + 0.6 * n('longsight'),
    lifesteal: 3 * n('vampire'),
    coinMul: 1 + UPGRADE_EFFECT.coins * meta.coins,
    rerolls: 1 + meta.reroll,
    starterCard: meta.starter > 0,
    seek: n('seeker') > 0 ? 1.6 + 1.2 * n('seeker') : 0,
    swarm: syn.includes('swarm'),
    overdraw: n('overdraw') > 0 ? 1.3 + 0.25 * n('overdraw') : 1,
    siege: syn.includes('siege'),
    chainShare: n('chain') > 0 ? 0.3 + 0.15 * n('chain') : 0,
    chainJumps: n('chain') > 0 ? (syn.includes('storm') ? 2 : 1) : 0,
    crit: BASE_CRIT + 0.08 * n('keen'),
    critMul: hawk ? 2.2 : 1.75,
    focusGain: 1 + 0.5 * n('zen'),
    focusTime: FOCUS_TIME + 2 * n('zen'),
    boomDmg: 24 * n('boom'),
    inferno: syn.includes('inferno'),
    frostTime: n('frost') > 0 ? 1.5 + 1 * n('frost') : 0,
    frostSlow: n('frost') > 0 ? 0.6 - 0.15 * (n('frost') - 1) : 1,
    blastShare: n('blast') > 0 ? 0.25 + 0.15 * n('blast') : 0,
    blastRadius: n('blast') > 0 ? 70 + 15 * n('blast') : 0,
    shatter: syn.includes('shatter'),
  };
}

/** Is `id` offered in chapter `chapter` (index; endless = CHAPTERS)? */
export function cardOpen(id: CardId, chapter: number): boolean {
  return (CARDS[id].from ?? 0) <= chapter;
}

/**
 * n distinct cards, weighted, never one already at its cap, one whose chapter is still ahead
 * (`chapter` = the chapter the pick leads into; omitted = every card) nor one that does nothing
 * with `weapon` (the bow fits every card, so its draws are unchanged). New cards sit at the end
 * of CARD_IDS, so the first chapter's offers are the same draws as before they existed.
 */
export function drawOffer(rng: Rng, held: readonly CardId[], n: number, chapter = Infinity, weapon: WeaponId = 'bow'): CardId[] {
  const pool = CARD_IDS.filter((id) => countCards(held, id) < CARDS[id].max && cardOpen(id, chapter) && cardFits(id, weapon));
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

/** Card priority for a starting hand drafted automatically (chapter select). */
export const DRAFT_ORDER: readonly CardId[] = ['vitality', 'heavy', 'quick', 'double', 'shield', 'split', 'keen', 'vampire', 'pierce', 'fire', 'frost', 'chain', 'blast', 'zen', 'seeker', 'overdraw', 'boom', 'bounce', 'magnet', 'longsight'];

export function draftPick(offer: readonly CardId[]): number {
  for (const c of DRAFT_ORDER) {
    const i = offer.indexOf(c);
    if (i >= 0) return i;
  }
  return 0;
}
