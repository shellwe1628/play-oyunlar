import { starTexture, type TextureRecipe } from '@oyun/core';

/** Game palette. Every colour of Ink Tide lives here. */
export const PALETTE = {
  /** The desk the sheet lies on. */
  desk: 0x27211d,
  deskLight: 0x362e28,
  /** Wells: bar and slider tracks, old rings on the desk. */
  well: 0x1a1512,
  /** Text outline over the sheet. */
  outline: 0x1c1712,
  /** Locked / muted cards. */
  cardLocked: 0x2e2723,
  cardEdge: 0x5a4d42,
  cardEdgeLocked: 0x3a322c,
  /** Dark text on the ochre daily card. */
  dailyInk: 0x2a1e08,
  dailyInkSoft: 0x3a2a0c,
  /** Ink-blue text on paper-coloured controls. */
  inkText: 0x1f2a6e,
  /** Glossy highlight (white at low alpha). */
  shine: 0xffffff,
  /** Paper: off-white with warm fibres. */
  paper: 0xf3ecdd,
  paperShade: 0xe2d7c2,
  paperShadow: 0x0f0c0a,
  /**
   * Ink per colony: indigo (player), vermilion, jade, saffron, rose, sepia. Chosen from an
   * Okabe–Ito-like set: every pair stays ≥ 53 ΔE (CIELAB) apart, ≥ 26 under simulated deuteranopia
   * and ≥ 35 under protanopia (Machado 2009, severity 1); colonies also carry a texture pattern.
   */
  inks: [0x174a9e, 0xe2560a, 0x00876a, 0xf5bd10, 0xe29ad0, 0x3a2a24] as readonly number[],
  text: 0xf6f0e3,
  textDim: 0xbdb19c,
  sweet: 0xf1c75b,
  danger: 0xe0553f,
  grey: 0x7d766c,
  starOn: 0xf1c75b,
  starOff: 0x5a5048,
  toastDark: 0x3a332c,
} as const;

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
