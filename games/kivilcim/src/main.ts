import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { GameScene } from './scenes/GameScene';
import { SCENES } from './scenes/keys';
import { LevelsScene } from './scenes/LevelsScene';
import { RanksScene } from './scenes/RanksScene';
import { SkinsScene } from './scenes/SkinsScene';
import { STRINGS } from './strings';
import { TEXTURES } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  // The game scene is also the title screen: the logo sits over the live shaft and the first
  // press starts the run in the same frame. Quit from the pause menu lands on that title.
  scenes: [GameScene, LevelsScene, SkinsScene, RanksScene],
  start: SCENES.game,
  menu: SCENES.game,
  theme: {
    colors: {
      background: 0x1a0838,
      surface: 0x2a1263,
      primary: 0xffe14d,
      primaryText: 0x2a1018,
      secondary: 0x6a3dff,
      secondaryText: 0xffffff,
      accent: 0x3ff6ff,
      danger: 0xff3d5a,
      text: 0xffffff,
      textDim: 0xd8c8ff,
      shadow: 0x14062b,
    },
  },
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
