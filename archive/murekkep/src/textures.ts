import { starTexture, type TextureRecipe } from '@oyun/core';
import { PALETTE } from './palette';

export { PALETTE };

/** Theme overrides for core widgets: paper-coloured buttons with ink text on a dark desk. */
export const THEME = {
  colors: {
    background: PALETTE.desk,
    surface: PALETTE.deskLight,
    primary: PALETTE.paper,
    primaryText: PALETTE.inkText,
    secondary: 0x4a4038,
    secondaryText: PALETTE.text,
    accent: PALETTE.sweet,
    danger: PALETTE.danger,
    text: PALETTE.text,
    textDim: PALETTE.textDim,
    shadow: PALETTE.paperShadow,
  },
};

/** Irregular ink drop (particles, Blot icon). Drawn white so it can be tinted. */
function dropTexture(key: string, r: number): TextureRecipe {
  const size = r * 2 + 4;
  return {
    key,
    width: size,
    height: size,
    draw(g) {
      const c = size / 2;
      g.fillStyle(0xffffff, 1).fillCircle(c, c, r);
      // Lobes make it read as a splash rather than a node circle.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        g.fillCircle(c + Math.cos(a) * r * 0.62, c + Math.sin(a) * r * 0.62, r * (0.42 + (i % 3) * 0.08));
      }
    },
  };
}

export const TEXTURES: readonly TextureRecipe[] = [
  starTexture('star', 34, 5, 0xffffff),
  starTexture('star-small', 20, 5, 0xffffff),
  dropTexture('drop', 10),
  dropTexture('drop-big', 34),
  {
    key: 'lock',
    width: 56,
    height: 64,
    draw(g) {
      g.lineStyle(9, 0xffffff, 1);
      g.beginPath();
      g.arc(28, 26, 14, Math.PI, 0);
      g.strokePath();
      g.fillStyle(0xffffff, 1).fillRoundedRect(6, 26, 44, 34, 8);
    },
  },
];
