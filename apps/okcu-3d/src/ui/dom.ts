/**
 * DOM building blocks for the HUD: the logical 720 × 1280 layer that scales with the stage, stroked
 * text labels (drawn the way Phaser draws them: canvas text with a round-joined outline), the core's
 * chunky buttons, and a small real-time timer list.
 *
 * Everything is laid out in the 2D game's logical pixels; one CSS transform fits it to the stage.
 */
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-ext-800.css';
import { DEFAULT_THEME } from '@oyun/core/pure';
import { PALETTE } from '@okcu/textures';
import { DEV_CALM, DEV_FX_OFF } from '../dev';
import { css, Gfx, rgba } from './gfx';

export const W = 720;
export const H = 1280;
/** Height of the main menu's bottom tab bar (shell.ts) above the safe bottom edge; the title's PLAY sits on it. */
export const TAB_BAR_H = 150;
/** The core theme's font (bundled by @oyun/core), with rounded system fallbacks. */
export const FONT = `${DEFAULT_THEME.fontFamily.replace(', system-ui, sans-serif', '')}, ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;

/** The 2D game's theme overrides (games/okcu/src/main.ts) on top of the core theme. */
export const THEME = {
  primary: 0xffc93c,
  primaryText: PALETTE.ink,
  secondary: 0x6b4ca8,
  secondaryText: 0xffffff,
  surface: 0x2b3160,
  accent: 0x7cf29c,
  shadow: PALETTE.ink,
  textDim: DEFAULT_THEME.colors.textDim,
  radius: 30,
} as const;

export const EASE = {
  backOut: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  cubicIn: 'cubic-bezier(0.32, 0, 0.67, 0)',
  cubicOut: 'cubic-bezier(0.33, 1, 0.68, 1)',
  quadOut: 'cubic-bezier(0.5, 1, 0.89, 1)',
  sine: 'cubic-bezier(0.37, 0, 0.63, 1)',
  elasticOut: 'cubic-bezier(0.2, 2.4, 0.4, 0.8)',
} as const;

const STYLE = `
.ok-gfx{position:absolute;inset:0;width:100%;height:100%;display:block}
.ok-layer{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;font-family:${FONT};font-weight:800;color:#fff;line-height:1.2;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
.ok-layer *{box-sizing:border-box}
.ok-group{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
.ok-anchor{position:absolute;width:0;height:0}
.ok-anchor>canvas{position:absolute;display:block}
.ok-scrim{position:absolute;left:-2000px;top:-2000px;width:${W + 4000}px;height:${H + 4000}px;background:${rgba(PALETTE.ink, 0.62)};pointer-events:auto}
.ok-btn{position:absolute;pointer-events:auto;cursor:pointer;touch-action:none;display:flex;align-items:center;justify-content:center;text-align:center;white-space:nowrap;transition:transform .09s ease-out,opacity .15s}
.ok-btn::after{content:'';position:absolute;left:10px;right:10px;top:8px;height:34%;background:rgba(255,255,255,.18);border-radius:18px;pointer-events:none}
.ok-btn.down{transform:scale(.94)}
.ok-btn.off{opacity:.45;cursor:default}
.ok-ad{position:absolute;top:-16px;right:12px;height:36px;padding:0 14px 0 13px;border-radius:18px;background:${css(THEME.accent)};border:3px solid ${css(THEME.shadow)};color:${css(THEME.shadow)};font-size:22px;line-height:1;display:flex;align-items:center;gap:6px;pointer-events:none;z-index:1}
.ok-ad::before{content:'';width:0;height:0;border-left:12px solid ${css(THEME.shadow)};border-top:7px solid transparent;border-bottom:7px solid transparent}
.ok-round{position:absolute;pointer-events:auto;cursor:pointer;touch-action:none;border-radius:50%;transition:transform .09s ease-out}
.ok-round.down{transform:scale(.9)}
.ok-round>canvas{position:absolute;inset:0;width:100%;height:100%}
.ok-card{position:absolute;left:50px;width:620px;border-radius:26px;pointer-events:auto;cursor:pointer;touch-action:none;box-shadow:0 0 0 6px ${css(PALETTE.ink)},0 8px 0 6px ${css(PALETTE.ink)}}
.ok-card-in{position:absolute;inset:8px;border-radius:20px;background:${css(PALETTE.card)}}
.ok-card-dot{position:absolute;border-radius:50%;background:${css(PALETTE.cardIcon)}}
.ok-card-icon{position:absolute;width:150px;height:150px;pointer-events:none}
.ok-card-text{position:absolute;left:190px;width:410px;top:50%;transform-origin:0 50%;text-align:left;pointer-events:none}
.ok-card-name{font-size:44px;line-height:54px;color:${css(PALETTE.ink)};white-space:nowrap}
.ok-card-desc{font-size:32px;line-height:39px;margin-top:8px;color:${css(PALETTE.inkSoft)};width:400px}
.ok-card-syn{color:#b06a00}
.ok-card-stack{position:absolute;right:8px;top:2px;width:72px;height:72px;border-radius:50%;background:${css(PALETTE.danger)};border:5px solid ${css(PALETTE.ink)};font-size:34px;display:flex;align-items:center;justify-content:center;pointer-events:none}
.ok-panel{position:absolute;border-radius:${THEME.radius}px;background:linear-gradient(180deg,#39407f 0%,${css(THEME.surface)} 42%,#232853 100%);box-shadow:0 12px 0 ${rgba(THEME.shadow, 0.5)},inset 0 0 0 5px rgba(255,255,255,.09),inset 0 7px 0 rgba(255,255,255,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:26px 30px;text-align:center}
.ok-panel .cap{font-size:48px;color:${css(THEME.textDim)}}
.ok-panel .score{font-size:150px;line-height:1.05;color:${css(THEME.primary)};-webkit-text-stroke:16px ${css(THEME.shadow)};paint-order:stroke fill;text-shadow:0 9px 0 ${rgba(THEME.shadow, 0.55)}}
.ok-panel .best{font-size:40px}
.ok-panel .line{font-size:34px;color:${css(THEME.textDim)}}
.ok-panel .line.gold{color:${css(PALETTE.coin)}}
.ok-panel .badge{font-size:34px;height:56px;line-height:56px;padding:0 24px;border-radius:28px;background:${css(THEME.accent)};color:${css(THEME.primaryText)}}
`;

let styled = false;
export function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

// ---------------------------------------------------------------------------- stroked labels

export interface LabelOpts {
  size?: number;
  color?: number;
  /** outline thickness in logical px (Phaser's stroke thickness), ink unless strokeColor */
  stroke?: number;
  strokeColor?: number;
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  originX?: number;
  originY?: number;
  /** a solid drop of the whole text this far below (the title logo) */
  shadowY?: number;
  shadowColor?: number;
}

const live = new Set<Label>();
let res = 2;
const measurer = document.createElement('canvas').getContext('2d')!;

/** Backing-store pixels per logical px for every label (device pixel ratio × stage scale). */
export function setLabelRes(next: number): void {
  const r = Math.max(1, Math.min(4, Math.ceil(next * 4) / 4));
  if (r === res) return;
  res = r;
  for (const l of live) l.render();
}

/** The current backing-store resolution (for canvases that live in the logical layer). */
export function labelRes(): number {
  return res;
}

export function rerenderLabels(): void {
  for (const l of live) l.render(true);
}

function fontOf(size: number): string {
  return `800 ${size}px ${FONT}`;
}

export function textWidth(text: string, size: number): number {
  measurer.font = fontOf(size);
  return measurer.measureText(text).width;
}

function wrapLines(text: string, size: number, wrap: number | undefined): string[] {
  const out: string[] = [];
  measurer.font = fontOf(size);
  for (const para of text.split('\n')) {
    if (!wrap) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measurer.measureText(next).width > wrap) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Themed text with an outline, centred on its anchor by default (the 2D game's `label().setStroke()`). */
export class Label {
  /** zero-size anchor at the label's position: transforms on it pivot around the origin point */
  readonly el: HTMLDivElement;
  private readonly cv: HTMLCanvasElement;
  private readonly o: Required<Omit<LabelOpts, 'wrap'>> & { wrap: number | undefined };
  text = '';
  width = 0;
  height = 0;
  private drawn = '';
  private drawnRes = 0;
  private shown = true;
  private tf = '';

  constructor(parent: HTMLElement, x: number, y: number, text: string, opts: LabelOpts = {}) {
    this.o = {
      size: opts.size ?? 40,
      color: opts.color ?? PALETTE.white,
      stroke: opts.stroke ?? 0,
      strokeColor: opts.strokeColor ?? PALETTE.ink,
      wrap: opts.wrap,
      align: opts.align ?? 'center',
      originX: opts.originX ?? 0.5,
      originY: opts.originY ?? 0.5,
      shadowY: opts.shadowY ?? 0,
      shadowColor: opts.shadowColor ?? PALETTE.inkSoft,
    };
    this.el = el('div', 'ok-anchor', parent);
    this.cv = el('canvas', '', this.el);
    this.setPos(x, y);
    live.add(this);
    this.setText(text);
  }

  setPos(x: number, y: number): this {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    return this;
  }

  setText(text: string): this {
    if (text === this.text && this.drawn === text) return this;
    this.text = text;
    this.render();
    return this;
  }

  setVisible(v: boolean): this {
    if (v !== this.shown) {
      this.shown = v;
      this.el.style.display = v ? '' : 'none';
    }
    return this;
  }

  /** scale (and optional rotation in degrees) around the origin point; cached so idle frames cost nothing */
  setScale(s: number, deg = 0): this {
    const tf = s === 1 && deg === 0 ? '' : `scale(${s.toFixed(3)})${deg ? ` rotate(${deg.toFixed(2)}deg)` : ''}`;
    if (tf !== this.tf) {
      this.tf = tf;
      this.el.style.transform = tf;
    }
    return this;
  }

  render(force = false): void {
    const o = this.o;
    if (!force && this.drawn === this.text && this.drawnRes === res && this.text !== '') return;
    this.drawn = this.text;
    this.drawnRes = res;
    const cv = this.cv;
    if (this.text === '') {
      cv.style.display = 'none';
      this.width = this.height = 0;
      return;
    }
    cv.style.display = 'block';
    const lines = wrapLines(this.text, o.size, o.wrap);
    measurer.font = fontOf(o.size);
    const m = measurer.measureText('Mg');
    const asc = m.fontBoundingBoxAscent || o.size;
    const desc = m.fontBoundingBoxDescent || o.size * 0.36;
    const lh = asc + desc;
    const widths = lines.map((l) => measurer.measureText(l).width);
    const tw = Math.max(1, ...widths);
    const pad = o.stroke / 2 + 2;
    const w = tw + pad * 2;
    const h = lines.length * lh + pad * 2;
    this.width = w;
    this.height = h;
    cv.width = Math.ceil(w * res);
    cv.height = Math.ceil((h + o.shadowY) * res);
    cv.style.width = `${cv.width / res}px`;
    cv.style.height = `${cv.height / res}px`;
    cv.style.left = `${-w * o.originX}px`;
    cv.style.top = `${-h * o.originY}px`;
    const c = cv.getContext('2d')!;
    c.setTransform(res, 0, 0, res, 0, 0);
    c.font = fontOf(o.size);
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const pass = (dy: number, stroke: string | null, fill: string | null): void => {
      lines.forEach((line, i) => {
        const lw = widths[i] ?? 0;
        const x = pad + (o.align === 'left' ? 0 : o.align === 'right' ? tw - lw : (tw - lw) / 2);
        const y = pad + i * lh + asc + dy;
        if (stroke && o.stroke > 0) {
          c.strokeStyle = stroke;
          c.lineWidth = o.stroke;
          c.strokeText(line, x, y);
        }
        if (fill) {
          c.fillStyle = fill;
          c.fillText(line, x, y);
        }
      });
    };
    if (o.shadowY > 0) pass(o.shadowY, css(o.shadowColor), css(o.shadowColor));
    pass(0, css(o.strokeColor), null);
    pass(0, null, css(o.color));
  }

  destroy(): void {
    live.delete(this);
    this.el.remove();
  }
}

// ---------------------------------------------------------------------------- buttons

export interface ButtonHandle {
  el: HTMLElement;
  setEnabled(on: boolean): void;
  /** a new label, fitted to the face like the first one */
  setText(text: string): void;
  fire(): void;
}

export function pressable(e: HTMLElement, enabled: () => boolean, onDown: () => void, fire: () => void): void {
  e.dataset.ui = '1';
  let down = false;
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    if (!enabled()) return;
    down = true;
    e.classList.add('down');
    onDown();
  });
  const cancel = (): void => {
    down = false;
    e.classList.remove('down');
  };
  e.addEventListener('pointerleave', cancel);
  e.addEventListener('pointercancel', cancel);
  e.addEventListener('pointerup', (ev) => {
    ev.stopPropagation();
    if (!down) return;
    cancel();
    fire();
  });
}

export interface ButtonOpts {
  width?: number;
  height?: number;
  variant?: 'primary' | 'secondary';
  fontSize?: number;
  /**
   * Rewarded-ad button: this text (core.ad, "AD" / "REKLAM") in a "▶ AD" pill on the top-right
   * corner, like core's Phaser button `{ ad: true }`, so the player knows an ad plays.
   */
  ad?: string;
}

/** The core's rounded button: drop shadow, top highlight, press squash, release pop. Centred on (x, y). */
export function button(parent: HTMLElement, x: number, y: number, text: string, onDown: () => void, onTap: () => void, opts: ButtonOpts = {}): ButtonHandle {
  const w = opts.width ?? 380;
  const h = Math.max(opts.height ?? 112, 88);
  const primary = (opts.variant ?? 'primary') === 'primary';
  const size = opts.fontSize ?? 44;
  const e = el('div', 'ok-btn', parent);
  const r = Math.min(THEME.radius, h / 2);
  e.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:${r}px;background:${css(primary ? THEME.primary : THEME.secondary)};color:${css(primary ? THEME.primaryText : THEME.secondaryText)};box-shadow:0 8px 0 ${rgba(THEME.shadow, 0.55)};padding-bottom:4px`;
  const label = el('span', '', e);
  if (opts.ad) {
    const tag = el('div', 'ok-ad', e);
    tag.textContent = opts.ad;
  }
  const setText = (s: string): void => {
    const fit = Math.min(1, (w - 30) / Math.max(1, textWidth(s, size)));
    e.style.fontSize = `${size * fit}px`;
    label.textContent = s;
  };
  setText(text);
  let enabled = true;
  const fire = (): void => {
    if (!enabled) return;
    e.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 180, easing: EASE.backOut });
    onTap();
  };
  pressable(e, () => enabled, onDown, fire);
  return {
    el: e,
    setEnabled(on) {
      enabled = on;
      e.classList.toggle('off', !on);
    },
    setText,
    fire,
  };
}

export type RoundIcon = 'sound-on' | 'sound-off' | 'pause' | 'home' | 'replay' | 'camera';

/** The core's round icon button (visual 96 px). Returns a setter for its glyph. */
export function roundButton(parent: HTMLElement, x: number, y: number, size: number, icon: RoundIcon, onDown: () => void, onTap: () => void): { el: HTMLElement; setIcon(icon: RoundIcon): void } {
  const e = el('div', 'ok-round', parent);
  e.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;background:${css(THEME.secondary)};box-shadow:0 6px 0 ${rgba(THEME.shadow, 0.55)}`;
  const cv = el('canvas', '', e);
  const px = 3;
  cv.width = cv.height = size * px;
  const g = new Gfx(cv.getContext('2d')!);
  const draw = (name: RoundIcon): void => {
    const c = g.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(px, 0, 0, px, (size * px) / 2, (size * px) / 2);
    // the core's speaker glyph (packages/core/src/ui/widgets.ts drawIcon)
    const s = size * 0.6;
    const u = s / 2;
    g.fillStyle(THEME.secondaryText, 1).lineStyle(s * 0.12, THEME.secondaryText, 1);
    // the core's other glyphs (pause, home, replay)
    if (name === 'pause') {
      g.fillRoundedRect(-u * 0.5, -u * 0.55, u * 0.32, u * 1.1, 4).fillRoundedRect(u * 0.18, -u * 0.55, u * 0.32, u * 1.1, 4);
      return;
    }
    if (name === 'home') {
      g.fillTriangle(-u * 0.6, -u * 0.02, u * 0.6, -u * 0.02, 0, -u * 0.6);
      g.fillRect(-u * 0.42, -u * 0.05, u * 0.84, u * 0.6);
      return;
    }
    if (name === 'replay') {
      g.beginPath().arc(0, 0, u * 0.45, -2.6, 2.2).strokePath();
      g.fillTriangle(-u * 0.62, -u * 0.5, -u * 0.12, -u * 0.42, -u * 0.5, -u * 0.05);
      return;
    }
    // a film camera (the play HUD's camera-angle button): body, lens hood, two reels
    if (name === 'camera') {
      g.fillRoundedRect(-u * 0.66, -u * 0.2, u * 0.9, u * 0.66, 5);
      g.fillTriangle(u * 0.2, u * 0.13, u * 0.68, -u * 0.2, u * 0.68, u * 0.46);
      g.fillCircle(-u * 0.44, -u * 0.38, u * 0.2).fillCircle(u * 0.0, -u * 0.42, u * 0.24);
      return;
    }
    g.fillRect(-u * 0.6, -u * 0.22, u * 0.3, u * 0.44);
    g.fillTriangle(-u * 0.32, -u * 0.22, -u * 0.32, u * 0.22, u * 0.05, -u * 0.55);
    g.fillTriangle(-u * 0.32, u * 0.22, u * 0.05, u * 0.55, u * 0.05, -u * 0.55);
    if (name === 'sound-on') {
      g.beginPath().arc(u * 0.1, 0, u * 0.32, -0.9, 0.9).strokePath();
      g.beginPath().arc(u * 0.1, 0, u * 0.55, -0.9, 0.9).strokePath();
    } else {
      g.lineBetween(u * 0.2, -u * 0.25, u * 0.65, u * 0.25).lineBetween(u * 0.2, u * 0.25, u * 0.65, -u * 0.25);
    }
  };
  draw(icon);
  pressable(
    e,
    () => true,
    onDown,
    () => {
      e.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 180, easing: EASE.backOut });
      onTap();
    },
  );
  return { el: e, setIcon: draw };
}

// ---------------------------------------------------------------------------- canvases

/**
 * A canvas over a rectangle of the logical layer, drawn in logical px (the game's own drawing
 * functions run on it through Gfx). `begin()` clears it and follows the label resolution.
 */
export class Sketch {
  readonly cv: HTMLCanvasElement;
  readonly g: Gfx;
  private r = 0;

  constructor(
    parent: HTMLElement,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    cls = '',
  ) {
    this.cv = el('canvas', cls, parent);
    this.cv.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none`;
    this.g = new Gfx(this.cv.getContext('2d')!);
  }

  begin(): Gfx {
    const r = Math.min(3, res);
    const c = this.g.ctx;
    if (r !== this.r) {
      this.r = r;
      this.cv.width = Math.max(1, Math.ceil(this.w * r));
      this.cv.height = Math.max(1, Math.ceil(this.h * r));
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.setTransform(r, 0, 0, r, -this.x * r, -this.y * r);
    return this.g;
  }
}

// ---------------------------------------------------------------------------- timers

/** Delayed calls on real time (the 2D game's `time.delayedCall`), dropped when the run is replaced. */
export class Timers {
  private list: { at: number; fn: () => void }[] = [];
  private now = 0;

  after(seconds: number, fn: () => void): void {
    this.list.push({ at: this.now + seconds, fn });
  }

  update(real: number): void {
    this.now += real;
    if (this.list.length === 0) return;
    const due = this.list.filter((t) => t.at <= this.now);
    if (due.length === 0) return;
    this.list = this.list.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }

  clear(): void {
    this.list = [];
  }
}

// ---------------------------------------------------------------------------- small shared helpers

/** A crisp canvas of w × h logical px; `draw` gets a Gfx in those px. */
export function iconCanvas(parent: HTMLElement, w: number, h: number, draw: (g: Gfx) => void, cls = ''): HTMLCanvasElement {
  const cv = el('canvas', cls, parent);
  const r = Math.min(3, Math.max(1, labelRes()));
  cv.width = Math.ceil(w * r);
  cv.height = Math.ceil(h * r);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  cv.style.flex = 'none';
  const g = new Gfx(cv.getContext('2d')!);
  g.ctx.setTransform(r, 0, 0, r, 0, 0);
  draw(g);
  return cv;
}

/** Fit a DOM text to `max` px by shrinking its font from `size`. */
export function fitText(e: HTMLElement, text: string, size: number, max: number): void {
  e.textContent = text;
  e.style.fontSize = `${(size * Math.min(1, max / Math.max(1, textWidth(text, size)))).toFixed(1)}px`;
}

/** Two 0xRRGGBB colours blended, k = 0 … 1. */
export function mix(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/**
 * Reduced motion for the menus: the system's prefers-reduced-motion (web builds: also ?calm=1, the
 * stage's switch, or ?fx=0). Loops (pulses, glows, wobbles) stay still and tab switches cut instead of sliding.
 */
export function calmMotion(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || DEV_CALM || DEV_FX_OFF;
}
