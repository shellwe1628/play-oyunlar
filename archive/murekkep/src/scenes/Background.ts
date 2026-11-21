import type Phaser from 'phaser';
import { PALETTE } from '../textures';

/** The desk under the sheet: dark warm colour, soft vignette, a few faint old ink rings. */
export function drawDesk(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(PALETTE.desk);
  const { width, height } = scene.scale.gameSize;
  const g = scene.add.graphics().setDepth(-10);
  g.fillStyle(PALETTE.deskLight, 0.35).fillEllipse(width / 2, height * 0.45, width * 1.3, height * 0.9);
  g.fillStyle(PALETTE.deskLight, 0.3).fillEllipse(width / 2, height * 0.45, width * 0.9, height * 0.6);
  // Old coffee/ink rings, fixed positions (decoration only).
  g.lineStyle(6, PALETTE.well, 0.35).strokeCircle(width * 0.12, height * 0.9, 70);
  g.lineStyle(3, PALETTE.well, 0.25).strokeCircle(width * 0.9, height * 0.08, 52);
}
