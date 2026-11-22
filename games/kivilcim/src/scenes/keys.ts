/** Scene keys. One place so scenes never typo each other's names. */
export const SCENES = {
  game: 'game',
  levels: 'levels',
  skins: 'skins',
  ranks: 'ranks',
} as const;

/** Registry key (this session only): the level that the last finish unlocked, for level select. */
export const UNLOCKED_KEY = 'kvJustUnlocked';
