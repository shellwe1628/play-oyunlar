import { button, label, OyunScene, progressBar, toast, type Button } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { shade } from '../art/fossils';
import { twistKey } from '../art/mapTextures';
import { Helper } from '../fx/Helper';
import { mapBands, travelDir, type MapBand } from '../fx/model';
import { Motes, type MotesOptions } from '../fx/Motion';
import { cover } from '../fx/Travel';
import { backgroundAware, session, type Session } from '../session';
import { SFX } from '../sfx';
import { at, LAYERS, TIERS } from '../sim/data';
import type { DigSim } from '../sim/dig';
import { fossilKey, PALETTE } from '../textures';
import { SCENES } from './keys';
import { big, fitText, fossilName, mult, oddsText, outlined } from './ui';

/** World y of the ground line, height of one stratum band, where the shaft runs. */
const SURFACE = 330;
const BAND_H = 236;
const SHAFT_X = 62;
/** The gallery carved into an open band (texts and ambient life live in it). */
const GAL_X = 108;
const GAL_PAD = 14;
/** A press that moves further than this is a scroll, not a tap. */
const TAP_SLOP = 16;

/** Small deterministic random (the map looks the same every visit). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ambient life of each layer in miniature: what drifts in its gallery, and what stands at its back. */
const LIFE: readonly { motes: Pick<MotesOptions, 'colors' | 'texture' | 'scale' | 'rise' | 'alpha' | 'count' | 'additive'>; decor?: { tex: string; tint: number; scale: number; alpha: number; flip?: boolean } }[] = [
  { motes: { colors: [0xd8c890, 0xb89a60], rise: -7, count: 7, scale: [0.2, 0.45], alpha: 0.6 } }, // spores
  { motes: { colors: [0xffffff, 0xdff6ff], rise: 16, count: 9, scale: [0.18, 0.4], alpha: 0.85 }, decor: { tex: 'crystal', tint: 0xdff6ff, scale: 1.5, alpha: 0.5, flip: true } }, // snow, icicles
  { motes: { colors: [0xff9a40, 0xffd060], rise: -20, count: 8, scale: [0.18, 0.38], alpha: 0.9, additive: true }, decor: { tex: 'fern', tint: 0x2a4a22, scale: 0.62, alpha: 0.75 } }, // embers, ferns
  { motes: { colors: [0xffffff], texture: 'bubble', rise: -24, count: 7, scale: [0.4, 0.8], alpha: 0.6 }, decor: { tex: 'leviathan', tint: 0x16303e, scale: 0.42, alpha: 0.7 } }, // bubbles
  { motes: { colors: [0xd8ff9a, 0xfff0a0], texture: 'spark', rise: -4, count: 7, scale: [0.3, 0.55], alpha: 0.9, additive: true }, decor: { tex: 'fern', tint: 0x0e1a10, scale: 0.7, alpha: 0.8 } }, // fireflies
  { motes: { colors: [0xffb030, 0xffd060], rise: 9, count: 7, scale: [0.25, 0.5], alpha: 0.85, additive: true } }, // amber drops
  { motes: { colors: [0xffe0f0, 0xffffff], texture: 'spark', rise: -3, count: 7, scale: [0.3, 0.6], alpha: 0.8 }, decor: { tex: 'crystal', tint: 0xffd0e0, scale: 1.6, alpha: 0.6, flip: true } }, // salt glints
  { motes: { colors: [0xd8b8ff, 0xffffff], texture: 'spark', rise: -3, count: 8, scale: [0.3, 0.6], alpha: 0.9, additive: true }, decor: { tex: 'crystal', tint: 0xb07aff, scale: 1.9, alpha: 0.7 } }, // geode
  { motes: { colors: [0xff7a30, 0xffd060], rise: -30, count: 10, scale: [0.18, 0.36], alpha: 0.95, additive: true } }, // embers
  { motes: { colors: [0xbff6f0], texture: 'bubble', rise: -8, count: 6, scale: [0.5, 1], alpha: 0.5 } }, // drifting discs
  { motes: { colors: [0x9ab0d0, 0x6ad0ff], rise: 8, count: 10, scale: [0.15, 0.32], alpha: 0.7 } }, // marine snow
  { motes: { colors: [0xffffff, 0xffc080], texture: 'spark', rise: -2, count: 9, scale: [0.25, 0.6], alpha: 0.95, additive: true } }, // stars
  { motes: { colors: [0xe0b0ff, 0x8a6ad0], texture: 'chip', rise: -6, count: 7, scale: [0.35, 0.7], alpha: 0.7 } }, // shards
];

interface BandView {
  model: MapBand;
  /** The rock and what stands in the gallery; the texts and markers drawn over the ambient life. */
  box: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  /** Things at the back of the gallery that shift a little as the map scrolls (parallax). */
  decor: { img: Phaser.GameObjects.Image; y: number }[];
  motes: Motes | null;
  lock: Phaser.GameObjects.Image | null;
}

/**
 * The depth map: the whole dig in cross-section, from the sky and the surface down to the deepest
 * layer. Every stratum is a band in its own colours with its ambient life in miniature; open
 * ones are carved galleries (name, set progress, twist, rarest find), locked ones solid rock with
 * the dig power that opens them. The current layer is lit and the helper stands in it. Tapping
 * an open band travels there. Reads the sim through the read-only view (`mapBands`); the only
 * thing it ever asks of it is `travel`, exactly like the layer arrows. The sim does not tick here.
 * Test actions: scroll {px}, scrollTo {layer}, band {layer}, back.
 */
export class MapScene extends OyunScene {
  protected override autoPause = true;
  private ses!: Session;
  private sim!: DigSim;
  private from: 'dig' | 'menu' = 'dig';
  private world!: Phaser.GameObjects.Container;
  private sky!: Phaser.GameObjects.Container;
  private bands: BandView[] = [];
  private scroll = 0;
  private maxScroll = 0;
  private velocity = 0;
  private press: { y: number; moved: number; at: number } | null = null;
  private window = { top: 0, bottom: 0 };
  private glow: Phaser.GameObjects.Image | null = null;
  private frame: Phaser.GameObjects.Graphics | null = null;
  private helper: Helper | null = null;
  private clock = 0;
  private busy = false;
  private backButton!: Button;

  constructor() {
    super(SCENES.map);
  }

  create(data?: object): void {
    this.ses = session(this.oyun);
    this.sim = this.ses.sim;
    this.from = (data as { from?: string } | undefined)?.from === 'menu' ? 'menu' : 'dig';
    this.bands = [];
    this.velocity = 0;
    this.press = null;
    this.glow = null;
    this.frame = null;
    this.helper = null;
    this.clock = 0;
    this.busy = false;
    const L = this.layout;
    const motion = !this.oyun.reducedMotion;
    this.cameras.main.setBackgroundColor(PALETTE.dirtDark);
    this.window = { top: L.top + 118, bottom: L.bottom - 138 };

    this.sky = this.add.container(0, 0);
    this.world = this.add.container(0, 0);
    this.drawSky();
    this.drawSurface();
    const models = mapBands(this.sim);
    models.forEach((m) => this.bands.push(this.drawBand(m, SURFACE + m.layer * BAND_H)));
    // back to front: the rock of every band, the shaft through it, the drifting life, the texts
    for (const b of this.bands) this.world.add(b.box);
    this.drawShaft(models);
    for (const b of this.bands) {
      if (b.motes) this.world.add(b.motes.list as Phaser.GameObjects.Image[]);
      this.world.add(b.front);
    }
    this.drawHere(motion);
    const worldH = SURFACE + LAYERS.length * BAND_H + 150;
    // bedrock under the last layer
    const bed = this.add.graphics();
    bed.fillStyle(0x0a0604, 1).fillRect(0, SURFACE + LAYERS.length * BAND_H, L.width, 600);
    this.world.add(bed);
    this.maxScroll = Math.max(0, worldH - L.height);

    this.drawChrome();

    // open on the layer you are in
    this.scrollTo(this.sim.layer, false);
    if (motion) this.slideIn();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      this.velocity = 0;
      this.press = over.length > 0 ? null : { y: p.y, moved: 0, at: this.time.now };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.press) return;
      const dy = p.prevPosition.y - p.position.y;
      this.press.moved += Math.abs(dy);
      this.scrollBy(dy);
      this.velocity = dy * 60; // px/s at one move per frame; eased off in update
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const press = this.press;
      this.press = null;
      if (!press) return;
      if (press.moved > TAP_SLOP) return; // it was a scroll: let it glide
      this.velocity = 0;
      if (p.y < this.window.top || p.y > this.window.bottom) return;
      const layer = Math.floor((p.y + this.scroll - SURFACE) / BAND_H);
      if (layer >= 0 && layer < LAYERS.length) this.onBand(layer);
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.velocity = 0;
      this.scrollBy(dy);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ses.flush());
  }

  // ------------------------------------------------------------------ drawing

  /** Dusk over the site: it scrolls at half speed behind the ground. */
  private drawSky(): void {
    const L = this.layout;
    const g = this.add.graphics();
    const top = -L.height;
    const steps = 40;
    const h = SURFACE + 80 - top;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(t < 0.6 ? 0x141a33 : 0x3d2b52), Phaser.Display.Color.ValueToColor(t < 0.6 ? 0x3d2b52 : 0xe08a52), 100, Math.round((t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4) * 100));
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, top + (h * i) / steps, L.width, h / steps + 1);
    }
    const sunX = L.width * 0.72;
    const sunY = SURFACE - 70;
    g.fillStyle(0xffd27a, 1).fillCircle(sunX, sunY, 40);
    g.fillStyle(0xfff0b8, 0.6).fillCircle(sunX - 9, sunY - 9, 22);
    const r = seeded(7);
    for (let i = 0; i < 18; i++) g.fillStyle(0xffffff, 0.3 + r() * 0.5).fillCircle(r() * L.width, SURFACE - 290 + r() * 150, 1 + r() * 1.6);
    // far hills
    const hills: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, SURFACE + 80)];
    for (let k = 0; k <= 12; k++) hills.push(new Phaser.Math.Vector2((L.width * k) / 12, SURFACE - 24 - Math.sin(k * 0.9 + 1) * 22 - Math.sin(k * 2.1) * 8));
    hills.push(new Phaser.Math.Vector2(L.width, SURFACE + 80));
    g.fillStyle(0x3a2a4a, 0.9).fillPoints(hills, true);
    this.sky.add([this.add.image(sunX, sunY, 'glow').setTint(0xffa860).setScale(3).setAlpha(0.5), g]);
  }

  /** The ground line: grass, the head of the shaft, a signpost that carries the stratum marker. */
  private drawSurface(): void {
    const L = this.layout;
    const s = this.sim;
    const g = this.add.graphics();
    g.fillStyle(0x4a6a2a, 1).fillRect(0, SURFACE - 12, L.width, 14);
    const r = seeded(3);
    for (let x = 0; x < L.width; x += 12) g.fillStyle(r() < 0.5 ? 0x4a6a2a : 0x5f8433, 1).fillTriangle(x, SURFACE - 10, x + 5, SURFACE - 16 - r() * 16, x + 11, SURFACE - 10);
    // shaft head: two posts, a beam and a pulley
    g.fillStyle(0x5a3b24, 1).fillRect(SHAFT_X - 30, SURFACE - 76, 9, 70).fillRect(SHAFT_X + 21, SURFACE - 76, 9, 70).fillRect(SHAFT_X - 36, SURFACE - 84, 72, 10);
    g.fillStyle(0x2b2118, 1).fillCircle(SHAFT_X, SURFACE - 66, 9);
    g.lineStyle(3, 0xcdbfa8, 1).lineBetween(SHAFT_X, SURFACE - 66, SHAFT_X, SURFACE);
    this.world.add(g);
    const tag = outlined(this, L.cx + 40, SURFACE - 34, this.t('map.surface'), 30, PALETTE.sand, 6);
    this.world.add(tag);
    // depth marker: after an expedition the whole dig lies one stratum deeper
    if (s.expeditions > 0) {
      const text = this.t('map.stratum', { n: s.expeditions, k: s.expeditions + 1, m: mult(this, s.strataMult) });
      const board = this.add.container(L.cx + 40, SURFACE - 92);
      const t = label(this, 0, 0, text, { size: 26, color: PALETTE.ink });
      fitText(t, L.width - 240);
      const w = Math.min(L.width - 220, t.displayWidth + 44);
      const bg = this.add.graphics();
      bg.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-w / 2, -20, w, 48, 12);
      bg.fillStyle(PALETTE.ochreLight, 1).fillRoundedRect(-w / 2, -24, w, 48, 12);
      bg.lineStyle(3, PALETTE.ink, 0.7).strokeRoundedRect(-w / 2, -24, w, 48, 12);
      bg.fillStyle(0x5a3b24, 1).fillRect(-5, 24, 10, 36);
      board.add([bg, t]);
      this.world.add(board);
      tag.setY(SURFACE - 30).setX(L.cx + 220).setFontSize(24);
      fitText(tag, 150);
    }
  }

  /** The shaft: dug as far as the deepest open layer, with a ladder; a numbered marker per layer. */
  private drawShaft(models: readonly MapBand[]): void {
    const g = this.add.graphics();
    const deepest = models.filter((m) => m.open).length;
    const bottom = SURFACE + deepest * BAND_H - 30;
    g.fillStyle(0x0d0805, 0.92).fillRect(SHAFT_X - 20, SURFACE - 4, 40, bottom - SURFACE + 4);
    g.lineStyle(4, 0x8a5a35, 1).lineBetween(SHAFT_X - 11, SURFACE - 4, SHAFT_X - 11, bottom).lineBetween(SHAFT_X + 11, SURFACE - 4, SHAFT_X + 11, bottom);
    for (let y = SURFACE + 10; y < bottom - 6; y += 24) g.lineStyle(3, 0x8a5a35, 1).lineBetween(SHAFT_X - 11, y, SHAFT_X + 11, y);
    this.world.add(g);
  }

  private drawBand(m: MapBand, y: number): BandView {
    const L = this.layout;
    const W = L.width;
    const Ly = at(LAYERS, m.layer);
    const box = this.add.container(0, y);
    const front = this.add.container(0, y);
    const g = this.add.graphics();
    // the stratum: five seams in the layer's own colours, pebbles, a dark line where it starts
    const sh = BAND_H / 5;
    for (let k = 0; k < 5; k++) g.fillStyle(at(Ly.bands, k), 1).fillRect(0, k * sh, W, sh + 1);
    const r = seeded(100 + m.layer);
    for (let k = 0; k < 30; k++) g.fillStyle(shade(at(Ly.bands, k % 5), r() < 0.5 ? -0.28 : 0.2), 0.5).fillEllipse(r() * W, r() * BAND_H, 8 + r() * 22, 5 + r() * 9);
    for (let k = 1; k < 5; k++) g.fillStyle(0x000000, 0.13).fillRect(0, k * sh - 3, W, 3);
    const edge: Phaser.Math.Vector2[] = [];
    for (let k = 0; k <= 18; k++) edge.push(new Phaser.Math.Vector2((W * k) / 18, 5 + Math.sin(k * 1.7 + m.layer) * 4));
    for (let k = 18; k >= 0; k--) edge.push(new Phaser.Math.Vector2((W * k) / 18, -3));
    g.fillStyle(0x000000, 0.4).fillPoints(edge, true);
    box.add(g);
    const view: BandView = { model: m, box, front, decor: [], motes: null, lock: null };
    const galW = W - GAL_X - GAL_PAD;
    const galH = BAND_H - GAL_PAD * 2;

    // layer number on the shaft
    const badge = this.add.graphics();
    badge.fillStyle(PALETTE.shadow, 0.5).fillCircle(SHAFT_X, 46, 27);
    badge.fillStyle(m.current ? 0xffd23f : m.open ? PALETTE.ochre : 0x5a4a3c, 1).fillCircle(SHAFT_X, 42, 27);
    badge.lineStyle(3, PALETTE.ink, 0.7).strokeCircle(SHAFT_X, 42, 27);
    front.add([badge, label(this, SHAFT_X, 42, String(m.layer + 1), { size: 30, color: PALETTE.ink })]);

    if (m.open) {
      // a gallery carved into the rock, in the layer's own dark
      g.fillStyle(0x000000, 0.35).fillRoundedRect(GAL_X - 2, GAL_PAD - 2, galW + 4, galH + 6, 28);
      g.fillStyle(m.current ? shade(Ly.sky, 0.1) : Ly.sky, 0.93).fillRoundedRect(GAL_X, GAL_PAD, galW, galH, 26);
      g.fillStyle(0xffffff, 0.05).fillRoundedRect(GAL_X + 6, GAL_PAD + 4, galW - 12, 26, 13);
      // what stands at the back of it (shifts a little as you scroll)
      const life = at(LIFE, m.layer);
      if (life.decor) {
        const d = life.decor;
        // clear of the texts: hanging things between the name and the twist, standing things at the right
        const n = d.tex === 'leviathan' ? 1 : d.flip ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const dx = d.tex === 'leviathan' ? GAL_X + galW * 0.66 : GAL_X + galW * (d.flip ? 0.47 + k * 0.1 : 0.68 + k * 0.12);
          const dy = d.flip ? GAL_PAD + 6 : d.tex === 'leviathan' ? BAND_H / 2 + 10 : BAND_H - GAL_PAD - 4;
          const img = this.add.image(dx, dy, d.tex).setTint(d.tint).setAlpha(d.alpha).setScale(d.scale * (0.8 + r() * 0.4));
          if (d.tex !== 'leviathan') img.setOrigin(0.5, d.flip ? 0 : 1);
          if (d.flip) img.setFlipY(true);
          box.add(img);
          view.decor.push({ img, y: dy });
        }
      }
      const tex = life.motes.texture;
      view.motes = new Motes(this, { ...life.motes, ...(tex ? { texture: tex } : {}), x: GAL_X + 16, y: y + GAL_PAD + 10, w: galW - 32, h: galH - 20 });

      const name = outlined(this, GAL_X + 22, 44, this.t(`layer.${m.id}`), 40, m.current ? 0xffd23f : 0xffffff, 8).setOrigin(0, 0.5);
      fitText(name, m.twist === 'none' ? galW - 50 : galW - 250);
      front.add(name);
      // rarest find here
      if (m.rarest) {
        const tier = at(TIERS, m.rarest.tier);
        const disc = this.add.graphics();
        disc.fillStyle(PALETTE.shadow, 0.5).fillCircle(GAL_X + 56, 122, 38);
        disc.fillStyle(PALETTE.cardFace, 1).fillCircle(GAL_X + 56, 118, 38);
        disc.lineStyle(5, tier.color, 1).strokeCircle(GAL_X + 56, 118, 38);
        const odds = label(this, GAL_X + 108, 104, this.t('map.rarest', { odds: oddsText(this, m.rarest.odds) }), { size: 27, color: m.rarest.tier === 0 ? PALETTE.sand : tier.color }).setOrigin(0, 0.5);
        const what = label(this, GAL_X + 108, 136, fossilName(this, m.rarest), { size: 24, color: PALETTE.sand }).setOrigin(0, 0.5);
        const room = m.current ? galW - 300 : galW - 130;
        fitText(odds, room, 0.7);
        fitText(what, room, 0.7);
        front.add([disc, this.add.image(GAL_X + 56, 118, fossilKey(m.rarest.id)).setScale(0.4), odds, what]);
      } else front.add(label(this, GAL_X + 24, 118, this.t('map.none'), { size: 27, color: PALETTE.sand }).setOrigin(0, 0.5).setAlpha(0.8));
      // set progress
      const barW = Math.min(300, galW - 250);
      const bar = progressBar(this, GAL_X + 22 + barW / 2, 190, barW, 26, { color: m.complete ? 0x4fbf6a : PALETTE.ochre, value: m.found / m.total });
      const count = outlined(this, GAL_X + 40 + barW, 190, this.t('map.set', { a: m.found, b: m.total }), 30, m.complete ? 0x7fe08a : 0xffffff, 6).setOrigin(0, 0.5);
      front.add([bar, count]);
      if (m.complete) front.add(this.add.image(GAL_X + 40 + barW + count.width + 28, 190, 'ico-tick').setScale(0.8));
    } else {
      // solid rock, in the dark: what it is, and the dig power that opens it
      g.fillStyle(0x000000, m.next ? 0.5 : 0.64).fillRect(0, 0, W, BAND_H);
      const cx = (GAL_X + W - GAL_PAD) / 2;
      const name = outlined(this, GAL_X + 22, 46, this.t(`layer.${m.id}`), 38, 0xcdbfa8, 8).setOrigin(0, 0.5);
      fitText(name, m.twist === 'none' ? galW - 50 : galW - 250);
      const need = outlined(this, cx + 26, m.next ? 112 : 124, this.t('map.locked', { n: big(this, m.unlockPower) }), 30, m.next ? PALETTE.ochreLight : 0xa89a88, 6);
      fitText(need, galW - 120);
      const lock = this.add.image(need.x - need.displayWidth / 2 - 34, need.y, 'lock').setScale(0.72).setAlpha(m.next ? 1 : 0.7);
      view.lock = lock;
      front.add([name, need, lock]);
      if (m.next) {
        // the next layer down: how far your dig power is from opening it
        const bar = progressBar(this, cx, 164, Math.min(420, galW - 80), 26, { color: PALETTE.power, value: m.progress });
        const how = label(this, cx, 202, this.t('map.progress', { a: big(this, this.sim.digPower), b: big(this, m.unlockPower) }), { size: 25, color: PALETTE.sand });
        fitText(how, galW - 60);
        front.add([bar, how]);
      } else if (m.found > 0) front.add(label(this, cx, 176, this.t('map.set', { a: m.found, b: m.total }), { size: 27, color: 0xa89a88 }));
    }
    // the layer's twist, top right
    if (m.twist !== 'none') {
      const ix = W - GAL_PAD - 42;
      const icon = this.add.image(ix, 46, twistKey(m.twist)).setScale(0.86).setAlpha(m.open ? 1 : 0.6);
      const what = label(this, ix - 40, 46, this.t(`twist.${m.twist}`), { size: 24, color: m.open ? PALETTE.sand : 0xa89a88 }).setOrigin(1, 0.5);
      fitText(what, 170, 0.7);
      front.add([icon, what]);
    }
    return view;
  }

  /** The layer you are in: a lit frame that breathes, the helper standing in it, "you are here". */
  private drawHere(motion: boolean): void {
    const L = this.layout;
    const here = this.bands[this.sim.layer];
    if (!here) return;
    const y = SURFACE + this.sim.layer * BAND_H;
    const galW = L.width - GAL_X - GAL_PAD;
    const galH = BAND_H - GAL_PAD * 2;
    this.glow = this.add.image(GAL_X + galW / 2, y + BAND_H / 2, 'glow').setDisplaySize(galW * 1.25, galH * 1.7).setTint(0xffe2a0).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD);
    this.frame = this.add.graphics();
    this.frame.lineStyle(6, 0xffd23f, 1).strokeRoundedRect(GAL_X - 3, y + GAL_PAD - 3, galW + 6, galH + 6, 28);
    const tag = outlined(this, L.width - GAL_PAD - 88, y + 96, this.t('map.here'), 24, 0xffd23f, 6);
    fitText(tag, 168);
    this.world.add([this.glow, this.frame, tag]);
    // the helper: your own miner, whatever the assistant level (it stands for you)
    this.helper = new Helper(this, L.width - GAL_PAD - 88, y + BAND_H - GAL_PAD - 6, -1, null, { x: 0, y: 0 }, 5);
    this.world.add(this.helper.root);
    this.helper.update(0.01, Math.max(1, this.sim.level('assistant')), false);
    if (!motion) this.helper.update(1, Math.max(1, this.sim.level('assistant')), false);
  }

  /** Fixed parts: the title bar, the hint and the way back. */
  private drawChrome(): void {
    const L = this.layout;
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(0x0d0805, 1).fillRect(0, 0, L.width, L.top + 112);
    g.fillStyle(PALETTE.ochre, 0.9).fillRect(0, L.top + 110, L.width, 4);
    for (let i = 0; i < 6; i++) g.fillStyle(0x0d0805, 0.14 * (i + 1)).fillRect(0, L.bottom - 150 + i * 14, L.width, 14);
    g.fillStyle(0x0d0805, 0.9).fillRect(0, L.bottom - 66, L.width, L.height - L.bottom + 66);
    outlined(this, L.cx, L.top + 46, this.t('map.title'), 48, PALETTE.ochreLight, 8).setDepth(101);
    const hint = label(this, L.cx, L.top + 88, this.t('map.hint'), { size: 24, color: PALETTE.sand }).setDepth(101);
    fitText(hint, L.width - 40);
    this.backButton = button(this, L.cx, L.bottom - 70, this.t(this.from === 'menu' ? 'map.back' : 'museum.back'), () => this.leave(), { width: 340, height: 104, fontSize: 44 });
    this.backButton.setDepth(102);
  }

  /** Bands slide in from alternating sides, the ones nearest your layer first. */
  private slideIn(): void {
    const L = this.layout;
    for (const b of this.bands) {
      const screenY = SURFACE + b.model.layer * BAND_H - this.scroll;
      if (screenY > L.height || screenY + BAND_H < 0) continue;
      const side = b.model.layer % 2 ? 1 : -1;
      const delay = 40 + Math.abs(b.model.layer - this.sim.layer) * 55;
      b.box.setX(side * 90).setAlpha(0);
      b.front.setX(side * 90).setAlpha(0);
      b.motes?.setVisible(false);
      this.tweens.add({
        targets: [b.box, b.front],
        x: 0,
        alpha: 1,
        delay,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => b.motes?.setVisible(true),
      });
    }
  }

  // ------------------------------------------------------------------ scrolling

  private scrollBy(dy: number): void {
    this.setScroll(this.scroll + dy);
  }

  private setScroll(v: number): void {
    const L = this.layout;
    this.scroll = Math.max(0, Math.min(this.maxScroll, v));
    this.world.setY(-this.scroll);
    // the sky is far away: it moves at half the speed of the ground
    this.sky.setY(-this.scroll * 0.5);
    // parallax inside the galleries: what stands at the back lags a little behind the rock
    for (const b of this.bands) {
      if (b.decor.length === 0) continue;
      const centre = SURFACE + b.model.layer * BAND_H + BAND_H / 2 - this.scroll;
      const shift = Math.max(-12, Math.min(12, (centre - L.height / 2) * 0.03));
      for (const d of b.decor) d.img.setY(d.y + shift);
    }
  }

  /** Put `layer` in the middle of the screen. */
  private scrollTo(layer: number, animate: boolean): void {
    const target = Math.max(0, Math.min(this.maxScroll, SURFACE + layer * BAND_H + BAND_H / 2 - (this.window.top + this.window.bottom) / 2));
    this.velocity = 0;
    if (!animate || this.oyun.reducedMotion) {
      this.setScroll(target);
      return;
    }
    this.tweens.addCounter({ from: this.scroll, to: target, duration: 320, ease: 'Cubic.easeOut', onUpdate: (tw) => this.setScroll(tw.getValue() ?? target) });
  }

  // ------------------------------------------------------------------ input

  private onBand(layer: number): void {
    if (this.busy) return;
    const band = this.bands[layer];
    if (!band) return;
    const s = this.sim;
    if (layer > s.unlocked) {
      // locked: say what opens it; the lock rattles
      this.oyun.audio.play('hit', { volume: 0.4 });
      const L = this.layout;
      toast(this, this.t('map.locked', { n: big(this, s.unlockPowerOf(layer)) }), { position: Math.round(L.bottom - 210), duration: 1500 });
      if (band.lock && !this.oyun.reducedMotion) this.tweens.add({ targets: band.lock, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => band.lock?.setAngle(0) });
      return;
    }
    if (layer === s.layer) {
      this.toDig();
      return;
    }
    const from = s.layer;
    if (!s.travel(layer)) return;
    this.busy = true;
    this.ses.flush();
    this.oyun.audio.playPreset(SFX.flip);
    this.oyun.platform.haptic('light');
    const dir = travelDir(from, layer);
    // the descent starts here and finishes on the dig screen
    cover(this, from, layer, dir, () => this.scene.start(SCENES.dig, { arrive: dir, from }));
  }

  private toDig(): void {
    if (this.busy) return;
    this.busy = true;
    this.goTo(SCENES.dig);
  }

  private leave(): void {
    if (this.busy) return;
    this.busy = true;
    this.goTo(this.from === 'menu' ? SCENES.menu : SCENES.dig);
  }

  // ------------------------------------------------------------------ frame

  override update(_t: number, delta: number): void {
    const dt = Math.min(delta, 250) / 1000;
    this.clock += dt;
    const motion = !this.oyun.reducedMotion;
    // a flick keeps gliding and eases off
    if (!this.press && Math.abs(this.velocity) > 4) {
      this.scrollBy(this.velocity * dt);
      this.velocity *= Math.max(0, 1 - dt * 5);
      if (this.scroll <= 0 || this.scroll >= this.maxScroll) this.velocity = 0;
    }
    if (motion) {
      const L = this.layout;
      for (const b of this.bands) {
        if (!b.motes) continue;
        const top = SURFACE + b.model.layer * BAND_H - this.scroll;
        if (top < L.height && top + BAND_H > 0) b.motes.update(dt);
      }
      // the lit band breathes
      const breath = 0.5 + 0.5 * Math.sin(this.clock * 2.2);
      this.glow?.setAlpha(0.14 + 0.16 * breath);
      this.frame?.setAlpha(0.7 + 0.3 * breath);
      this.helper?.update(dt, Math.max(1, this.sim.level('assistant')), false);
    }
    // The dig waits while you look at the map (like on the title screen): no glint or weak spot
    // comes and goes unseen, and the sharp eye is not lost to a look at the map.
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) this.ses.background();
    else this.ses.flush();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) this.ses.foreground();
    super.onPlatformResume(reason);
  }

  // ------------------------------------------------------------------ test hook

  protected override testState() {
    const s = this.sim;
    return {
      from: this.from,
      layer: s.layer,
      unlocked: s.unlocked,
      scroll: Math.round(this.scroll),
      maxScroll: Math.round(this.maxScroll),
      busy: this.busy,
      window: { top: Math.round(this.window.top), bottom: Math.round(this.window.bottom) },
      bands: this.bands.map((b) => ({
        layer: b.model.layer,
        open: b.model.open,
        current: b.model.current,
        next: b.model.next,
        found: b.model.found,
        complete: b.model.complete,
        rarest: b.model.rarest?.id ?? null,
        unlockPower: b.model.unlockPower,
        // centre of the band on screen (logical px), for real-touch tests
        x: Math.round(this.layout.cx),
        y: Math.round(SURFACE + b.model.layer * BAND_H + BAND_H / 2 - this.scroll),
      })),
      ui: { back: { x: Math.round(this.backButton.x), y: Math.round(this.backButton.y) } },
    };
  }

  protected override testActions() {
    return {
      scroll: (p: unknown) => this.scrollBy(typeof p === 'number' ? p : 300),
      scrollTo: (p: unknown) => this.scrollTo(typeof p === 'number' ? p : this.sim.layer, false),
      band: (p: unknown) => this.onBand(typeof p === 'number' ? p : this.sim.layer),
      back: () => this.backButton.fire(),
    };
  }
}
