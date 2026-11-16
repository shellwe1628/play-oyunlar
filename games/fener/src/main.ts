import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { GameScene } from './scenes/GameScene';
import { SCENES } from './scenes/keys';
import { LogbookScene } from './scenes/LogbookScene';
import { MenuScene } from './scenes/MenuScene';
import { NightsScene } from './scenes/NightsScene';
import { ResultScene } from './scenes/ResultScene';
import { STRINGS } from './strings';
import { PALETTE, TEXTURES } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  scenes: [MenuScene, NightsScene, GameScene, ResultScene, LogbookScene],
  start: SCENES.menu,
  menu: SCENES.menu,
  theme: {
    colors: {
      background: PALETTE.night,
      surface: PALETTE.panel,
      primary: PALETTE.lamp,
      primaryText: 0x1a1408,
      secondary: 0x2c3866,
      secondaryText: PALETTE.text,
      accent: PALETTE.teal,
      danger: PALETTE.danger,
      text: PALETTE.text,
      textDim: PALETTE.textDim,
      shadow: 0x05070f,
    },
  },
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
