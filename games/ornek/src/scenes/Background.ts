import type Phaser from 'phaser';

/** Shared backdrop: theme colour plus a slow drifting dot grid (code-drawn, no assets). */
export function drawBackdrop(scene: Phaser.Scene, color: number): void {
  scene.cameras.main.setBackgroundColor(color);
  const { width, height } = scene.scale.gameSize;
  const step = 80;
  const dots = scene.add.container(0, 0).setDepth(-10);
  for (let y = -step; y < height + step; y += step) {
    for (let x = (y / step) % 2 === 0 ? 0 : step / 2; x < width + step; x += step) {
      dots.add(scene.add.image(x, y, 'bg-dot').setAlpha(0.8));
    }
  }
  scene.tweens.add({ targets: dots, y: step, duration: 6000, repeat: -1, ease: 'Linear' });
}
