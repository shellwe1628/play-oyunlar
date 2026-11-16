import Phaser from 'phaser';

/**
 * A texture drawn with code at boot. `draw` receives a cleared Graphics; draw inside
 * (0,0)-(width,height). BootScene bakes it with generateTexture(key, width, height).
 */
export interface TextureRecipe {
  key: string;
  width: number;
  height: number;
  draw(g: Phaser.GameObjects.Graphics): void;
}

export interface StrokeOptions {
  /** Stroke width in px. */
  width: number;
  color: number;
  alpha?: number;
}

/** Filled circle, optional outline. Size = 2r (+ stroke). */
export function circleTexture(key: string, radius: number, color: number, stroke?: StrokeOptions): TextureRecipe {
  const pad = stroke ? Math.ceil(stroke.width / 2) : 0;
  const size = Math.ceil(radius * 2 + pad * 2);
  return {
    key,
    width: size,
    height: size,
    draw(g) {
      g.fillStyle(color, 1).fillCircle(size / 2, size / 2, radius);
      if (stroke) g.lineStyle(stroke.width, stroke.color, stroke.alpha ?? 1).strokeCircle(size / 2, size / 2, radius);
    },
  };
}

/** Ring (circle outline only). */
export function ringTexture(key: string, radius: number, thickness: number, color: number): TextureRecipe {
  const size = Math.ceil(radius * 2 + thickness);
  return {
    key,
    width: size,
    height: size,
    draw(g) {
      g.lineStyle(thickness, color, 1).strokeCircle(size / 2, size / 2, radius);
    },
  };
}

/** Rounded rectangle, optional outline. */
export function roundRectTexture(
  key: string,
  width: number,
  height: number,
  radius: number,
  color: number,
  stroke?: StrokeOptions,
): TextureRecipe {
  const pad = stroke ? Math.ceil(stroke.width / 2) : 0;
  return {
    key,
    width: width + pad * 2,
    height: height + pad * 2,
    draw(g) {
      g.fillStyle(color, 1).fillRoundedRect(pad, pad, width, height, radius);
      if (stroke) g.lineStyle(stroke.width, stroke.color, stroke.alpha ?? 1).strokeRoundedRect(pad, pad, width, height, radius);
    },
  };
}

/** N-pointed star. inner = inner radius as a fraction of the outer radius. */
export function starTexture(key: string, radius: number, points: number, color: number, inner = 0.5): TextureRecipe {
  const size = Math.ceil(radius * 2);
  return {
    key,
    width: size,
    height: size,
    draw(g) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? radius : radius * inner;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        pts.push(new Phaser.Math.Vector2(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r));
      }
      g.fillStyle(color, 1).fillPoints(pts, true);
    },
  };
}

/** Textures core itself uses (particles). Always generated. */
export const CORE_TEXTURES: readonly TextureRecipe[] = [
  circleTexture('oyun-dot', 8, 0xffffff),
  starTexture('oyun-star', 12, 5, 0xffffff, 0.45),
];
