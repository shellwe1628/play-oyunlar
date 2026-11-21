import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { GameScene } from './scenes/GameScene';
import { SCENES } from './scenes/keys';
import { MapSelectScene } from './scenes/MapSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { STRINGS } from './strings';
import { TEXTURES, THEME } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  scenes: [MenuScene, MapSelectScene, GameScene, ResultScene],
  start: SCENES.menu,
  menu: SCENES.menu,
  theme: THEME,
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
