/** Code-drawn icons for cards and upgrades (drawn into a Graphics at a centre and size). */
import type Phaser from 'phaser';
import type { CardId } from '../sim/cards';
import type { UpgradeId } from '../sim/meta';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;
const INK = PALETTE.ink;

function arrow(g: G, x: number, y: number, ang: number, len: number, color: number = PALETTE.shaftLight): void {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  const tx = x - (dx * len) / 2;
  const ty = y - (dy * len) / 2;
  const hx = x + (dx * len) / 2;
  const hy = y + (dy * len) / 2;
  g.lineStyle(10, INK, 1).lineBetween(tx, ty, hx, hy);
  g.lineStyle(5, color, 1).lineBetween(tx, ty, hx, hy);
  g.fillStyle(INK, 1).fillTriangle(hx + dx * 16, hy + dy * 16, hx - dx * 4 + px * 11, hy - dy * 4 + py * 11, hx - dx * 4 - px * 11, hy - dy * 4 - py * 11);
  g.fillStyle(PALETTE.arrowHead, 1).fillTriangle(hx + dx * 11, hy + dy * 11, hx - dx * 1 + px * 6, hy - dy * 1 + py * 6, hx - dx * 1 - px * 6, hy - dy * 1 - py * 6);
  g.fillStyle(INK, 1).fillTriangle(tx + dx * 14, ty + dy * 14, tx + px * 11, ty + py * 11, tx - dx * 3, ty - dy * 3);
  g.fillStyle(INK, 1).fillTriangle(tx + dx * 14, ty + dy * 14, tx - px * 11, ty - py * 11, tx - dx * 3, ty - dy * 3);
  g.fillStyle(PALETTE.fletch, 1).fillTriangle(tx + dx * 11, ty + dy * 11, tx + px * 7, ty + py * 7, tx, ty);
  g.fillStyle(PALETTE.fletch, 1).fillTriangle(tx + dx * 11, ty + dy * 11, tx - px * 7, ty - py * 7, tx, ty);
}

function heart(g: G, x: number, y: number, s: number, color: number = PALETTE.hp): void {
  g.fillStyle(INK, 1).fillCircle(x - 12 * s, y - 6 * s, 15 * s).fillCircle(x + 12 * s, y - 6 * s, 15 * s).fillTriangle(x - 26 * s, y, x + 26 * s, y, x, y + 28 * s);
  g.fillStyle(color, 1).fillCircle(x - 12 * s, y - 6 * s, 11 * s).fillCircle(x + 12 * s, y - 6 * s, 11 * s).fillTriangle(x - 21 * s, y - 2 * s, x + 21 * s, y - 2 * s, x, y + 22 * s);
  g.fillStyle(PALETTE.white, 0.6).fillCircle(x - 15 * s, y - 10 * s, 4 * s);
}

function coin(g: G, x: number, y: number, r: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y + 2, r + 5);
  g.fillStyle(PALETTE.coinShade, 1).fillCircle(x, y, r);
  g.fillStyle(PALETTE.coin, 1).fillCircle(x, y - 2, r - 3);
  g.fillStyle(PALETTE.coinShade, 1).fillRect(x - 3, y - r * 0.55, 6, r * 1.1);
}

export function drawCardIcon(g: G, id: CardId, x: number, y: number): void {
  switch (id) {
    case 'heavy':
      arrow(g, x, y + 6, -0.6, 90);
      g.fillStyle(INK, 1).fillRoundedRect(x - 34, y - 40, 40, 34, 8);
      g.fillStyle(PALETTE.weight, 1).fillRoundedRect(x - 30, y - 36, 32, 26, 6);
      g.fillStyle(INK, 1).fillCircle(x - 14, y - 44, 7);
      break;
    case 'double':
      arrow(g, x - 6, y - 14, -0.35, 86);
      arrow(g, x + 6, y + 16, -0.35, 86);
      break;
    case 'split':
      arrow(g, x, y, -0.5, 84);
      arrow(g, x, y, -0.05, 84);
      arrow(g, x, y, -0.95, 84);
      break;
    case 'fire':
      g.fillStyle(INK, 1).fillCircle(x, y + 14, 34).fillTriangle(x - 34, y + 10, x + 34, y + 10, x + 4, y - 50);
      g.fillStyle(PALETTE.fire, 1).fillCircle(x, y + 14, 28).fillTriangle(x - 28, y + 10, x + 28, y + 10, x + 4, y - 40);
      g.fillStyle(PALETTE.fireCore, 1).fillCircle(x, y + 20, 15).fillTriangle(x - 14, y + 18, x + 14, y + 18, x + 2, y - 10);
      break;
    case 'bounce':
      g.fillStyle(INK, 1).fillRoundedRect(x - 50, y + 26, 100, 22, 10);
      g.fillStyle(PALETTE.grass, 1).fillRoundedRect(x - 46, y + 29, 92, 14, 7);
      arrow(g, x - 22, y - 4, 0.95, 60);
      arrow(g, x + 22, y - 4, -0.95, 60);
      break;
    case 'pierce':
      g.fillStyle(INK, 1).fillCircle(x, y, 30);
      g.fillStyle(PALETTE.archer, 1).fillCircle(x, y, 24);
      arrow(g, x, y, -0.3, 110);
      break;
    case 'quick':
      g.fillStyle(INK, 1).fillTriangle(x + 10, y - 52, x - 34, y + 8, x + 2, y + 8).fillTriangle(x - 8, y + 50, x + 34, y - 10, x - 2, y - 10);
      g.fillStyle(PALETTE.fireCore, 1).fillTriangle(x + 6, y - 42, x - 26, y + 4, x + 2, y + 4).fillTriangle(x - 4, y + 40, x + 26, y - 6, x - 2, y - 6);
      break;
    case 'vitality':
      heart(g, x, y, 1.3);
      g.fillStyle(PALETTE.white, 1).fillRect(x - 4, y - 18, 8, 28).fillRect(x - 14, y - 8, 28, 8);
      break;
    case 'magnet':
      g.lineStyle(26, INK, 1).beginPath().arc(x, y + 4, 30, Math.PI, 0, false).strokePath();
      g.lineStyle(16, PALETTE.danger, 1).beginPath().arc(x, y + 4, 30, Math.PI, 0, false).strokePath();
      g.fillStyle(INK, 1).fillRect(x - 43, y + 2, 26, 30).fillRect(x + 17, y + 2, 26, 30);
      g.fillStyle(PALETTE.metalLight, 1).fillRect(x - 38, y + 8, 16, 20).fillRect(x + 22, y + 8, 16, 20);
      g.fillStyle(INK, 1).fillCircle(x, y + 34, 14);
      g.fillStyle(PALETTE.apple, 1).fillCircle(x, y + 34, 10);
      break;
    case 'shield':
      g.fillStyle(INK, 1).fillCircle(x, y, 44);
      g.fillStyle(PALETTE.bubble, 1).fillCircle(x, y, 38);
      g.fillStyle(PALETTE.white, 0.8).fillCircle(x - 14, y - 16, 10);
      g.lineStyle(5, PALETTE.sky2, 1).strokeCircle(x, y, 30);
      break;
    case 'longsight':
      g.fillStyle(INK, 1).fillEllipse(x, y, 104, 60);
      g.fillStyle(PALETTE.white, 1).fillEllipse(x, y, 92, 48);
      g.fillStyle(INK, 1).fillCircle(x, y, 20);
      g.fillStyle(PALETTE.sky2, 1).fillCircle(x, y, 15);
      g.fillStyle(INK, 1).fillCircle(x, y, 7);
      g.fillStyle(PALETTE.white, 1).fillCircle(x - 5, y - 6, 4);
      break;
    case 'vampire':
      heart(g, x, y - 4, 1.2, PALETTE.pink);
      g.fillStyle(PALETTE.white, 1).fillTriangle(x - 14, y - 6, x - 6, y - 6, x - 10, y + 8).fillTriangle(x + 6, y - 6, x + 14, y - 6, x + 10, y + 8);
      break;
  }
}

export function drawUpgradeIcon(g: G, id: UpgradeId, x: number, y: number): void {
  switch (id) {
    case 'hp':
      heart(g, x, y, 1);
      break;
    case 'dmg':
      arrow(g, x, y, -0.7, 74);
      break;
    case 'coins':
      coin(g, x - 10, y + 8, 18);
      coin(g, x + 10, y - 6, 18);
      break;
    case 'reroll':
      g.lineStyle(14, INK, 1).beginPath().arc(x, y, 24, 0.4, Math.PI * 1.7, false).strokePath();
      g.lineStyle(7, PALETTE.gold, 1).beginPath().arc(x, y, 24, 0.4, Math.PI * 1.7, false).strokePath();
      g.fillStyle(INK, 1).fillTriangle(x + 14, y - 30, x + 34, y - 12, x + 10, y - 6);
      break;
    case 'starter':
      g.fillStyle(INK, 1).fillRoundedRect(x - 24, y - 32, 48, 64, 10);
      g.fillStyle(PALETTE.card, 1).fillRoundedRect(x - 19, y - 27, 38, 54, 7);
      g.fillStyle(PALETTE.cardEdge, 1).fillTriangle(x, y - 14, x - 12, y + 10, x + 12, y + 10);
      break;
  }
}

export { coin as drawCoin, heart as drawHeart };
