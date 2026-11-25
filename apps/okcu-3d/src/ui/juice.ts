/**
 * Small motion pieces the menus share: numbers that count, sparkles and a ring thrown out of a
 * point, a sunburst that turns behind something, a shine that sweeps across a card, things that
 * fly to a counter (coins, power bolts), bars that grow, and a tag that pops beside a number.
 *
 * Everything is DOM in the HUD's logical 720 × 1280 layer and moves with `transform` / `opacity`
 * only (no layout work per frame). Every piece removes itself when it ends, and every piece does
 * nothing (numbers are simply set) under reduced motion (`calmMotion`: prefers-reduced-motion,
 * ?calm=1, ?fx=0).
 */
import { PALETTE } from '@okcu/textures';
import { calmMotion, EASE, el, mix } from './dom';
import { css, rgba } from './gfx';

const INK = PALETTE.ink;
/** a four-point star */
const STAR = 'polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%)';
/** a lightning bolt (the POWER glyph) */
const BOLT = 'polygon(62% 0,12% 56%,44% 56%,30% 100%,88% 38%,56% 38%)';

/** The centre of `e` in the logical px of `host` (a 720-wide group of the HUD layer). */
export function centreIn(e: Element, host: HTMLElement): { x: number; y: number } {
  const r = e.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const k = h.width / 720 || 1;
  return { x: (r.left + r.width / 2 - h.left) / k, y: (r.top + r.height / 2 - h.top) / k };
}

/** The box of `e` in the logical px of `host`. */
export function rectIn(e: Element, host: HTMLElement): { x: number; y: number; w: number; h: number } {
  const r = e.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const k = h.width / 720 || 1;
  return { x: (r.left - h.left) / k, y: (r.top - h.top) / k, w: r.width / k, h: r.height / k };
}

/** `e`'s text counts from `from` to `to` (eased out); returns a cancel. Reduced motion: set at once. */
export function countTo(e: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string = (n) => String(Math.round(n))): () => void {
  if (calmMotion() || from === to || ms <= 0) {
    e.textContent = fmt(to);
    return () => undefined;
  }
  let raf = 0;
  const t0 = performance.now();
  const step = (): void => {
    const u = Math.min(1, (performance.now() - t0) / ms);
    e.textContent = fmt(from + (to - from) * (1 - (1 - u) ** 3));
    if (u < 1) raf = window.requestAnimationFrame(step);
  };
  step();
  return () => window.cancelAnimationFrame(raf);
}

/** A quick squash-and-pop (a number that just changed, a card that just got something). */
export function pop(e: HTMLElement, k = 1.18, ms = 420): void {
  if (calmMotion()) return;
  e.animate([{ transform: 'scale(1)' }, { transform: `scale(${k}, ${2 - k})`, offset: 0.28 }, { transform: `scale(${1 - (k - 1) * 0.35}, ${1 + (k - 1) * 0.35})`, offset: 0.6 }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' });
}

export interface SparkleOpts {
  /** stars thrown (default 10) */
  n?: number;
  /** how far they fly, px (default 110) */
  reach?: number;
  colors?: readonly number[];
  /** a ring bursting out to this radius, px (0: none; default 90) */
  ring?: number;
  delay?: number;
}

/** Stars thrown out of (x, y) and a ring bursting behind them. */
export function sparkle(host: HTMLElement, x: number, y: number, o: SparkleOpts = {}): void {
  if (calmMotion()) return;
  const n = o.n ?? 10;
  const reach = o.reach ?? 110;
  const colors = o.colors ?? [PALETTE.gold, PALETTE.white, PALETTE.heal];
  const delay = o.delay ?? 0;
  const ring = o.ring ?? 90;
  if (ring > 0) {
    const r = el('div', '', host);
    r.style.cssText = `position:absolute;left:${x - ring}px;top:${y - ring}px;width:${ring * 2}px;height:${ring * 2}px;border-radius:50%;border:8px solid ${css(colors[0]!)};pointer-events:none;will-change:transform,opacity`;
    r.animate([{ transform: 'scale(0.2)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0 }], { delay, duration: 480, easing: EASE.cubicOut, fill: 'both' }).onfinish = () => r.remove();
  }
  for (let i = 0; i < n; i++) {
    const s = el('div', '', host);
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
    const d = reach * (0.6 + ((i * 7) % 5) * 0.1);
    const size = 22 + (i % 3) * 8;
    s.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;background:${css(colors[i % colors.length]!)};clip-path:${STAR};pointer-events:none;will-change:transform,opacity`;
    s.animate(
      [
        { transform: 'translate(0,0) scale(0.3) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d * 0.8}px,${Math.sin(a) * d * 0.8}px) scale(1.15) rotate(90deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 18}px) scale(0) rotate(160deg)`, opacity: 0 },
      ],
      { delay: delay + (i % 4) * 18, duration: 620, easing: EASE.cubicOut, fill: 'both' },
    ).onfinish = () => s.remove();
  }
}

/**
 * A sunburst centred on (x, y): it swells in, turns slowly and fades. `parent` should be the box
 * the lit thing sits in; put the burst before that thing so it draws behind it.
 */
export function sunburst(parent: HTMLElement, x: number, y: number, size: number, color: number, ms = 1300, before: Node | null = null): void {
  if (calmMotion()) return;
  const r = document.createElement('div');
  const mask = 'radial-gradient(circle,#000 16%,transparent 68%)';
  r.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;pointer-events:none;will-change:transform,opacity;background:repeating-conic-gradient(from 0deg,${rgba(mix(color, 0xffffff, 0.35), 0.7)} 0deg 9deg,transparent 9deg 22.5deg);-webkit-mask-image:${mask};mask-image:${mask}`;
  parent.insertBefore(r, before);
  r.animate(
    [
      { transform: 'scale(0.2) rotate(0deg)', opacity: 0 },
      { transform: 'scale(1) rotate(25deg)', opacity: 1, offset: 0.22 },
      { transform: 'scale(1.05) rotate(70deg)', opacity: 0.85, offset: 0.7 },
      { transform: 'scale(1.15) rotate(100deg)', opacity: 0 },
    ],
    { duration: ms, easing: 'linear', fill: 'both' },
  ).onfinish = () => r.remove();
}

/** A band of light sweeping once across `e` (clipped to its rounded box). */
export function shine(e: HTMLElement, delay = 0, ms = 620): void {
  if (calmMotion()) return;
  const clip = el('div', '', e);
  clip.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none';
  const band = el('div', '', clip);
  band.style.cssText = 'position:absolute;top:-20%;bottom:-20%;left:0;width:34%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));will-change:transform';
  band.animate([{ transform: 'translateX(-130%) skewX(-18deg)' }, { transform: 'translateX(420%) skewX(-18deg)' }], { delay, duration: ms, easing: EASE.sine, fill: 'both' }).onfinish = () => clip.remove();
}

/** The same band of light, crossing `e` again every `period` ms for as long as `e` lives. */
export function shineLoop(e: HTMLElement, period = 3200, delay = 900): void {
  if (calmMotion()) return;
  const clip = el('div', '', e);
  clip.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none';
  const band = el('div', '', clip);
  band.style.cssText = 'position:absolute;top:-20%;bottom:-20%;left:0;width:90px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.6),rgba(255,255,255,0));will-change:transform';
  const far = `translateX(${Math.round(e.offsetWidth + 140)}px) skewX(-18deg)`;
  band.animate([{ transform: 'translateX(-140px) skewX(-18deg)' }, { transform: far, offset: 0.24 }, { transform: far }], { delay, duration: period, iterations: Infinity, easing: EASE.sine, fill: 'backwards' });
}

/** A chest (or any prize) that knocks now and then: it rocks, hops and settles, every `period` ms. */
export function knock(e: HTMLElement, period = 2800, delay = 700): void {
  if (calmMotion()) return;
  e.style.transformOrigin = '50% 80%';
  e.animate(
    [
      { transform: 'none', offset: 0 },
      { transform: 'rotate(-9deg) scale(1.08)', offset: 0.05 },
      { transform: 'rotate(8deg) scale(1.08)', offset: 0.1 },
      { transform: 'rotate(-5deg) scale(1.1)', offset: 0.15 },
      { transform: 'translateY(-6px) scale(1.04, 0.96)', offset: 0.21 },
      { transform: 'scale(1.06, 0.94)', offset: 0.27 },
      { transform: 'none', offset: 0.33 },
      { transform: 'none', offset: 1 },
    ],
    { delay, duration: period, iterations: Infinity, easing: 'ease-in-out' },
  );
}

/** Children of a row appear one after another (a streak's pips, a line of chips): each pops in. */
export function popIn(items: readonly HTMLElement[], delay = 0, gap = 70): void {
  if (calmMotion()) return;
  items.forEach((e, i) => e.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.65 }, { transform: 'scale(1)', opacity: 1 }], { delay: delay + i * gap, duration: 320, easing: 'ease-out', fill: 'backwards' }));
}

/** Paper confetti thrown up from (x, y) across `spread` px, fluttering down and out. */
export function confetti(host: HTMLElement, x: number, y: number, spread: number, n = 26): void {
  if (calmMotion()) return;
  const colors = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf, PALETTE.white];
  for (let i = 0; i < n; i++) {
    const s = el('div', '', host);
    const w = 12 + (i % 3) * 5;
    s.style.cssText = `position:absolute;left:${x - w / 2}px;top:${y - 5}px;width:${w}px;height:${8 + (i % 2) * 4}px;border-radius:3px;background:${css(colors[i % colors.length]!)};pointer-events:none;will-change:transform,opacity`;
    const dx = ((i + 0.5) / n - 0.5) * spread + (((i * 37) % 11) - 5) * 6;
    const up = 120 + ((i * 53) % 9) * 22;
    const turn = (i % 2 ? 1 : -1) * (300 + ((i * 17) % 7) * 60);
    s.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(0.4)', opacity: 0, easing: EASE.cubicOut },
        { transform: `translate(${dx * 0.7}px,${-up}px) rotate(${turn * 0.4}deg) scale(1)`, opacity: 1, offset: 0.3, easing: EASE.cubicIn },
        { transform: `translate(${dx}px,${up * 0.9 + 140}px) rotate(${turn}deg) scale(0.9)`, opacity: 0 },
      ],
      { delay: (i % 6) * 35, duration: 1500 + ((i * 29) % 5) * 120, fill: 'both' },
    ).onfinish = () => s.remove();
  }
}

export interface FlyOpts {
  /** what flies: coins (round, gold), power bolts or shards of light (stars) */
  kind: 'coin' | 'bolt' | 'star';
  n?: number;
  size?: number;
  /** ms between two launches (default 45) */
  gap?: number;
  /** ms one flight takes (default 520) */
  ms?: number;
  color?: number;
  /** each landing; `last` on the final one */
  onLand?: (i: number, last: boolean) => void;
}

/**
 * Things fly from (x0, y0) to (x1, y1) in `host`'s logical px: they pop out sideways first, then
 * curve in and shrink into the target. Reduced motion: nothing flies, `onLand` is called once (last).
 */
export function flyTo(host: HTMLElement, x0: number, y0: number, x1: number, y1: number, o: FlyOpts): void {
  const n = o.n ?? 6;
  if (calmMotion() || n <= 0) {
    o.onLand?.(Math.max(0, n - 1), true);
    return;
  }
  const size = o.size ?? (o.kind === 'coin' ? 34 : 30);
  const gap = o.gap ?? 45;
  const ms = o.ms ?? 520;
  const color = o.color ?? (o.kind === 'coin' ? PALETTE.coin : PALETTE.gold);
  for (let i = 0; i < n; i++) {
    const s = el('div', '', host);
    const look =
      o.kind === 'coin'
        ? `border-radius:50%;background:radial-gradient(circle at 36% 30%,${css(mix(color, 0xffffff, 0.6))},${css(color)} 55%,${css(mix(color, 0x8a4a00, 0.45))});box-shadow:0 0 0 3px ${css(INK)}`
        : `background:${css(color)};clip-path:${o.kind === 'bolt' ? BOLT : STAR}`;
    s.style.cssText = `position:absolute;left:${x0 - size / 2}px;top:${y0 - size / 2}px;width:${size}px;height:${size}px;pointer-events:none;will-change:transform,opacity;${look}`;
    // out sideways (a fan), then in along a curve
    const a = (i / Math.max(1, n - 1) - 0.5) * 2.2 + (i % 2 ? 0.25 : -0.25);
    const ox = Math.sin(a) * 70;
    const oy = -Math.abs(Math.cos(a)) * 46 - 10;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const an = s.animate(
      [
        { transform: 'translate(0,0) scale(0.3)', opacity: 0, easing: EASE.cubicOut },
        { transform: `translate(${ox}px,${oy}px) scale(1.1)`, opacity: 1, offset: 0.28, easing: EASE.cubicIn },
        { transform: `translate(${dx}px,${dy}px) scale(0.55)`, opacity: 1 },
      ],
      { delay: i * gap, duration: ms, fill: 'both' },
    );
    const last = i === n - 1;
    an.onfinish = () => {
      s.remove();
      o.onLand?.(i, last);
    };
  }
}

/** A bar's fill grows from `from` (0 … 1 of its final length) to its full length, from the left. */
export function growBar(fill: HTMLElement, from: number, delay = 0, ms = 520): void {
  if (calmMotion()) return;
  fill.style.transformOrigin = '0 50%';
  fill.animate([{ transform: `scaleX(${Math.max(0.02, Math.min(1, from)).toFixed(3)})` }, { transform: 'scaleX(1)' }], { delay, duration: ms, easing: EASE.backOut, fill: 'backwards' });
}

/**
 * A small pill that pops at (x, y) (its centre), holds and drifts away: "+18" beside POWER, "−500"
 * under the coins. `bolt` puts the power glyph in front of the text.
 */
export function tag(host: HTMLElement, x: number, y: number, text: string, o: { color: number; ink?: number; size?: number; bolt?: boolean; rise?: number; hold?: number }): void {
  if (calmMotion()) return;
  const size = o.size ?? 30;
  const a = el('div', '', host);
  a.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;will-change:transform,opacity`;
  const p = el('div', '', a);
  p.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);height:${size + 16}px;padding:0 ${Math.round(size * 0.5)}px;border-radius:${(size + 16) / 2}px;background:${css(o.color)};border:4px solid ${css(INK)};color:${css(o.ink ?? INK)};font-size:${size}px;line-height:${size + 8}px;white-space:nowrap;display:flex;align-items:center;gap:5px;box-shadow:0 5px 0 ${rgba(INK, 0.45)}`;
  if (o.bolt) {
    const b = el('i', '', p);
    b.style.cssText = `width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.9)}px;flex:none;background:${css(o.ink ?? INK)};clip-path:${BOLT}`;
  }
  el('span', '', p).textContent = text;
  const rise = o.rise ?? -34;
  const hold = o.hold ?? 1300;
  a.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
  a.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${rise}px)`, opacity: 0 }], { delay: hold, duration: 380, easing: EASE.cubicIn, fill: 'forwards' }).onfinish = () => a.remove();
}
