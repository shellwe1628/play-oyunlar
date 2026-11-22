/**
 * The 3D build's arena themes: the game's six worlds (games/okcu/src/anim/themes.ts, one per
 * chapter) and a seventh that is in no chapter, the modes' arena (sim/modes.ts `MODE_THEME`):
 * Sunset Canyon. It lives here, not in the game's table, because the 2D build has no modes and
 * bakes a background for every entry of its own table.
 *
 * Views pick a theme by `w.theme` (`themeOf`), never by the wave: a mode world plays a chapter's
 * boss wave on the canyon.
 */
import { THEMES, type AmbientKind, type Theme } from '@okcu/anim/themes';
import { MODE_THEME } from '@sim/modes';
import type { World } from '@sim/world';

export type ArenaTheme = Omit<Theme, 'id' | 'ambient'> & { id: Theme['id'] | 'canyon'; ambient: AmbientKind | 'dust' };

/**
 * Sunset Canyon: red sandstone under a low sun, plum shadows, dust in the air. Redder and deeper
 * than the desert chapter (whose mesas stand in an open plain at dusk): here the sky burns gold
 * at the horizon and the rock is banded rust and cream.
 */
export const CANYON: ArenaTheme = {
  id: 'canyon',
  skyTop: 0x3d2360,
  skyBottom: 0xffbf6b,
  far: 0xb05a66,
  farShade: 0x74395c,
  near: 0xc9583a,
  nearShade: 0x74283a,
  sun: 0xffe9a8,
  moon: false,
  stars: false,
  cap: 0xf2c88a,
  capLight: 0xffecc0,
  body: 0xbb4a2c,
  bodyDark: 0x7e2c22,
  under: 0x6a2c42,
  underDark: 0x431f3a,
  ambient: 'dust',
  debris: 0xe0935a,
  cloud: 0xff9c7a,
  cloudAlpha: 0.6,
  dark: false,
};

/** index = `w.theme`: 0 … 5 the chapters' worlds, 6 the modes' arena */
export const ARENA_THEMES: readonly ArenaTheme[] = [...THEMES, CANYON];
export const CANYON_INDEX = MODE_THEME;

/** The theme a world is drawn in. */
export function themeOf(w: World): ArenaTheme {
  return ARENA_THEMES[Math.max(0, Math.min(ARENA_THEMES.length - 1, w.theme))]!;
}
