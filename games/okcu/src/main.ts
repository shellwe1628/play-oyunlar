import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { GameScene } from './scenes/GameScene';
import { SCENES } from './scenes/keys';
import { ResultScene } from './scenes/ResultScene';
import { ShopScene } from './scenes/ShopScene';
import { ForgeScene } from './scenes/ForgeScene';
import { RanksScene } from './scenes/RanksScene';
import { STRINGS } from './strings';
import { PALETTE, TEXTURES } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  scenes: [GameScene, ResultScene, ShopScene, ForgeScene, RanksScene],
  // the title IS the game scene: the first drag fires the first arrow
  start: SCENES.game,
  menu: SCENES.game,
  theme: {
    colors: {
      background: 0x3fb4ff,
      surface: 0x2b3160,
      primary: 0xffc93c,
      primaryText: PALETTE.ink,
      secondary: 0x6b4ca8,
      accent: 0x7cf29c,
      shadow: PALETTE.ink,
    },
    radius: 30,
  },
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
