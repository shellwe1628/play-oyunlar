/**
 * One texture atlas for every effect sprite (particles, glows, flames, coins), painted once on a
 * canvas. 4 × 4 tiles; every tile is white-on-transparent (tinted per sprite) except the coin.
 */
import * as THREE from 'three';
import { PALETTE } from '@okcu/textures';

export const GRID = 4;
const T = 128;

export const TILE = {
  /** soft round glow */
  blob: 0,
  /** cartoon cloud puff: solid heart, stepped soft rim */
  puff: 1,
  /** crisp shockwave ring */
  ring: 2,
  /** chunky five-point star (the 2D game's spark) */
  star: 3,
  /** splinter */
  shard: 4,
  feather: 5,
  /** flame tongue: teardrop, base at the bottom */
  tongue: 6,
  coin: 7,
  /** four-point lens glint */
  glint: 8,
  /** solid disc with a soft edge */
  disc: 9,
  /** twelve light rays from the centre */
  rays: 10,
  /** a long soft streak (motion-blurred spark), lying along x */
  streak: 11,
} as const;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

let cached: THREE.CanvasTexture | null = null;

export function fxAtlas(): THREE.CanvasTexture {
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = cv.height = T * GRID;
  const g = cv.getContext('2d')!;
  const tile = (index: number, draw: () => void): void => {
    g.save();
    g.translate((index % GRID) * T + T / 2, Math.floor(index / GRID) * T + T / 2);
    g.beginPath();
    g.rect(-T / 2, -T / 2, T, T);
    g.clip();
    draw();
    g.restore();
  };
  const R = T / 2 - 4;
  const radial = (stops: [number, number][], r = R): void => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  };

  tile(TILE.blob, () => radial([[0, 1], [0.25, 0.62], [0.55, 0.2], [0.8, 0.05], [1, 0]]));
  tile(TILE.puff, () => {
    // a cloud puff: solid heart, soft rim, and a cool shade low on one side so piles of them read as lumps
    radial([[0, 1], [0.55, 1], [0.72, 0.8], [0.88, 0.4], [1, 0]]);
    g.globalCompositeOperation = 'source-atop';
    const shade = g.createRadialGradient(-R * 0.3, -R * 0.38, R * 0.35, -R * 0.12, -R * 0.15, R * 1.25);
    shade.addColorStop(0, 'rgba(120,130,170,0)');
    shade.addColorStop(0.5, 'rgba(120,130,170,0.22)');
    shade.addColorStop(1, 'rgba(84,92,140,0.7)');
    g.fillStyle = shade;
    g.fillRect(-T / 2, -T / 2, T, T);
    g.globalCompositeOperation = 'source-over';
  });
  tile(TILE.ring, () => {
    // same proportions as the 2D ring texture: radius 40 / 48, stroke 10 / 96
    g.strokeStyle = '#fff';
    g.lineWidth = (10 / 96) * T;
    g.beginPath();
    g.arc(0, 0, (40 / 48) * (T / 2), 0, Math.PI * 2);
    g.stroke();
  });
  tile(TILE.star, () => {
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? R : R * 0.45;
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  tile(TILE.shard, () => {
    // the 2D shard: a triangle (0,5) (18,0) (14,10) in an 18 × 10 box, stretched over the tile
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(-R, 0);
    g.lineTo(R, -R);
    g.lineTo(R * 0.56, R);
    g.closePath();
    g.fill();
  });
  tile(TILE.feather, () => {
    // 40 × 18 feather stretched over the tile: vane, darker quill end, spine
    g.scale(R / 20, R / 9);
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(2, 0, 17, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(205,205,215,1)';
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(-6, -5);
    g.lineTo(-6, 5);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(170,170,185,1)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-17, 0);
    g.lineTo(18, 0);
    g.stroke();
  });
  tile(TILE.tongue, () => {
    // teardrop: wide and bright near the base (bottom), tapering to a point at the top
    g.translate(0, R * 0.62);
    g.scale(0.42, 1.62);
    radial([[0, 1], [0.4, 0.6], [0.75, 0.18], [1, 0]], R);
  });
  tile(TILE.coin, () => {
    const s = R / 20;
    g.fillStyle = css(PALETTE.ink);
    g.beginPath();
    g.arc(0, s, 19 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(PALETTE.coinShade);
    g.beginPath();
    g.arc(0, 0, 16 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(PALETTE.coin);
    g.beginPath();
    g.arc(0, -2 * s, 14 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(PALETTE.coinShade);
    g.fillRect(-3 * s, -10 * s, 6 * s, 16 * s);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(-6 * s, -8 * s, 4 * s, 0, Math.PI * 2);
    g.fill();
  });
  tile(TILE.glint, () => {
    for (let k = 0; k < 2; k++) {
      g.save();
      g.rotate((k * Math.PI) / 2);
      g.scale(1, 0.12);
      radial([[0, 1], [0.3, 0.7], [1, 0]]);
      g.restore();
    }
    radial([[0, 1], [0.5, 0.25], [1, 0]], R * 0.36);
  });
  tile(TILE.disc, () => radial([[0, 1], [0.9, 1], [1, 0]]));
  tile(TILE.rays, () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, R);
      grad.addColorStop(0, `rgba(255,255,255,${i % 2 ? 0.95 : 0.7})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - 0.12) * R, Math.sin(a - 0.12) * R);
      g.lineTo(Math.cos(a + 0.12) * R, Math.sin(a + 0.12) * R);
      g.closePath();
      g.fill();
    }
  });
  tile(TILE.streak, () => {
    g.scale(1, 0.2);
    radial([[0, 1], [0.35, 0.75], [1, 0]]);
  });

  cached = new THREE.CanvasTexture(cv);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.minFilter = THREE.LinearMipmapLinearFilter;
  cached.magFilter = THREE.LinearFilter;
  cached.generateMipmaps = true;
  return cached;
}

/** sRGB byte → linear float, so tints written into buffers match colours used by materials. */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export const linR = (hex: number): number => LIN[(hex >> 16) & 255]!;
export const linG = (hex: number): number => LIN[(hex >> 8) & 255]!;
export const linB = (hex: number): number => LIN[hex & 255]!;

/** HSV hue → colour (s = 0.65, v = 1): the same formula the 2D game cycles the top bow glow with. */
export function hueColor(h: number): number {
  const k = (n: number): number => (n + h * 6) % 6;
  const f = (n: number): number => 1 - 0.65 * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}

export function mixWhite(c: number, k: number): number {
  const q = (v: number): number => Math.round(v + (255 - v) * Math.min(1, k));
  return (q((c >> 16) & 0xff) << 16) | (q((c >> 8) & 0xff) << 8) | q(c & 0xff);
}
