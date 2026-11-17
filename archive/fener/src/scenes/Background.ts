import Phaser from 'phaser';
import { PALETTE } from '../textures';

/** Point lists for fillPoints (Phaser accepts plain {x, y} at runtime; its typing wants Vector2). */
const pts = (p: { x: number; y: number }[]): Phaser.Math.Vector2[] => p as Phaser.Math.Vector2[];

/**
 * Shared menu backdrop: night sky, sea, a lighthouse with a slowly sweeping beam.
 * `lighthouseY` is the lamp height; pass null to draw only sky and sea (`sea` false: sky only).
 */
export function drawBackdrop(scene: Phaser.Scene, lighthouseY: number | null = null, sea = true): void {
  scene.cameras.main.setBackgroundColor(PALETTE.night);
  const { width, height } = scene.scale.gameSize;
  const g = scene.add.graphics().setDepth(-10);
  for (let i = 0; i < 12; i++) g.fillStyle(Phaser.Display.Color.GetColor(13 + i, 18 + i * 1.5, 38 + i * 3), 1).fillRect(0, (i * height * 0.8) / 12, width, height * 0.08 + 2);
  let s = 11;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) g.fillStyle(0xdfe6ff, 0.25 + r() * 0.5).fillCircle(r() * width, r() * height * 0.75, 1 + r() * 1.8);
  const seaY = height * 0.86;
  if (!sea) return;
  g.fillStyle(0x0d3442, 1).fillRect(0, seaY, width, height - seaY);
  g.lineStyle(3, 0x2a5a66, 0.7);
  for (let y = seaY + 16; y < height; y += 22) for (let x = (y * 3) % 70; x < width; x += 110) g.lineBetween(x, y, x + 40, y);
  if (lighthouseY === null) return;
  const lx = width * 0.11;
  const ly = lighthouseY;
  const beam = scene.add.graphics({ x: lx, y: ly }).setDepth(-9);
  beam.fillStyle(PALETTE.lamp, 0.08).fillTriangle(0, 0, 900, -110, 900, 110);
  beam.fillStyle(PALETTE.lamp, 0.06).fillTriangle(0, 0, -900, -110, -900, 110);
  scene.tweens.add({ targets: beam, angle: 360, duration: 14000, repeat: -1 });
  const t = scene.add.graphics().setDepth(-8);
  // rock, tower with bands, gallery, lamp, cap
  t.fillStyle(0x0a1a26, 1).fillEllipse(lx, seaY + 8, 170, 50);
  t.fillStyle(0xe8e0c8, 1).fillPoints(pts([{ x: lx - 26, y: ly + 40 }, { x: lx + 26, y: ly + 40 }, { x: lx + 44, y: seaY }, { x: lx - 44, y: seaY }]), true);
  t.fillStyle(0x2a8f86, 1);
  for (let k = 0; k < 3; k++) {
    const y0 = ly + 70 + k * ((seaY - ly - 70) / 3);
    const f = (y: number): number => 26 + ((y - ly - 40) / (seaY - ly - 40)) * 18;
    t.fillPoints(pts([{ x: lx - f(y0), y: y0 }, { x: lx + f(y0), y: y0 }, { x: lx + f(y0 + 30), y: y0 + 30 }, { x: lx - f(y0 + 30), y: y0 + 30 }]), true);
  }
  t.fillStyle(0x2a3156, 1).fillRect(lx - 38, ly + 30, 76, 12);
  t.fillStyle(PALETTE.lamp, 1).fillRect(lx - 22, ly - 20, 44, 50);
  t.fillStyle(0xffffff, 0.8).fillCircle(lx, ly + 4, 12);
  t.fillStyle(0x2a3156, 1).fillTriangle(lx - 30, ly - 20, lx + 30, ly - 20, lx, ly - 52);
}
