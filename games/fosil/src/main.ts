import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { DigScene } from './scenes/DigScene';
import { SCENES } from './scenes/keys';
import { MenuScene } from './scenes/MenuScene';
import { MuseumScene } from './scenes/MuseumScene';
import { STRINGS } from './strings';
import { PALETTE, TEXTURES } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  scenes: [MenuScene, DigScene, MuseumScene],
  start: SCENES.menu,
  menu: SCENES.menu,
  theme: {
    colors: {
      background: PALETTE.dirtDark,
      surface: PALETTE.dirtLight,
      primary: PALETTE.ochre,
      primaryText: PALETTE.ink,
      secondary: 0x6d4a2e,
      secondaryText: 0xffffff,
      accent: PALETTE.ochreLight,
      text: 0xffffff,
      textDim: PALETTE.sand,
      shadow: PALETTE.shadow,
    },
  },
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
