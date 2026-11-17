/** Cosmetic skins (pure data): spark shapes and trail colours, bought with gems. */

export interface ShapeSkin {
  id: string;
  price: number;
}

export interface TrailSkin {
  id: string;
  price: number;
  /** Ribbon colours: head and tail of the trail. */
  head: number;
  tail: number;
}

export const SHAPES: readonly ShapeSkin[] = [
  { id: 'orb', price: 0 },
  { id: 'diamond', price: 6 },
  { id: 'star', price: 9 },
  { id: 'dart', price: 12 },
  { id: 'hex', price: 16 },
  { id: 'cross', price: 20 },
  { id: 'ring', price: 25 },
  { id: 'comet', price: 32 },
];

export const TRAILS: readonly TrailSkin[] = [
  { id: 'white', price: 0, head: 0xffffff, tail: 0x7ff9ff },
  { id: 'lava', price: 3, head: 0xffe14d, tail: 0xff3d2e },
  { id: 'mint', price: 7, head: 0xb8fff0, tail: 0x18e6a5 },
  { id: 'sky', price: 10, head: 0xd6f4ff, tail: 0x2e9bff },
  { id: 'candy', price: 14, head: 0xffd1f0, tail: 0xff3fae },
  { id: 'lime', price: 18, head: 0xf4ffb0, tail: 0x8cff2e },
  { id: 'violet', price: 23, head: 0xeadcff, tail: 0x9b4dff },
  { id: 'rainbow', price: 30, head: 0xffffff, tail: 0xff5ad1 },
];
