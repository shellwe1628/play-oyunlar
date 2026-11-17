import Phaser from 'phaser';
import { at, RANKS } from '../sim/data';
import { shade } from './fossils';

/** Badge texture size (px); drawn once per rank on first use. */
export const BADGE_SIZE = 160;

/**
 * Twelve rank badges, code-drawn: the frame grows from a round medallion (ranks 1-4) to a shield
 * (5-8) to a rayed crest (9-12), each with its own emblem and the rank's colour.
 */
export function badgeKey(scene: Phaser.Scene, rank: number): string {
  const key = `badge-${rank}`;
  if (scene.textures.exists(key)) return key;
  const S = BADGE_SIZE;
  const c = S / 2;
  const color = at(RANKS, rank).color;
  const dark = shade(color, -0.45);
  const light = shade(color, 0.35);
  const g = scene.add.graphics();
  const family = rank < 4 ? 0 : rank < 8 ? 1 : 2;
  if (family === 2) {
    // rays behind the crest
    const rays = 12 + (rank - 8) * 2;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const b = a + Math.PI / rays;
      g.fillStyle(i % 2 ? light : color, 1).fillTriangle(c, c, c + Math.cos(a) * 78, c + Math.sin(a) * 78, c + Math.cos(b) * 60, c + Math.sin(b) * 60);
    }
  }
  if (family === 1) {
    const shield = (r: number): Phaser.Math.Vector2[] => [
      new Phaser.Math.Vector2(c - r, c - r * 0.8),
      new Phaser.Math.Vector2(c + r, c - r * 0.8),
      new Phaser.Math.Vector2(c + r, c + r * 0.1),
      new Phaser.Math.Vector2(c, c + r * 1.05),
      new Phaser.Math.Vector2(c - r, c + r * 0.1),
    ];
    g.fillStyle(0x000000, 0.35).fillPoints(shield(62).map((p) => p.add(new Phaser.Math.Vector2(0, 5))), true);
    g.fillStyle(dark, 1).fillPoints(shield(62), true);
    g.fillStyle(color, 1).fillPoints(shield(52), true);
    g.lineStyle(4, light, 1).strokePoints(shield(52), true);
  } else {
    g.fillStyle(0x000000, 0.35).fillCircle(c, c + 5, 58);
    g.fillStyle(dark, 1).fillCircle(c, c, 58);
    g.fillStyle(color, 1).fillCircle(c, c, 48);
    g.lineStyle(4, light, 1).strokeCircle(c, c, 48);
    if (family === 0) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.fillStyle(light, 1).fillCircle(c + Math.cos(a) * 53, c + Math.sin(a) * 53, 2.5);
    }
  }
  // emblem
  const ink = dark;
  const w = 0xffffff;
  g.fillStyle(ink, 1);
  g.lineStyle(7, ink, 1);
  switch (rank) {
    case 0: // pebbles
      g.fillEllipse(c - 12, c + 8, 30, 22).fillEllipse(c + 14, c + 12, 22, 16).fillEllipse(c + 4, c - 12, 20, 15);
      break;
    case 1: // sieve
      g.strokeCircle(c, c, 22);
      for (let i = -1; i <= 1; i++) g.lineBetween(c + i * 10, c - 18, c + i * 10, c + 18).lineBetween(c - 18, c + i * 10, c + 18, c + i * 10);
      break;
    case 2: // root
      g.lineBetween(c, c - 26, c, c + 6).lineBetween(c, c + 6, c - 18, c + 24).lineBetween(c, c + 6, c + 16, c + 26).lineBetween(c, c - 6, c + 14, c + 6);
      break;
    case 3: // bone
      g.lineStyle(10, ink, 1).lineBetween(c - 18, c + 14, c + 18, c - 14);
      g.fillCircle(c - 22, c + 12, 8).fillCircle(c - 16, c + 22, 8).fillCircle(c + 22, c - 12, 8).fillCircle(c + 16, c - 22, 8);
      break;
    case 4: // eye (reader)
      g.lineStyle(6, ink, 1).strokeEllipse(c, c - 4, 50, 28);
      g.fillCircle(c, c - 4, 9);
      break;
    case 5: // compass
      g.strokeCircle(c, c - 4, 22);
      g.fillTriangle(c, c - 30, c - 8, c - 4, c + 8, c - 4).fillStyle(w, 1).fillTriangle(c, c + 22, c - 8, c - 4, c + 8, c - 4);
      break;
    case 6: // pick (hunter)
      g.lineStyle(8, ink, 1).lineBetween(c - 16, c + 22, c + 12, c - 18);
      g.lineStyle(9, ink, 1).beginPath().arc(c + 12, c - 18, 26, Math.PI * 0.85, Math.PI * 1.75).strokePath();
      break;
    case 7: // key (curator)
      g.lineStyle(7, ink, 1).strokeCircle(c - 12, c - 10, 12);
      g.lineBetween(c - 4, c - 2, c + 22, c + 24).lineBetween(c + 14, c + 16, c + 22, c + 10).lineBetween(c + 20, c + 22, c + 26, c + 16);
      break;
    case 8: // down arrow (delver)
      g.fillStyle(w, 1).fillCircle(c, c, 36);
      g.fillStyle(ink, 1).fillRect(c - 7, c - 24, 14, 26).fillTriangle(c - 20, c, c + 20, c, c, c + 24);
      break;
    case 9: // crossed picks (master)
      g.fillStyle(w, 1).fillCircle(c, c, 36);
      g.lineStyle(7, ink, 1).lineBetween(c - 20, c + 20, c + 20, c - 20).lineBetween(c + 20, c + 20, c - 20, c - 20);
      g.fillCircle(c, c, 7);
      break;
    case 10: // crown (grand curator)
      g.fillStyle(w, 1).fillCircle(c, c, 36);
      g.fillStyle(ink, 1).fillPoints([new Phaser.Math.Vector2(c - 24, c + 16), new Phaser.Math.Vector2(c - 24, c - 14), new Phaser.Math.Vector2(c - 12, c), new Phaser.Math.Vector2(c, c - 20), new Phaser.Math.Vector2(c + 12, c), new Phaser.Math.Vector2(c + 24, c - 14), new Phaser.Math.Vector2(c + 24, c + 16)], true);
      break;
    default: {
      // legend: a fossil spiral on a star
      g.fillStyle(w, 1).fillCircle(c, c, 36);
      g.lineStyle(5, ink, 1).beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.42;
        const r = 2 + i * 0.6;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }
  // highlight
  g.fillStyle(0xffffff, 0.22).fillEllipse(c - 16, c - 30, 40, 16);
  g.generateTexture(key, S, S);
  g.destroy();
  return key;
}
