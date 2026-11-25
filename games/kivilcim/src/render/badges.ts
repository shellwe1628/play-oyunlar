/**
 * Rank badges, drawn once with the Canvas 2D API: `badge-<i>` (192×192) for each rank. Each rank
 * is visibly more than the last: the frame gains sides, the star gains points, rings and rays
 * appear, and the top ranks glow.
 */
import type Phaser from 'phaser';
import { RANKS } from '../sim/meta';

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number): number => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

function polygon(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

function starPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: number, n: number): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

export function ensureBadges(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists('badge-0')) return;
  RANKS.forEach((rank, i) => {
    const S = 192;
    const t = tx.createCanvas(`badge-${i}`, S, S);
    if (!t) return;
    const c = t.context;
    const cx = S / 2;
    const cy = S / 2;
    const col = rank.color;
    const deep = mix(col, 0x14062b, 0.7);
    // Rays from rank 6 up.
    if (i >= 6) {
      const n = 8 + (i - 6) * 2;
      c.save();
      c.translate(cx, cy);
      for (let k = 0; k < n; k++) {
        c.rotate((2 * Math.PI) / n);
        const g = c.createLinearGradient(0, 0, 0, -94);
        g.addColorStop(0, css(col, 0.9));
        g.addColorStop(1, css(col, 0));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-7, 0);
        c.lineTo(0, -94);
        c.lineTo(7, 0);
        c.fill();
      }
      c.restore();
    }
    // Glow for the top four.
    if (i >= 8) {
      const g = c.createRadialGradient(cx, cy, 20, cx, cy, 92);
      g.addColorStop(0, css(col, 0.6));
      g.addColorStop(1, css(col, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    // Frame: from a triangle up to a many-sided medal.
    const sides = Math.min(12, 3 + i);
    polygon(c, cx, cy + 2, 70, sides, -Math.PI / 2);
    c.fillStyle = css(0x14062b);
    c.fill();
    polygon(c, cx, cy, 64, sides, -Math.PI / 2);
    const fg = c.createLinearGradient(0, cy - 64, 0, cy + 64);
    fg.addColorStop(0, css(mix(col, 0xffffff, 0.45)));
    fg.addColorStop(1, css(deep));
    c.fillStyle = fg;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = css(0xffffff, 0.9);
    c.stroke();
    // Rings: one per four ranks.
    for (let r = 0; r <= Math.floor(i / 4); r++) {
      c.beginPath();
      c.arc(cx, cy, 50 - r * 9, 0, Math.PI * 2);
      c.lineWidth = 3;
      c.strokeStyle = css(0xffffff, 0.35 + r * 0.15);
      c.stroke();
    }
    // The star: more points with each rank.
    starPath(c, cx, cy + 2, 40, 0.48, 3 + Math.floor(i / 2) + (i % 2));
    c.fillStyle = css(0x14062b, 0.8);
    c.fill();
    starPath(c, cx, cy, 38, 0.48, 3 + Math.floor(i / 2) + (i % 2));
    const sg = c.createLinearGradient(0, cy - 38, 0, cy + 38);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(1, css(col));
    c.fillStyle = sg;
    c.fill();
    // Pips under the star: the rank number within its group of four.
    for (let p = 0; p <= i % 4; p++) {
      c.beginPath();
      c.arc(cx - ((i % 4) * 9) + p * 18, cy + 58, 5, 0, Math.PI * 2);
      c.fillStyle = '#ffffff';
      c.fill();
    }
    t.refresh();
  });
}
