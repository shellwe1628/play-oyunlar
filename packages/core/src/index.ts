/**
 * @oyun/core — everything, including Phaser-dependent parts.
 * Sim code (src/sim) must import from '@oyun/core/pure' instead.
 */
export * from './pure';
export { createGame, type OyunGameConfig, type OyunGame } from './game';
export { getContext, type OyunContext, type ResolvedGameInfo } from './context';
export { OyunScene, PAUSE_SCENE, type Layout } from './scenes/OyunScene';
export { BootScene, BOOT_SCENE } from './scenes/BootScene';
export { PauseScene } from './scenes/PauseScene';
export { MenuScene } from './scenes/MenuScene';
export { ResultScene, type ResultData } from './scenes/ResultScene';
export { Juice, type FloatTextOptions, type BurstOptions } from './juice/juice';
export {
  Button,
  IconButton,
  ProgressBar,
  button,
  iconButton,
  muteButton,
  label,
  linkLabel,
  panel,
  progressBar,
  toast,
  type ButtonOptions,
  type IconName,
  type PanelOptions,
  type ProgressBarOptions,
  type TextOptions,
  type ToastOptions,
} from './ui/widgets';
export {
  circleTexture,
  ringTexture,
  roundRectTexture,
  starTexture,
  CORE_TEXTURES,
  type TextureRecipe,
  type StrokeOptions,
} from './textures';
