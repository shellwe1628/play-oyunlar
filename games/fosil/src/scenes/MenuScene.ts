import { type Button, button, label, MenuScene as MenuShell, muteButton, progressBar } from '@oyun/core';
import type { PauseReason } from '@oyun/core/pure';
import Phaser from 'phaser';
import { badgeKey } from '../art/badges';
import { addCardLife } from '../fx/CardLife';
import { Helper } from '../fx/Helper';
import { countTo, fillBar, Motes } from '../fx/Motion';
import { Particles } from '../fx/Particles';
import { initSeen } from '../fx/seen';
import { backgroundAware, session } from '../session';
import { at, FOSSIL_BY_ID, FOSSILS, LAYERS, RANKS, TIERS, type Fossil } from '../sim/data';
import { fossilKey, PALETTE } from '../textures';
import { SCENES } from './keys';
import { big, fitText, fossilName, hitZone, oddsText, outlined } from './ui';

/** Linear mix of two 0xRRGGBB colours. */
function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number): number => {
    const x = (a >> s) & 0xff;
    const y = (b >> s) & 0xff;
    return Math.round(x + (y - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/** Small deterministic random (the backdrop looks the same every visit). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Cloud {
  c: Phaser.GameObjects.Container;
  speed: number;
}

/**
 * Title screen: a cut-away of the dig site. A dusk sky over the surface (the title, the
 * assistant digging, a survey flag), and below it every stratum of the game in section, deeper
 * ones still dark until you open them. In the middle an excavation pit, strung with a survey
 * grid, holds your rarest find under a work light with a brass museum plaque; then one big
 * golden Play slab and two specimen drawers: Museum and Ranks.
 * Test actions: play, museum, ranks.
 */
export class MenuScene extends MenuShell {
  protected readonly playScene = SCENES.dig;
  private helper: Helper | null = null;
  private chips: Particles | null = null;
  private beat = 0;
  private clouds: Cloud[] = [];
  private museumButton!: Button;
  private ranksButton!: Button;
  private museumX = 0;
  private ranksX = 0;
  private motes: Motes[] = [];
  private mapAt = { x: 0, y: 0 };

  constructor() {
    super(SCENES.menu);
  }

  override create(): void {
    session(this.oyun).boot(); // away time since the last save, shown on the dig screen
    const L = this.layout;
    const sim = session(this.oyun).sim;
    const motion = !this.oyun.reducedMotion;
    this.cameras.main.setBackgroundColor(PALETTE.dirtDark);
    this.beat = 0;
    this.clouds = [];
    this.motes = [];
    // the museum's "New!" ribbons start counting from here (see fx/seen.ts)
    initSeen(this.oyun, FOSSILS.filter((f) => sim.discovered(f.id)).map((f) => f.id));

    // vertical plan, from the safe bottom up (the sky simply grows on tall screens)
    const surfaceY = L.top + 372;
    const cardH = 196;
    const cardsY = L.bottom - 30 - cardH / 2;
    const playH = 150;
    const playY = cardsY - cardH / 2 - 34 - playH / 2;
    const plaqueH = 100;
    const plaqueY = playY - playH / 2 - 38 - plaqueH / 2;
    const pitTop = surfaceY + 40;
    const pitBottom = plaqueY - plaqueH / 2 + 18;
    const pitH = Math.max(180, Math.min(330, pitBottom - pitTop));
    const pitY = pitBottom - pitH / 2;

    this.drawSky(surfaceY, motion);
    this.drawStrata(surfaceY, sim.unlocked, sim.layer, motion);
    this.chips = new Particles(this, 40, 60);
    this.drawSurface(surfaceY, motion);
    this.drawTitle(L.top, motion);

    const best = sim.stats.bestId ? FOSSIL_BY_ID.get(sim.stats.bestId) : undefined;
    this.drawPit(L.cx, pitY, pitH, best, motion);
    // idle life: fireflies over the grass at dusk, dust hanging in the work light of the pit
    const pitRx = Math.min(230, L.width / 2 - 70);
    this.motes = [
      new Motes(this, { x: 30, y: surfaceY - 170, w: L.width - 60, h: 160, count: 8, colors: [0xfff0a0, 0xd8ff9a], alpha: 0.85, texture: 'spark', scale: [0.25, 0.5], rise: -5, depth: -13, additive: true }),
      new Motes(this, { x: L.cx - pitRx * 0.55, y: pitY - pitH / 2 + 10, w: pitRx * 1.1, h: pitH - 30, count: 10, colors: [0xfff3c0, 0xffffff], alpha: 0.55, scale: [0.18, 0.4], rise: -9, depth: 3, additive: true }),
    ];
    this.drawPlaque(L.cx, plaqueY, plaqueH, best, motion);
    this.drawPlay(L.cx, playY, playH, motion);

    const found = FOSSILS.filter((f) => sim.discovered(f.id)).length;
    const cardW = (L.width - 60 - 24) / 2;
    const leftX = 30 + cardW / 2 + 6;
    const rightX = L.width - 30 - cardW / 2 - 6;
    this.museumX = Math.round(leftX);
    this.ranksX = Math.round(rightX);
    this.museumButton = this.drawer(leftX, cardsY, cardW, cardH, this.t('museum.title'), () => this.goTo(SCENES.museum), motion, -1);
    this.fillMuseum(this.museumButton, cardW, found, sim.layer);
    this.ranksButton = this.drawer(rightX, cardsY, cardW, cardH, this.t('menu.ranks'), () => this.goTo(SCENES.ranks), motion, 1);
    this.fillRanks(this.ranksButton, cardW, sim.rank, sim.score.total);

    muteButton(this, L.right - 76, L.top + 76).setDepth(50);
    this.drawMapButton(L.left + 68, L.top + 62);
  }

  /** The depth map, top left: the whole dig in cross-section. */
  private drawMapButton(x: number, y: number): void {
    const c = this.add.container(x, y).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.5).fillCircle(0, 5, 42);
    g.fillStyle(PALETTE.dirt, 1).fillCircle(0, 0, 42);
    g.lineStyle(4, PALETTE.ochre, 1).strokeCircle(0, 0, 40);
    const caption = outlined(this, 0, 58, this.t('map.menu'), 24, PALETTE.sand, 6);
    fitText(caption, 110);
    c.add([g, this.add.image(0, -1, 'ico-map').setScale(0.9), caption]);
    this.mapAt = { x, y };
    hitZone(this, x, y + 10, 100, 120, () => this.openMap()).setDepth(51);
  }

  private openMap(): void {
    this.goTo(SCENES.map, { from: 'menu' });
  }

  // ---------------------------------------------------------------- backdrop

  private drawSky(surfaceY: number, motion: boolean): void {
    const { width } = this.layout;
    const g = this.add.graphics().setDepth(-30);
    const steps = 56;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const c = t < 0.55 ? mix(0x141a33, 0x3d2b52, t / 0.55) : mix(0x3d2b52, 0xe08a52, (t - 0.55) / 0.45);
      g.fillStyle(c, 1).fillRect(0, (surfaceY * i) / steps, width, surfaceY / steps + 1);
    }
    // a low sun behind the hills
    const sunX = width * 0.74;
    const sunY = surfaceY - 46;
    this.add.image(sunX, sunY, 'glow').setTint(0xffa860).setScale(3.4).setAlpha(0.55).setDepth(-29);
    g.fillStyle(0xffd27a, 1).fillCircle(sunX, sunY, 44);
    g.fillStyle(0xfff0b8, 0.6).fillCircle(sunX - 10, sunY - 10, 24);
    // stars in the high sky
    const r = seeded(7);
    for (let i = 0; i < 16; i++) {
      const s = this.add
        .image(20 + r() * (width - 40), 14 + r() * surfaceY * 0.42, 'spark')
        .setScale(0.25 + r() * 0.35)
        .setAlpha(0.35 + r() * 0.5)
        .setDepth(-28);
      if (motion) this.tweens.add({ targets: s, alpha: 0.08, duration: 900 + r() * 1400, delay: r() * 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // drifting clouds
    for (let i = 0; i < 3; i++) {
      const c = this.add.container(width * (0.15 + i * 0.36), surfaceY * (0.28 + i * 0.17)).setDepth(-27);
      const cg = this.add.graphics();
      const tone = mix(0x6b4a6a, 0xf0a070, i / 2);
      cg.fillStyle(tone, 0.55);
      cg.fillEllipse(0, 0, 120, 30).fillEllipse(-34, -10, 60, 34).fillEllipse(22, -14, 70, 40);
      c.add(cg);
      c.setScale(0.8 + i * 0.2);
      this.clouds.push({ c, speed: 6 + i * 4 });
    }
    // hills on the horizon
    const hills = this.add.graphics().setDepth(-26);
    const ridge = (base: number, amp: number, freq: number, phase: number, color: number): void => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 24; k++) {
        const x = (width * k) / 24;
        pts.push(new Phaser.Math.Vector2(x, base - amp * (0.6 + 0.4 * Math.sin(k * freq + phase)) - amp * 0.3 * Math.sin(k * freq * 2.7 + phase)));
      }
      pts.push(new Phaser.Math.Vector2(width, surfaceY + 2), new Phaser.Math.Vector2(0, surfaceY + 2));
      hills.fillStyle(color, 1).fillPoints(pts, true);
    };
    ridge(surfaceY - 12, 70, 0.45, 1.3, 0x4a2f4e);
    ridge(surfaceY + 2, 44, 0.7, 4.1, 0x2f2236);
  }

  private drawStrata(surfaceY: number, unlocked: number, current: number, motion: boolean): void {
    const { width, height } = this.layout;
    const g = this.add.graphics().setDepth(-20);
    const top = surfaceY + 12;
    const bandH = (height - top) / LAYERS.length;
    const r = seeded(11);
    const edge = (y: number, i: number): Phaser.Math.Vector2[] => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 16; k++) pts.push(new Phaser.Math.Vector2((width * k) / 16, y + Math.sin(k * 0.8 + i * 1.7) * 6 + Math.sin(k * 2.3 + i) * 3));
      return pts;
    };
    LAYERS.forEach((layer, i) => {
      const y = top + i * bandH;
      const open = i <= unlocked;
      const base = at(layer.bands, 1);
      const depthDark = mix(base, PALETTE.shadow, 0.12 + (i / LAYERS.length) * 0.35);
      const color = open ? depthDark : mix(base, PALETTE.shadow, 0.72);
      const pts = edge(y, i);
      pts.push(new Phaser.Math.Vector2(width, height), new Phaser.Math.Vector2(0, height));
      g.fillStyle(color, 1).fillPoints(pts, true);
      // a lighter seam along the top of each stratum
      g.lineStyle(3, 0xffffff, open ? 0.12 : 0.04).strokePoints(edge(y, i), false);
      // pebbles and grains
      for (let k = 0; k < 9; k++) {
        const px = r() * width;
        const py = y + 10 + r() * (bandH - 16);
        const tone = r() > 0.5 ? mix(color, 0xffffff, 0.18) : mix(color, PALETTE.shadow, 0.35);
        g.fillStyle(tone, 0.9).fillEllipse(px, py, 8 + r() * 16, 5 + r() * 8);
      }
      // one buried fossil per stratum, at the edges where nothing covers it
      const f = FOSSILS.find((x) => x.layer === i);
      if (f) {
        const fx = i % 2 === 0 ? 76 + r() * 14 : width - 70 - r() * 14;
        const img = this.add.image(fx, y + bandH / 2, fossilKey(f.id)).setScale(0.3).setRotation((r() - 0.5) * 1.2).setDepth(-19);
        if (open) img.setAlpha(0.42).setTint(mix(color, 0xffffff, 0.55));
        else img.setTint(PALETTE.shadow).setAlpha(0.5);
      }
    });
    // survey rule on the left edge, with a marker at the stratum you dig in now
    const rule = this.add.graphics().setDepth(-18);
    rule.fillStyle(PALETTE.shadow, 0.45).fillRect(0, top, 28, height - top);
    for (let y = top + 6, k = 0; y < height; y += 22, k++) {
      const long = k % 5 === 0;
      rule.fillStyle(PALETTE.sand, long ? 0.75 : 0.4).fillRect(0, y, long ? 22 : 12, 3);
    }
    const my = top + (current + 0.5) * bandH;
    const marker = this.add.graphics().setDepth(-17);
    marker.fillStyle(PALETTE.ochreLight, 1).fillTriangle(0, -14, 0, 14, 22, 0);
    marker.lineStyle(3, PALETTE.shadow, 0.8).strokeTriangle(0, -14, 0, 14, 22, 0);
    marker.setPosition(26, my);
    if (motion) this.tweens.add({ targets: marker, x: 34, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // twinkles in the rock
    for (let i = 0; i < 8; i++) {
      const sx = i % 2 === 0 ? 44 + r() * 50 : width - 44 - r() * 50;
      const sy = top + 40 + r() * (height - top - 80);
      const s = this.add.image(sx, sy, 'spark').setScale(0).setTint(i % 3 === 0 ? 0xbfe8ff : 0xfff0b0).setDepth(-16);
      if (motion) this.tweens.add({ targets: s, scale: 0.7, duration: 380, delay: 400 + r() * 5000, hold: 120, yoyo: true, repeat: -1, repeatDelay: 2500 + r() * 4000, ease: 'Sine.easeOut' });
      else s.setScale(0.5);
    }
  }

  private drawSurface(surfaceY: number, motion: boolean): void {
    const { width } = this.layout;
    const g = this.add.graphics().setDepth(-15);
    // turf
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k <= 36; k++) pts.push(new Phaser.Math.Vector2((width * k) / 36, surfaceY - 6 - (k % 2) * 6 - Math.sin(k * 0.7) * 2));
    pts.push(new Phaser.Math.Vector2(width, surfaceY + 16), new Phaser.Math.Vector2(0, surfaceY + 16));
    g.fillStyle(0x3f6b2e, 1).fillPoints(pts, true);
    g.fillStyle(0x5d8f3a, 1).fillRect(0, surfaceY - 2, width, 8);
    g.fillStyle(0x2c4a22, 1).fillRect(0, surfaceY + 10, width, 6);
    // a spoil heap where the assistant digs
    g.fillStyle(0x7a4b2a, 1).fillEllipse(196, surfaceY + 2, 110, 40);
    g.fillStyle(0x9b6a3f, 1).fillEllipse(190, surfaceY - 4, 76, 24);
    // survey stake with a flag
    const sx = 612;
    g.fillStyle(0x8a5a35, 1).fillRect(sx - 4, surfaceY - 110, 8, 116);
    g.fillStyle(PALETTE.shadow, 0.4).fillEllipse(sx, surfaceY + 6, 34, 10);
    const flag = this.add.graphics().setDepth(-14);
    flag.fillStyle(0xe2553a, 1).fillTriangle(0, 0, 0, 40, 58, 20);
    flag.fillStyle(0xffffff, 0.25).fillTriangle(0, 0, 0, 14, 26, 9);
    flag.setPosition(sx + 4, surfaceY - 108);
    if (motion) this.tweens.add({ targets: flag, scaleX: 0.78, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // the assistant, digging on the menu at its own rhythm
    this.helper = new Helper(this, 120, surfaceY + 4, 1, this.chips, { x: 176, y: surfaceY - 4 }, 20);
  }

  private drawTitle(top: number, motion: boolean): void {
    const { cx, width } = this.layout;
    const titleY = top + 136;
    const c = this.add.container(cx, titleY).setDepth(30);
    const text = this.t('menu.title');
    const shadow = label(this, 0, 8, text, { size: 96, color: PALETTE.shadow }).setAlpha(0.55);
    const main = label(this, 0, 0, text, { size: 96, color: 0xfff1d0 });
    main.setStroke('#24160e', 14);
    shadow.setStroke('#0d0805', 14);
    const maxW = width - 250;
    fitText(main, maxW);
    fitText(shadow, maxW);
    c.add([shadow, main]);
    // field tag under the title: the promise of the game
    const tagY = 88;
    const tag = label(this, 14, tagY, this.t('menu.tagline'), { size: 28, color: PALETTE.ink });
    fitText(tag, width - 150);
    const tw = tag.displayWidth + 70;
    const tg = this.add.graphics();
    tg.fillStyle(PALETTE.shadow, 0.45).fillRoundedRect(-tw / 2, tagY - 26 + 5, tw, 52, 26);
    tg.fillStyle(PALETTE.cream, 1).fillRoundedRect(-tw / 2, tagY - 26, tw, 52, 26);
    tg.fillStyle(PALETTE.ochre, 1).fillCircle(-tw / 2 + 26, tagY, 9);
    tg.fillStyle(PALETTE.cream, 1).fillCircle(-tw / 2 + 26, tagY, 4);
    const tagC = this.add.container(0, 0, [tg, tag]);
    c.add(tagC);
    if (!motion) return;
    c.y = -160;
    this.tweens.add({ targets: c, y: titleY, duration: 900, ease: 'Bounce.easeOut' });
    tagC.setAlpha(0);
    tagC.y = 24;
    this.tweens.add({ targets: tagC, alpha: 1, y: 0, duration: 420, delay: 700, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: [main, shadow], scale: main.scale * 1.03, duration: 1800, delay: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ---------------------------------------------------------------- hero: the excavation pit

  private drawPit(cx: number, cy: number, h: number, best: Fossil | undefined, motion: boolean): void {
    const rx = Math.min(230, this.layout.width / 2 - 70);
    const ry = h / 2;
    const r = seeded(23);
    const jitter = Array.from({ length: 28 }, () => 0.93 + r() * 0.12);
    const blob = (s: number, dy = 0): Phaser.Math.Vector2[] =>
      jitter.map((j, k) => {
        const a = (k / jitter.length) * Math.PI * 2;
        return new Phaser.Math.Vector2(cx + Math.cos(a) * rx * s * j, cy + dy + Math.sin(a) * ry * s * j);
      });
    // work light from the surface
    this.add
      .image(cx, cy - ry - 70, 'ray')
      .setOrigin(0.5, 0)
      .setTint(0xfff3c0)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(4.2, (ry * 2 + 40) / 360)
      .setDepth(2);
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(PALETTE.shadow, 0.55).fillPoints(blob(1.06, 8), true);
    g.fillStyle(0xc9a06a, 1).fillPoints(blob(1.0), true);
    g.fillStyle(0x8a5a35, 1).fillPoints(blob(0.95, 4), true);
    g.fillStyle(0x24160e, 1).fillPoints(blob(0.9, 8), true);
    g.fillStyle(0x3d2716, 1).fillEllipse(cx, cy + ry * 0.5, rx * 1.3, ry * 0.55);
    g.fillStyle(0x4e3220, 1).fillEllipse(cx, cy + ry * 0.55, rx * 0.9, ry * 0.3);
    // survey grid strung over the pit, with pegs on the rim
    const halfW = (y: number): number => rx * 0.97 * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
    g.lineStyle(2, PALETTE.cream, 0.5);
    for (const fy of [-0.38, 0.32]) {
      const y = fy * ry;
      const w = halfW(y);
      g.lineBetween(cx - w, cy + y, cx + w, cy + y);
      g.fillStyle(PALETTE.ochre, 1).fillCircle(cx - w, cy + y, 6).fillCircle(cx + w, cy + y, 6);
    }
    for (const fx of [-0.52, 0.52]) {
      const x = fx * rx;
      const hh = ry * 0.97 * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
      g.lineBetween(cx + x, cy - hh, cx + x, cy + hh);
      g.fillStyle(PALETTE.ochre, 1).fillCircle(cx + x, cy - hh, 6).fillCircle(cx + x, cy + hh, 6);
    }
    // the find itself
    const show = this.add.container(cx, cy - 6).setDepth(4);
    const scale = Math.min(1.15, (h * 0.62) / 160);
    if (best) {
      const tier = at(TIERS, best.tier);
      const glow = this.add.image(0, 0, 'glow').setTint(tier.color).setScale(2.4).setAlpha(0.55);
      show.add(glow);
      show.add(this.add.image(0, 0, fossilKey(best.id)).setScale(scale));
      addCardLife(this, show, best.tier, 160 * scale, 160 * scale, 1);
      if (motion) this.tweens.add({ targets: glow, alpha: 0.85, scale: 2.7, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      show.add(this.add.image(0, 0, fossilKey('topsoil-12')).setScale(scale).setTint(0x120a06).setAlpha(0.9));
      show.add(outlined(this, 0, 0, '?', 84, PALETTE.sand, 10).setAlpha(0.9));
    }
    // a soft brush that keeps cleaning the find
    const brush = this.add.container(cx + rx * 0.42, cy - ry * 0.06).setDepth(5).setAngle(-35);
    const bg = this.add.graphics();
    bg.fillStyle(0x8a5a35, 1).fillRoundedRect(-6, -78, 12, 70, 6);
    bg.fillStyle(0xb8b8c0, 1).fillRect(-9, -14, 18, 12);
    bg.fillStyle(0xe8c890, 1).fillRoundedRect(-11, -4, 22, 30, 4);
    bg.fillStyle(0xc9a06a, 1).fillRect(-11, 18, 22, 8);
    brush.add(bg);
    if (!motion) return;
    show.setScale(0);
    this.tweens.add({
      targets: show,
      scale: 1,
      duration: 650,
      delay: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.chips?.emit(cx, cy, 16, { texture: 'spark', tint: 0xfff0b0, speed: [140, 320], life: [0.4, 0.8], scale: [0.4, 0.9], endScale: 0, gravity: 200 });
        this.tweens.add({ targets: show, y: cy - 16, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    let strokes = 0;
    this.tweens.add({
      targets: brush,
      x: brush.x - 26,
      angle: -22,
      duration: 260,
      yoyo: true,
      repeat: -1,
      repeatDelay: 60,
      delay: 1200,
      ease: 'Sine.easeInOut',
      onYoyo: () => {
        strokes++;
        this.chips?.emit(brush.x - 18, brush.y + 18, 3, { tint: 0xd8b888, speed: [30, 90], angle: -Math.PI / 2, spread: 1.6, life: [0.4, 0.7], scale: [0.25, 0.45], endScale: 0.2, gravity: 120, alpha: 0.8 });
        if (strokes % 6 === 0) this.chips?.emit(cx + (Math.random() - 0.5) * 90, cy - 30 + (Math.random() - 0.5) * 60, 1, { texture: 'spark', tint: 0xffffff, speed: [0, 10], life: [0.5, 0.6], scale: [0.7, 0.9], endScale: 0 });
      },
    });
  }

  private drawPlaque(cx: number, cy: number, h: number, best: Fossil | undefined, motion: boolean): void {
    const w = Math.min(540, this.layout.width - 140);
    const c = this.add.container(cx, cy).setDepth(8);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.55).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 18);
    g.fillStyle(0x8a6226, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0xd9a94e, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 14);
    g.fillStyle(0xf2cf7a, 0.7).fillRoundedRect(-w / 2 + 12, -h / 2 + 10, w - 24, 14, 7);
    g.lineStyle(2, 0x8a6226, 0.8).strokeRoundedRect(-w / 2 + 16, -h / 2 + 16, w - 32, h - 32, 10);
    for (const sx of [-1, 1]) {
      g.fillStyle(0x8a6226, 1).fillCircle(sx * (w / 2 - 30), 0, 7);
      g.lineStyle(2, 0xf2cf7a, 0.9).lineBetween(sx * (w / 2 - 30) - 4, -4, sx * (w / 2 - 30) + 4, 4);
    }
    c.add(g);
    const textW = w - 110;
    if (best) {
      const tier = at(TIERS, best.tier);
      const head = label(this, 0, -20, this.t('menu.rarestTitle'), { size: 22, color: 0x5a3c12 });
      const line = label(this, 0, 14, `${fossilName(this, best)} · ${oddsText(this, best.odds)}`, { size: 32, color: PALETTE.ink });
      fitText(head, textW);
      fitText(line, textW);
      const dot = this.add.graphics();
      dot.fillStyle(tier.color, 1).fillCircle(-head.displayWidth / 2 - 16, -20, 7);
      dot.lineStyle(2, PALETTE.ink, 0.6).strokeCircle(-head.displayWidth / 2 - 16, -20, 7);
      c.add([head, line, dot]);
    } else {
      const line = label(this, 0, -2, this.t('menu.noFind'), { size: 28, color: PALETTE.ink, wrap: textW });
      if (line.height > h - 30) fitText(line, textW);
      c.add(line);
    }
    if (!motion) return;
    c.setAlpha(0);
    c.y = cy + 40;
    this.tweens.add({ targets: c, alpha: 1, y: cy, duration: 450, delay: 520, ease: 'Cubic.easeOut' });
  }

  // ---------------------------------------------------------------- buttons

  /** Replace a core button's face with our own art (keeps its press squash, sound and hotkey). */
  private skin(btn: Button, art: Phaser.GameObjects.Graphics): Phaser.GameObjects.Text | undefined {
    const face = btn.list.find((o) => o instanceof Phaser.GameObjects.Graphics);
    if (face) face.setVisible(false);
    btn.addAt(art, 0);
    return btn.list.find((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text);
  }

  private drawPlay(cx: number, cy: number, h: number, motion: boolean): void {
    const w = Math.min(520, this.layout.width - 120);
    const glow = this.add.image(cx, cy, 'glow').setTint(0xffc35a).setScale((w * 1.5) / 128, (h * 2.2) / 128).setAlpha(0.35).setDepth(9);
    this.playButton = button(this, cx, cy, this.t('core.play'), () => this.play(), { hotkey: 'ENTER', width: w, height: h, fontSize: 68 });
    this.playButton.setDepth(10);
    const g = this.add.graphics();
    const r = 40;
    g.fillStyle(PALETTE.shadow, 0.6).fillRoundedRect(-w / 2, -h / 2 + 12, w, h, r);
    g.fillStyle(0xa8661c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xf0b440, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 12, r);
    g.fillStyle(0xffd77a, 1).fillRoundedRect(-w / 2 + 10, -h / 2 + 8, w - 20, h * 0.4, r * 0.7);
    g.lineStyle(3, 0xfff1c8, 0.6).strokeRoundedRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 30, r - 8);
    const text = this.skin(this.playButton, g);
    const pick = this.add.image(-w / 2 + 92, -4, 'pick-0').setScale(0.78).setAngle(-15);
    this.playButton.add(pick);
    if (text) {
      text.setPosition(46, -8);
      text.setStroke('#fff1c8', 4);
      fitText(text, w - 230);
    }
    const sheen = this.add.image(-w / 2, -6, 'sheen').setScale(0.9, (h * 0.8) / 420).setRotation(0.32).setAlpha(0);
    this.playButton.add(sheen);
    if (!motion) return;
    this.tweens.add({ targets: glow, alpha: 0.7, scaleX: (w * 1.7) / 128, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // the pick taps the slab, then a shine runs across it
    this.tweens.add({ targets: pick, angle: -50, duration: 180, yoyo: true, repeat: 1, repeatDelay: 80, delay: 1800, loop: -1, loopDelay: 2200, ease: 'Quad.easeIn' });
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 900,
      delay: 1300,
      repeat: -1,
      repeatDelay: 2500,
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        sheen.x = -w / 2 + 50 + v * (w - 100);
        sheen.setAlpha(Math.sin(v * Math.PI) * 0.55);
      },
    });
    this.playButton.setScale(0.2);
    glow.setAlpha(0);
    this.tweens.add({ targets: this.playButton, scale: 1, duration: 520, delay: 650, ease: 'Back.easeOut' });
    this.tweens.add({ targets: glow, alpha: 0.35, duration: 400, delay: 800 });
  }

  /** A specimen drawer: wooden front, brass pull, an icon well on the left. */
  private drawer(x: number, y: number, w: number, h: number, title: string, onTap: () => void, motion: boolean, side: -1 | 1): Button {
    const btn = button(this, x, y, title, onTap, { width: w, height: h, fontSize: 32, variant: 'secondary' });
    btn.setDepth(10);
    const g = this.add.graphics();
    const r = 26;
    g.fillStyle(PALETTE.shadow, 0.6).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, r);
    g.fillStyle(0x4e3220, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0x7a5232, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 8, r);
    // wood grain
    for (let k = 0; k < 5; k++) g.lineStyle(2, 0x5a3b24, 0.35).lineBetween(-w / 2 + 14, -h / 2 + 30 + k * 30, w / 2 - 14, -h / 2 + 24 + k * 31);
    g.fillStyle(0xffffff, 0.12).fillRoundedRect(-w / 2 + 8, -h / 2 + 6, w - 16, 16, 8);
    g.lineStyle(3, 0x3a2416, 0.8).strokeRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 24, r - 6);
    // brass screws in the corners
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = sx * (w / 2 - 22);
      const py = sy * (h / 2 - 26) - 4;
      g.fillStyle(0x8a6226, 1).fillCircle(px, py, 6);
      g.fillStyle(0xf2cf7a, 1).fillCircle(px - 1, py - 1, 3);
    }
    // icon well
    g.fillStyle(0x2c1b10, 0.85).fillCircle(-w / 2 + 66, -14, 50);
    g.lineStyle(3, 0xc9a06a, 0.6).strokeCircle(-w / 2 + 66, -14, 50);
    const text = this.skin(btn, g);
    if (text) {
      text.setPosition(-w / 2 + 132, -56).setOrigin(0, 0.5);
      text.setStroke('#24160e', 6);
      fitText(text, w - 150);
    }
    if (motion) {
      btn.x = x + side * (this.layout.width * 0.6);
      this.tweens.add({ targets: btn, x, duration: 560, delay: 820 + (side > 0 ? 90 : 0), ease: 'Cubic.easeOut' });
    }
    return btn;
  }

  private fillMuseum(btn: Button, w: number, found: number, layer: number): void {
    const ix = -w / 2 + 66;
    const iy = -14;
    const g = this.add.graphics();
    const c = PALETTE.cream;
    g.fillStyle(c, 1).fillTriangle(ix - 40, iy - 14, ix + 40, iy - 14, ix, iy - 38);
    g.fillStyle(0x2c1b10, 1).fillTriangle(ix - 24, iy - 18, ix + 24, iy - 18, ix, iy - 30);
    g.fillStyle(c, 1).fillRect(ix - 38, iy - 14, 76, 7);
    for (let k = 0; k < 4; k++) g.fillRect(ix - 31 + k * 20, iy - 5, 8, 30);
    g.fillRect(ix - 40, iy + 25, 80, 6).fillRect(ix - 44, iy + 31, 88, 6);
    g.fillStyle(PALETTE.ochreLight, 1).fillCircle(ix, iy - 23, 3);
    btn.add(g);
    const left = -w / 2 + 132;
    const colW = w - 150;
    const sub = label(this, left, -18, this.t('menu.species', { a: found, b: FOSSILS.length }), { size: 24, color: PALETTE.sand }).setOrigin(0, 0.5);
    fitText(sub, colW);
    // the shelf fills up once the drawer has slid in
    const bar = progressBar(this, left + colW / 2, 18, colW, 16, { color: PALETTE.ochreLight, background: 0x2c1b10, value: 0 });
    fillBar(this, bar, found / FOSSILS.length, 700, 1450);
    countTo(this, 0, found, 700, (v) => fitText(sub.setText(this.t('menu.species', { a: Math.round(v), b: FOSSILS.length })), colW), 16, 1450);
    const where = label(this, left, 48, this.t(`layer.${at(LAYERS, layer).id}`), { size: 20, color: PALETTE.sand }).setOrigin(0, 0.5).setAlpha(0.85);
    fitText(where, colW);
    btn.add([sub, bar, where]);
  }

  private fillRanks(btn: Button, w: number, rank: number, score: number): void {
    const ix = -w / 2 + 66;
    const badge = this.add.image(ix, -14, badgeKey(this, rank)).setScale(0.56);
    btn.add(badge);
    this.tweens.add({ targets: badge, scale: 0.6, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    const r = at(RANKS, rank);
    const next = RANKS[rank + 1];
    const left = -w / 2 + 132;
    const colW = w - 150;
    const name = label(this, left, -18, this.t(`rank.${r.id}`), { size: 24, color: r.color }).setOrigin(0, 0.5);
    name.setStroke('#24160e', 5);
    fitText(name, colW);
    const value = next ? (score - r.score) / (next.score - r.score) : 1;
    const bar = progressBar(this, left + colW / 2, 18, colW, 16, { color: r.color, background: 0x2c1b10, value: 0 });
    fillBar(this, bar, Math.max(0, Math.min(1, value)), 700, 1550);
    const pts = label(this, left, 48, this.t('menu.points', { n: big(this, score) }), { size: 20, color: PALETTE.sand }).setOrigin(0, 0.5).setAlpha(0.85);
    fitText(pts, colW);
    btn.add([name, bar, pts]);
  }

  // ---------------------------------------------------------------- loop & hooks

  override update(_t: number, delta: number): void {
    const dt = Math.min(delta, 250) / 1000;
    const { width } = this.layout;
    for (const cl of this.clouds) {
      cl.c.x += cl.speed * dt;
      if (cl.c.x > width + 120) cl.c.x = -120;
    }
    for (const m of this.motes) m.update(dt);
    if (!this.helper || !this.chips) return;
    this.beat += dt;
    if (this.beat > 0.9) {
      this.beat = 0;
      this.helper.hits(1);
    }
    const level = Math.max(1, session(this.oyun).sim.level('assistant'));
    this.helper.update(dt, level, false);
    this.chips.update(dt);
  }

  protected override onPlatformPause(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).background();
    super.onPlatformPause(reason);
  }

  protected override onPlatformResume(reason: PauseReason): void {
    if (backgroundAware(reason)) session(this.oyun).foreground();
    super.onPlatformResume(reason);
  }

  protected override testActions(): Record<string, (payload: unknown) => void> {
    return {
      ...super.testActions(),
      museum: () => this.museumButton.fire(),
      ranks: () => this.ranksButton.fire(),
      map: () => this.openMap(),
    };
  }

  protected override testState() {
    const sim = session(this.oyun).sim;
    const pos = (b: Button | undefined): { x: number; y: number } => ({ x: Math.round(b?.x ?? 0), y: Math.round(b?.y ?? 0) });
    return {
      found: FOSSILS.filter((f) => sim.discovered(f.id)).length,
      score: sim.score.total,
      rank: sim.rank,
      // where the buttons sit once the entrance settles (logical px), for real-touch tests
      ui: { play: pos(this.playButton), museum: { x: this.museumX, y: Math.round(this.museumButton?.y ?? 0) }, ranks: { x: this.ranksX, y: Math.round(this.ranksButton?.y ?? 0) }, map: { ...this.mapAt } },
    };
  }
}
