/** Visual theme shared by core widgets. Colours are 0xRRGGBB numbers. */
export interface Theme {
  fontFamily: string;
  colors: {
    /** canvas background */
    background: number;
    /** panels, cards */
    surface: number;
    /** main call-to-action */
    primary: number;
    primaryText: number;
    /** secondary buttons */
    secondary: number;
    secondaryText: number;
    /** highlights, new-best, score pops */
    accent: number;
    danger: number;
    /** text on background */
    text: number;
    textDim: number;
    /** button/panel drop shadow */
    shadow: number;
  };
  /** Corner radius for buttons and panels, logical px. */
  radius: number;
}

export const DEFAULT_THEME: Theme = {
  fontFamily: '"Nunito", system-ui, sans-serif',
  colors: {
    background: 0x1b1f3b,
    surface: 0x2b3160,
    primary: 0xffc93c,
    primaryText: 0x2b2118,
    secondary: 0x4b5394,
    secondaryText: 0xffffff,
    accent: 0x3ee0c4,
    danger: 0xff5d73,
    text: 0xffffff,
    textDim: 0xaab0e0,
    shadow: 0x0d1026,
  },
  radius: 28,
};

export type ThemeOverrides = { fontFamily?: string; radius?: number; colors?: Partial<Theme['colors']> };

export function resolveTheme(o: ThemeOverrides = {}): Theme {
  return {
    fontFamily: o.fontFamily ?? DEFAULT_THEME.fontFamily,
    radius: o.radius ?? DEFAULT_THEME.radius,
    colors: { ...DEFAULT_THEME.colors, ...o.colors },
  };
}

/** 0xRRGGBB → '#rrggbb' for Phaser text styles. */
export function cssColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
