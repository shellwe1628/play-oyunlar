/** Scene keys. One place so scenes never typo each other's names. */
export const SCENES = {
  game: 'game',
  result: 'result',
  shop: 'shop',
  forge: 'forge',
  ranks: 'ranks',
} as const;

/** Drag → shot mapping (logical px). Below DRAG_DEAD a release cancels instead of firing. */
export const DRAG_DEAD = 30;
export const DRAG_FULL = 300;
