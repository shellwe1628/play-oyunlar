import { stageOf } from '../sim/chapters';
/** Arena themes: data and the pure rule that picks one (drawing lives in src/scenes/worlds.ts). */

export type AmbientKind = 'meadow' | 'snow' | 'sand' | 'fireflies';

export interface Theme {
  id: 'meadow' | 'snow' | 'desert' | 'night';
  skyTop: number;
  skyBottom: number;
  far: number;
  farShade: number;
  near: number;
  nearShade: number;
  sun: number;
  moon: boolean;
  stars: boolean;
  /** ledge: cap (grass/snow/sand/moss), cap highlight, body, body dark, underside, underside dark */
  cap: number;
  capLight: number;
  body: number;
  bodyDark: number;
  under: number;
  underDark: number;
  ambient: AmbientKind;
  /** debris colour for arrows hitting a ledge */
  debris: number;
  /** cloud tint and alpha */
  cloud: number;
  cloudAlpha: number;
  /** dark theme: arrows get a light halo so they read against the sky */
  dark: boolean;
}

export const THEMES: readonly Theme[] = [
  {
    id: 'meadow',
    skyTop: 0x3fb4ff,
    skyBottom: 0xc8f2ff,
    far: 0x9fd8f0,
    farShade: 0x8cc8e4,
    near: 0x7ac7a0,
    nearShade: 0x5fa985,
    sun: 0xfff2a8,
    moon: false,
    stars: false,
    cap: 0x6fdc4f,
    capLight: 0xa6f06e,
    body: 0xa8683a,
    bodyDark: 0x7b4626,
    under: 0x8d7b9c,
    underDark: 0x5f4f70,
    ambient: 'meadow',
    debris: 0xa8683a,
    cloud: 0xffffff,
    cloudAlpha: 0.75,
    dark: false,
  },
  {
    id: 'snow',
    skyTop: 0x6fa6e6,
    skyBottom: 0xeaf6ff,
    far: 0xb4c6e4,
    farShade: 0x93a9d0,
    near: 0x6a8cb8,
    nearShade: 0x3f5f8c,
    sun: 0xfffbe0,
    moon: false,
    stars: false,
    cap: 0xf4fbff,
    capLight: 0xffffff,
    body: 0x8aa3c4,
    bodyDark: 0x627ea6,
    under: 0xb6daf2,
    underDark: 0x7fb0d6,
    ambient: 'snow',
    debris: 0xf4fbff,
    cloud: 0xffffff,
    cloudAlpha: 0.85,
    dark: false,
  },
  {
    id: 'desert',
    skyTop: 0x5a3d8f,
    skyBottom: 0xffa25e,
    far: 0xc8644a,
    farShade: 0xa54d3c,
    near: 0xe39a55,
    nearShade: 0xc27a3e,
    sun: 0xffd88a,
    moon: false,
    stars: false,
    cap: 0xf4c77c,
    capLight: 0xffe2a6,
    body: 0xd98c4a,
    bodyDark: 0xb0613a,
    under: 0x9c5233,
    underDark: 0x7a3d28,
    ambient: 'sand',
    debris: 0xf4c77c,
    cloud: 0xffd2b0,
    cloudAlpha: 0.55,
    dark: false,
  },
  {
    id: 'night',
    skyTop: 0x101640,
    skyBottom: 0x3e4486,
    far: 0x262d63,
    farShade: 0x1e2452,
    near: 0x1a1f45,
    nearShade: 0x12163a,
    sun: 0xf6f1cf,
    moon: true,
    stars: true,
    cap: 0x58b77a,
    capLight: 0x86d89c,
    body: 0x6a6d92,
    bodyDark: 0x4c4f74,
    under: 0x555878,
    underDark: 0x3b3d5c,
    ambient: 'fireflies',
    debris: 0x9a9dc0,
    cloud: 0x6a74b8,
    cloudAlpha: 0.45,
    dark: true,
  },
];

/** Theme of a wave: changes every five waves; the daily run starts from a date-picked one. */
/** World theme of a wave: each chapter is its own world; endless changes world every chapter-length. */
export function themeIndex(wave: number): number {
  return stageOf(wave).theme;
}

