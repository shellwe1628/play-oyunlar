import { createGame } from '@oyun/core';
import meta from '../oyun.config.json';
import { GameScene } from './scenes/GameScene';
import { SCENES } from './scenes/keys';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { STRINGS } from './strings';
import { TEXTURES } from './textures';

void createGame({
  id: meta.id,
  title: meta.title,
  orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
  strings: STRINGS,
  textures: TEXTURES,
  scenes: [MenuScene, GameScene, ResultScene],
  start: SCENES.menu,
  menu: SCENES.menu,
}).catch((error: unknown) => {
  console.error('[oyun] boot failed', error);
});
