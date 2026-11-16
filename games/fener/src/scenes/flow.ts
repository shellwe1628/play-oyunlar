import type { OyunScene } from '@oyun/core';
import { gameSave } from '../save';
import { SCENES, type ShiftData } from './keys';

/** Start a shift; the very first one goes through the briefing first. */
export function startShift(scene: OyunScene, data: ShiftData): void {
  scene.oyun.audio.unlock();
  if (!gameSave(scene.oyun).data.briefed) scene.goTo(SCENES.briefing, { next: data });
  else scene.goTo(SCENES.game, data);
}
