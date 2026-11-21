/**
 * The menu screens of the 2D game as DOM overlays over the 3D scene: the pause menu (core
 * PauseScene), the shop (ShopScene), the forge (ForgeScene), ranks / records / achievements
 * (RanksScene) and the rank-up ceremony (ResultScene.playRankUp). Same layout (logical px),
 * texts, numbers, sounds and drawings (the game's own `drawBowItem`, `drawBadge`,
 * `drawUpgradeIcon`, `drawHeadIcon`, `drawCoin` run on canvases through Gfx). Every rule is the
 * game's: buyUpgrade, attemptForge, unlockFeats, progressScore …
 */
import { drawHeadIcon } from '@okcu/scenes/art';
import { auraColor, drawBadge, drawBowItem } from '@okcu/scenes/gear';
import { drawCoin, drawUpgradeIcon } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { HARD_BOW_POW } from '@sim/cards';
import { attemptForge, BOW_MAX, bowCost, bowDamage as baseBowDamage, bowGlow, bowTier, forgeChance, GLOW_BANDS, glowBand, HEAT_STEP, nextGlowBand, type ForgeResult } from '@sim/bow';
import { CHAPTERS } from '@sim/chapters';
import { buyUpgrade, COSMETICS, isUnlocked, UPGRADE_IDS, UPGRADES, upgradeCost, type UpgradeId } from '@sim/meta';
import { FEATS, progressScore, RANKS, rankOf, SCORE, toNextRank, unlockFeats } from '@sim/progress';
import { BOSS_KINDS } from '@sim/world';
import { button, EASE, el, Label, roundButton, Sketch, Timers, type ButtonHandle, type LabelOpts } from './dom';
import { css, rgba, type Gfx } from './gfx';
import { openOnline } from './online';
import type { Ui } from './screens';

const CX = 360;
const CY = 640;
const TOP = 0;
const BOTTOM = 1280;

/** A text in the 2D games' style: centred, outlined in ink (label().setStroke()). */
function text(parent: HTMLElement, x: number, y: number, s: string, size: number, color: number, o: Partial<LabelOpts> = {}): Label {
  return new Label(parent, x, y, s, { size, color, stroke: Math.max(4, Math.round(size / 5)), ...o });
}

function screenRoot(parent: HTMLElement, scrim: string): HTMLElement {
  const root = el('div', 'ok-group', parent);
  const s = el('div', 'ok-scrim', root);
  s.dataset.ui = '1';
  s.style.background = scrim;
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
  return root;
}

/** A small value tween (Phaser's tweens on scene fields). */
interface Tween {
  set: (v: number) => void;
  from: number;
  to: number;
  dur: number;
  delay: number;
  t: number;
  ease: (u: number) => number;
  done?: () => void;
}
const ease = {
  sineOut: (u: number) => Math.sin((u * Math.PI) / 2),
  sineInOut: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2,
  cubicOut: (u: number) => 1 - (1 - u) ** 3,
  linear: (u: number) => u,
};
class Tweens {
  private list: Tween[] = [];
  add(tw: Omit<Tween, 't'>): void {
    this.list.push({ ...tw, t: 0 });
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i]!;
      tw.t += dt;
      if (tw.t < tw.delay) continue;
      const u = Math.min(1, (tw.t - tw.delay) / Math.max(0.001, tw.dur));
      tw.set(tw.from + (tw.to - tw.from) * tw.ease(u));
      if (u >= 1) {
        this.list.splice(i, 1);
        tw.done?.();
      }
    }
  }
}

/**
 * The bow's glow on a canvas (a light stand-in for the 2D BowAura): a soft halo and an aura
 * hugging the limbs in the band's colour, a white-hot core, and motes peeling off, all scaled by
 * the game's own glow ladder (`bowGlow`), so every band looks different and +0 has none.
 */
function drawGlow(g: Gfx, x: number, y: number, size: number, level: number, time: number, boost = 0): void {
  const gl = bowGlow(level);
  if (gl.band === 0 && boost <= 0) return;
  const c = g.ctx;
  const col = auraColor(level, time);
  const s = size / 40;
  const t1x = x - 16 * s;
  const qx = x + 28 * s;
  const k = Math.min(1.6, gl.aura + boost * 0.4);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const halo = c.createRadialGradient(x, y, size * 0.1, x, y, size * 1.25);
  halo.addColorStop(0, rgba(col, 0.32 * k));
  halo.addColorStop(1, rgba(col, 0));
  c.fillStyle = halo;
  c.fillRect(x - size * 1.3, y - size * 1.3, size * 2.6, size * 2.6);
  c.lineCap = 'round';
  const limb = (w: number, color: string): void => {
    c.beginPath();
    c.moveTo(t1x, y - size);
    c.quadraticCurveTo(qx, y, t1x, y + size);
    c.lineWidth = w;
    c.strokeStyle = color;
    c.stroke();
  };
  const pulse = 0.85 + Math.sin(time * 4) * 0.15;
  limb((10 + 26 * k) * s, rgba(col, 0.22 * k * pulse));
  limb((6 + 12 * k) * s, rgba(col, 0.35 * k * pulse));
  if (gl.core > 0) limb(3 * s, rgba(0xffffff, 0.5 * gl.core));
  // a sheen running along the limbs
  if (gl.sheen > 0) {
    const u = (time * 0.7) % 1.4;
    if (u < 1) {
      const a = 1 - u;
      const py = y - size + 2 * size * u;
      const px = a * a * t1x + 2 * a * u * qx + u * u * t1x;
      c.fillStyle = rgba(0xffffff, 0.55 * gl.sheen);
      c.beginPath();
      c.arc(px, py, 6 * s, 0, Math.PI * 2);
      c.fill();
    }
  }
  // motes and flame tongues rising off the limbs (placed from time: nothing allocates)
  const n = Math.round((gl.motes + gl.flame * 10) * Math.min(1, size / 100));
  for (let i = 0; i < n; i++) {
    const ph = (time * (0.45 + (i % 5) * 0.07) + i * 0.618) % 1;
    const along = (i * 0.379) % 1;
    const a = 1 - along;
    const by = y - size + 2 * size * along;
    const bx = a * a * t1x + 2 * a * along * qx + along * along * t1x;
    const r = (gl.flame > 0 && i % 2 === 0 ? 7 : 3.5) * s * (1 - ph * 0.6);
    c.fillStyle = rgba(i % 3 === 0 && gl.core > 0 ? 0xffffff : col, (1 - ph) * 0.9);
    c.beginPath();
    c.arc(bx + Math.sin(time * 3 + i) * 6 * s, by - ph * 46 * s, Math.max(0.5, r), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** The 3D build plays 'hard', where the forged bow counts ×bowDamage^HARD_BOW_POW (sim/cards.ts). */
const bowDamage = (level: number): number => baseBowDamage(level) ** HARD_BOW_POW;

export type From = 'title' | 'result' | 'shop';
export type ShopTab = 'upgrades' | 'looks';

interface Screen {
  root: HTMLElement;
  update(real: number): void;
  destroy(): void;
}

export interface Menus {
  /** a full-screen menu (shop, forge, ranks) is up */
  readonly open: boolean;
  readonly pauseOpen: boolean;
  readonly ceremonyOpen: boolean;
  /** the shop, on its upgrades tab or straight on the looks (cosmetics) tab */
  openShop(from: From, tab?: ShopTab): void;
  openForge(from: From): void;
  openRanks(from: From): void;
  openPause(): void;
  closePause(): void;
  rankUp(rank: number): void;
  update(real: number): void;
  closeAll(): void;
}

export interface MenuHooks {
  /** the pause menu's buttons (the HUD banks first) */
  resume: () => void;
  quit: () => void;
  restart: () => void;
  /** a menu screen was closed with Back (2D: `goTo(SCENES.game, {})`, a fresh title) */
  back: () => void;
}

export function createMenus(ui: Ui, parent: HTMLElement, hooks: MenuHooks): Menus {
  const t = ui.t;
  const save = ui.game.save;
  let screen: Screen | null = null;
  let pause: HTMLElement | null = null;
  let pauseLabels: Label[] = [];
  let ceremony: { root: HTMLElement; labels: Label[]; timer: number } | null = null;

  function swap(next: Screen | null): void {
    screen?.destroy();
    screen = next;
  }

  // ---------------------------------------------------------------- pause (core PauseScene)

  function openPause(): void {
    if (pause) return;
    const root = el('div', 'ok-group', parent);
    pause = root;
    const scrim = el('div', 'ok-scrim', root);
    scrim.dataset.ui = '1';
    scrim.style.background = rgba(PALETTE.ink, 0.72);
    const card = el('div', 'ok-panel', root);
    card.style.cssText = `left:${CX - 280}px;top:${CY - 300}px;width:560px;height:600px`;
    card.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 200, easing: EASE.backOut });
    const title = new Label(root, CX, CY - 215, t('core.paused'), { size: 64 });
    button(root, CX, CY - 55, t('core.resume'), ui.unlock, () => {
      ui.audio.play('tap');
      hooks.resume();
    });
    button(root, CX, CY + 85, t('core.quit'), ui.unlock, () => {
      ui.audio.play('tap');
      hooks.quit();
    }, { variant: 'secondary' });
    // sound (as in core) and, beside it, a fresh start of the same kind of run
    const mute = roundButton(root, CX - 62, CY + 210, 96, ui.audio.muted ? 'sound-off' : 'sound-on', ui.unlock, () => {
      const muted = ui.audio.toggleMute();
      mute.setIcon(muted ? 'sound-off' : 'sound-on');
      if (!muted) ui.audio.play('pop');
    });
    roundButton(root, CX + 62, CY + 210, 96, 'replay', ui.unlock, () => {
      ui.audio.play('tap');
      hooks.restart();
    });
    pauseLabels = [title];
  }

  function closePause(): void {
    if (!pause) return;
    for (const l of pauseLabels) l.destroy();
    pauseLabels = [];
    pause.remove();
    pause = null;
  }

  // ---------------------------------------------------------------- shop (ShopScene)

  function shop(from: From, startTab: ShopTab = 'upgrades'): Screen {
    const root = screenRoot(parent, rgba(PALETTE.ink, 0.45));
    const labels: Label[] = [];
    const L = (l: Label): Label => {
      labels.push(l);
      return l;
    };
    let tab: 'upgrades' | 'looks' = 'upgrades';
    let clock = 0;
    L(text(root, CX, TOP + 70, t('shop.title'), 60, PALETTE.cream, { stroke: 14 }));
    const coinG = new Sketch(root, CX - 76, TOP + 114, 52, 52);
    drawCoin(coinG.begin().phaser, CX - 50, TOP + 140, 20);
    const coinText = L(text(root, CX - 20, TOP + 140, '', 46, PALETTE.coin, { originX: 0, stroke: 10 }));
    const tabBtns = new Map<string, ButtonHandle>();
    (['upgrades', 'looks'] as const).forEach((k, i) => {
      const b = button(root, CX + (i === 0 ? -160 : 160), TOP + 225, t(k === 'upgrades' ? 'shop.tabUpgrades' : 'shop.tabLooks'), ui.unlock, () => setTab(k), { width: 300, height: 88, fontSize: 38, variant: 'secondary' });
      tabBtns.set(k, b);
    });

    // ---- upgrades tab
    const upUi = el('div', 'ok-group', root);
    const rowG = new Sketch(upUi, 0, 260, 720, 700);
    const rowY = (i: number): number => {
      const top = TOP + 340;
      const bottom = BOTTOM - 170;
      return top + i * Math.min(124, (bottom - top) / UPGRADE_IDS.length);
    };
    const buyBtns = new Map<UpgradeId, ButtonHandle>();
    const maxLabels = new Map<UpgradeId, Label>();
    UPGRADE_IDS.forEach((id, i) => {
      const y = rowY(i);
      L(text(upUi, 158, y - 24, t(`up.${id}.name`), 36, PALETTE.cream, { originX: 0, stroke: 8 }));
      L(new Label(upUi, 158, y + 20, t(`up.${id}.desc`), { size: 34, color: PALETTE.white, wrap: 380, align: 'left', originX: 0 }));
      buyBtns.set(id, button(upUi, 612, y, '', ui.unlock, () => buy(id), { width: 150, height: 88, fontSize: 36 }));
      const max = L(text(upUi, 612, y, t('shop.max'), 36, PALETTE.heal, { stroke: 8 }));
      max.setVisible(false);
      maxLabels.set(id, max);
    });
    // the bow is forged, not bought: its row leads to the forge
    const fy = rowY(UPGRADE_IDS.length);
    const bowRow = new Sketch(upUi, 20, fy - 56, 140, 112);
    const bowName = L(text(upUi, 158, fy - 24, '', 36, PALETTE.gold, { originX: 0, stroke: 8 }));
    const bowNote = L(new Label(upUi, 158, fy + 20, '', { size: 32, color: PALETTE.white, originX: 0 }));
    button(upUi, 612, fy, t('shop.forge'), ui.unlock, () => {
      ui.audio.play('tap');
      swap(forge('shop', from));
    }, { width: 150, height: 88, fontSize: 34 });

    // ---- looks tab: the preview (the 2D game's animated archer is a head portrait here) + a 4×3 grid
    const lookUi = el('div', 'ok-group', root);
    const footY = TOP + 480;
    const preview = new Sketch(lookUi, CX - 130, footY - 250, 260, 260);
    const previewName = L(text(lookUi, CX, footY + 95, '', 44, PALETTE.cream, { stroke: 10 }));
    const previewNote = L(text(lookUi, CX, footY + 142, '', 34, PALETTE.white, { stroke: 8 }));
    // four columns; a fourth row (16 looks since chapters 5 and 6) packs the grid a little tighter
    const lookRows = Math.ceil(COSMETICS.length / 4);
    const tight = lookRows > 3;
    const step = tight ? 114 : 136;
    const half = tight ? 52 : 59;
    const tiles = new Sketch(lookUi, 60, BOTTOM - 640, 600, 520);
    const tilePos = (i: number): { x: number; y: number } => ({ x: 135 + (i % 4) * 150, y: (tight ? BOTTOM - 560 : BOTTOM - 520) + Math.floor(i / 4) * step });
    let previewIdx = Math.max(0, COSMETICS.findIndex((c) => c.id === save.data.cosmetic));
    let bounce = 0;
    COSMETICS.forEach((_c, i) => {
      const p = tilePos(i);
      const z = el('div', '', lookUi);
      z.dataset.ui = '1';
      z.style.cssText = `position:absolute;left:${p.x - half}px;top:${p.y - half}px;width:${half * 2}px;height:${half * 2}px;pointer-events:auto;cursor:pointer`;
      z.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        ui.unlock();
      });
      z.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        wear(i);
      });
    });

    const back = button(root, CX, BOTTOM - 70, t('shop.back'), ui.unlock, () => {
      ui.audio.play('tap');
      hooks.back();
    }, { width: 360, height: 100, variant: 'secondary' });
    void back;

    function setTab(k: 'upgrades' | 'looks'): void {
      tab = k;
      upUi.style.display = k === 'upgrades' ? '' : 'none';
      lookUi.style.display = k === 'looks' ? '' : 'none';
      for (const [key, b] of tabBtns) b.el.style.opacity = key === k ? '1' : '0.55';
      refresh();
    }

    function refresh(): void {
      const d = save.data;
      coinText.setText(String(d.coins));
      bowName.setText(t('bow.name', { name: t(`bow.${bowTier(d.bow.level)}`), n: d.bow.level }));
      bowNote.setText(t('forge.dmg', { a: bowDamage(d.bow.level).toFixed(2), b: bowDamage(d.bow.level + 1).toFixed(2) }));
      const g = rowG.begin();
      UPGRADE_IDS.forEach((id, i) => {
        const y = rowY(i);
        g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(20, y - 56, 680, 112, 24);
        g.fillStyle(PALETTE.cream, 1).fillCircle(84, y - 10, 36);
        drawUpgradeIcon(g.phaser, id, 84, y - 10);
        const lvl = d.upgrades[id];
        const max = UPGRADES[id].max;
        const bw = 84;
        const seg = bw / max;
        g.fillStyle(PALETTE.ink, 1).fillRoundedRect(84 - bw / 2 - 4, y + 32, bw + 8, 20, 8);
        for (let k = 0; k < max; k++) g.fillStyle(k < lvl ? PALETTE.gold : PALETTE.pipOff, 1).fillRoundedRect(84 - bw / 2 + k * seg + 1, y + 35, seg - 2, 14, 4);
        const cost = upgradeCost(id, lvl);
        const b = buyBtns.get(id)!;
        const maxed = cost === null;
        b.el.style.display = maxed ? 'none' : '';
        maxLabels.get(id)!.setVisible(maxed);
        if (cost !== null) {
          b.setText(String(cost));
          b.setEnabled(d.coins >= cost);
        }
      });
      g.fillStyle(PALETTE.ink, 0.6).fillRoundedRect(20, fy - 56, 680, 112, 24);
      // looks
      const tg = tiles.begin();
      COSMETICS.forEach((cos, i) => {
        const { x, y } = tilePos(i);
        const unlocked = isUnlocked(cos, d.best, d.runs, d.bosses, d.arsenal.boughtLooks);
        const worn = d.cosmetic === cos.id;
        const sel = i === previewIdx;
        tg.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - half, y - half, half * 2, half * 2, 24);
        tg.fillStyle(worn ? PALETTE.gold : sel ? PALETTE.cream : unlocked ? PALETTE.cardIcon : PALETTE.pipOff, 1).fillRoundedRect(x - half + 7, y - half + 7, half * 2 - 14, half * 2 - 14, 20);
        drawHeadIcon(tg.phaser, x, y + 6, tight ? 23 : 26, cos, unlocked);
        if (!unlocked) {
          tg.fillStyle(PALETTE.ink, 1).fillRoundedRect(x + 18, y + 18, 28, 24, 6);
          tg.lineStyle(5, PALETTE.ink, 1).beginPath().arc(x + 32, y + 18, 9, Math.PI, 0, false).strokePath();
          tg.fillStyle(PALETTE.coin, 1).fillCircle(x + 32, y + 29, 4);
        }
      });
      const cos = COSMETICS[previewIdx]!;
      const unlocked = isUnlocked(cos, d.best, d.runs, d.bosses, d.arsenal.boughtLooks);
      previewName.setText(t(`cos.${cos.id}`));
      previewNote.setText(d.cosmetic === cos.id ? t('shop.worn') : unlocked ? '' : cos.boss !== undefined ? t('shop.boss', { b: t(`boss.${BOSS_KINDS[cos.boss]!}`) }) : cos.runs > 0 ? t('shop.runs', { n: cos.runs }) : t('shop.unlock', { n: cos.wave }));
    }

    function buy(id: UpgradeId): void {
      let ok = false;
      save.update((d) => {
        ok = buyUpgrade(d, id);
      });
      if (ok) {
        ui.audio.play('coin');
        burst(root, 612, rowY(UPGRADE_IDS.indexOf(id)), PALETTE.gold);
        coinText.el.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 260, easing: EASE.backOut });
      }
      refresh();
    }

    function wear(i: number): void {
      const cos = COSMETICS[i];
      if (!cos) return;
      previewIdx = i;
      if (!isUnlocked(cos, save.data.best, save.data.runs, save.data.bosses, save.data.arsenal.boughtLooks)) {
        ui.audio.playPreset(SFX.cancel);
        refresh();
        return;
      }
      save.update((d) => {
        d.cosmetic = cos.id;
      });
      ui.audio.play('pop');
      bounce = 1;
      refresh();
    }

    setTab(startTab);
    return {
      root,
      update(real) {
        clock += real;
        if (tab === 'upgrades') {
          const g = bowRow.begin();
          g.fillStyle(PALETTE.cream, 1).fillCircle(84, fy, 40);
          drawBowItem(g.phaser, 88, fy, 30, save.data.bow.level, clock);
          drawGlow(g, 88, fy, 30, save.data.bow.level, clock);
          return;
        }
        bounce = Math.max(0, bounce - real * 2);
        const g = preview.begin();
        const cos = COSMETICS[previewIdx]!;
        const hop = Math.abs(Math.sin(bounce * Math.PI * 2)) * 18 * bounce;
        g.fillStyle(PALETTE.ink, 0.35).fillEllipse(CX, footY - 8, 170, 26);
        drawHeadIcon(g.phaser, CX, footY - 110 - hop + Math.sin(clock * 2) * 4, 72, cos, isUnlocked(cos, save.data.best, save.data.runs, save.data.bosses, save.data.arsenal.boughtLooks));
      },
      destroy() {
        for (const l of labels) l.destroy();
        root.remove();
      },
    };
  }

  /** a few stars bursting from a point (juice.burst) */
  function burst(root: HTMLElement, x: number, y: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const s = el('div', '', root);
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const d = 60 + Math.random() * 80;
      s.style.cssText = `position:absolute;left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;background:${css(color)};box-shadow:0 0 0 3px ${css(PALETTE.ink)};pointer-events:none`;
      const an = s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0.3)`, opacity: 0 }], { duration: 520, easing: EASE.cubicOut, fill: 'forwards' });
      an.onfinish = () => s.remove();
    }
  }

  // ---------------------------------------------------------------- forge (ForgeScene)

  function forge(from: From, shopFrom: From = 'title'): Screen {
    const root = screenRoot(parent, 'transparent');
    const labels: Label[] = [];
    const L = (l: Label): Label => {
      labels.push(l);
      return l;
    };
    const timers = new Timers();
    const tweens = new Tweens();
    const d0 = save.data;
    let busy = false;
    let shownLevel = d0.bow.level;
    let shownHeat = d0.bow.heat;
    let flash = 0;
    let lift = 0;
    let shake = 0;
    let dim = 0;
    let clock = 0;
    let flare = 0;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; c: number }[] = [];
    const ay = CY + 170;
    // a warm smithy over the 3D scene: dark stone, a glowing hearth behind the anvil
    const bg = new Sketch(root, 0, 0, 720, 1280);
    {
      const g = bg.begin();
      g.fillStyle(0x2a1622, 0.9).fillRect(0, 0, 720, 1280);
      for (let i = 0; i < 16; i++) g.fillStyle(mix(0x1d1020, 0x5a2a1e, i / 15), 1).fillRect(0, (i * 1280) / 16 - 40, 720, 1280 / 16 + 2);
      for (let r = 0; r < 6; r++) g.fillStyle(PALETTE.heat, 0.06 + r * 0.025).fillCircle(CX, CY + 80, 420 - r * 60);
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 5; col++) {
          const x = col * 170 + (row % 2) * 85 - 40;
          g.lineStyle(3, 0x14080f, 0.5).strokeRoundedRect(x, 60 + row * 130, 160, 120, 16);
        }
      }
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(CX - 190, ay - 40, 380, 90, 24);
      g.fillStyle(0x5c6378, 1).fillRoundedRect(CX - 180, ay - 32, 360, 74, 18);
      g.fillStyle(0x8a93ab, 1).fillRoundedRect(CX - 170, ay - 28, 340, 22, 10);
      g.fillStyle(PALETTE.ink, 1).fillRect(CX - 70, ay + 40, 140, 90).fillRoundedRect(CX - 130, ay + 120, 260, 50, 14);
      g.fillStyle(0x4a5064, 1).fillRect(CX - 60, ay + 46, 120, 78).fillRoundedRect(CX - 122, ay + 126, 244, 38, 10);
    }
    L(text(root, CX, TOP + 70, t('forge.title'), 60, PALETTE.cream, { stroke: 14 }));
    const coinG = new Sketch(root, CX - 76, TOP + 114, 52, 52);
    drawCoin(coinG.begin().phaser, CX - 50, TOP + 140, 20);
    const coinText = L(text(root, CX - 20, TOP + 140, '', 46, PALETTE.coin, { originX: 0, stroke: 10 }));
    const nameText = L(text(root, CX, TOP + 220, '', 56, PALETTE.gold, { stroke: 14 }));
    const dmgText = L(text(root, CX, TOP + 282, '', 34, PALETTE.cream, { stroke: 8 }));
    const live = new Sketch(root, 0, 0, 720, 1280);
    const nextText = L(text(root, 92, CY + 50, '', 22, PALETTE.cream, { wrap: 170, stroke: 6 }));
    const glowWrap = el('div', 'ok-group', root);
    let glowText = L(text(glowWrap, CX, TOP + 312, '', 30, PALETTE.cream, { stroke: 8 }));
    // the hammer, raised to the right of the anvil
    const hammer = el('div', 'ok-anchor', root);
    hammer.style.left = `${CX + 150}px`;
    hammer.style.top = `${ay - 40}px`;
    const hs = new Sketch(hammer, -60, -230, 120, 250);
    {
      const g = hs.begin();
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-9, -180, 18, 190, 8);
      g.fillStyle(PALETTE.shaft, 1).fillRoundedRect(-5, -176, 10, 182, 5);
      g.fillStyle(PALETTE.ink, 1).fillRoundedRect(-52, -224, 104, 60, 14);
      g.fillStyle(0x8a93ab, 1).fillRoundedRect(-46, -218, 92, 48, 10);
      g.fillStyle(PALETTE.white, 0.4).fillRoundedRect(-40, -214, 50, 12, 6);
    }
    hammer.style.transform = 'rotate(35deg)';
    let chanceText = L(text(root, CX, ay + 150, '', 46, PALETTE.heal, { stroke: 12 }));
    const heatText = L(text(root, CX, ay + 240, '', 28, PALETTE.heat, { stroke: 8 }));
    const rules = L(new Label(root, CX, TOP + 372, t('forge.rules'), { size: 24, color: PALETTE.cream, wrap: 640 }));
    rules.el.style.opacity = '0.85';
    const verdict = el('div', 'ok-group', root);
    const fx = new Sketch(root, 0, 0, 720, 1280);
    const forgeBtn = button(root, CX, BOTTOM - 168, '', ui.unlock, () => doForge(), { width: 440, height: 100, fontSize: 42 });
    const backBtn = button(root, CX, BOTTOM - 60, t('forge.back'), ui.unlock, () => {
      if (busy) return;
      ui.audio.play('tap');
      if (from === 'shop') swap(shop(shopFrom));
      else hooks.back();
    }, { width: 300, height: 88, variant: 'secondary' });
    let lastColorKey = '';
    let chanceShownColor = -1;

    function refresh(): void {
      const d = save.data;
      const lv = shownLevel;
      coinText.setText(String(d.coins));
      nameText.setText(t('bow.name', { name: t(`bow.${bowTier(lv)}`), n: lv }));
      const band = glowBand(lv);
      const gc = band === 0 ? PALETTE.locked : band === GLOW_BANDS.length - 1 ? PALETTE.white : GLOW_BANDS[band]!.color;
      const gs = t('forge.glow', { g: t(`glow.${GLOW_BANDS[band]!.id}`) });
      if (`${gs}|${gc}` !== lastColorKey) {
        // a Label's colour is fixed: rebuild it when the band changes
        lastColorKey = `${gs}|${gc}`;
        const op = glowText.el.style.opacity;
        glowText.destroy();
        labels.splice(labels.indexOf(glowText), 1);
        glowText = L(text(glowWrap, CX, TOP + 312, gs, 30, gc, { stroke: 8 }));
        glowText.el.style.opacity = op;
      }
      const nb = nextGlowBand(lv);
      nextText.setText(nb ? `${t('forge.nextGlow', { n: nb.from })}\n${t(`glow.${GLOW_BANDS[nb.band]!.id}`)}` : '');
      const cost = bowCost(d.bow.level);
      let chance = t('forge.max');
      let chanceColor: number = PALETTE.heal;
      if (cost === null) {
        dmgText.setText(`×${bowDamage(lv).toFixed(2)}`);
        forgeBtn.setText(t('forge.max'));
        forgeBtn.setEnabled(false);
      } else {
        dmgText.setText(t('forge.dmg', { a: bowDamage(d.bow.level).toFixed(2), b: bowDamage(d.bow.level + 1).toFixed(2) }));
        const ch = forgeChance(d.bow.level, d.bow.heat);
        chance = ch >= 1 ? t('forge.sure') : t('forge.chance', { n: Math.round(ch * 100) });
        chanceColor = ch >= 0.75 ? PALETTE.heal : ch >= 0.4 ? PALETTE.coin : PALETTE.powerHigh;
        forgeBtn.setText(t('forge.go', { n: cost }));
        forgeBtn.setEnabled(!busy && d.coins >= cost);
      }
      if (chanceText.text !== chance || chanceShownColor !== chanceColor) {
        chanceShownColor = chanceColor;
        chanceText.destroy();
        labels.splice(labels.indexOf(chanceText), 1);
        chanceText = L(text(root, CX, ay + 150, chance, 46, chanceColor, { stroke: 12 }));
        root.insertBefore(chanceText.el, verdict);
      }
      heatText.setText(shownHeat > 0 ? t('forge.heat', { n: Math.round(shownHeat * 100) }) : '');
    }

    function spray(x: number, y: number, n: number, c: number): void {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 200 + Math.random() * 520;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, c });
      }
    }

    function reveal(head: string, sub: string, color: number): void {
      verdict.replaceChildren();
      const big = new Label(verdict, CX, TOP + 330, head, { size: 76, color, stroke: 18 });
      const small = new Label(verdict, CX, TOP + 400, sub, { size: 34, color: PALETTE.cream, wrap: 620, stroke: 8 });
      labels.push(big, small);
      big.el.animate([{ transform: 'scale(2.2)' }, { transform: 'scale(1)' }], { duration: 280, easing: EASE.backOut });
      small.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 200, fill: 'backwards' });
      for (const l of [big, small]) l.el.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 2200, duration: 400, fill: 'forwards' });
      // the rules make room for the verdict, then come back
      for (const e of [rules.el, glowWrap]) {
        e.getAnimations().forEach((a) => a.cancel());
        e.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 0.9 }], { duration: 2900, easing: 'linear', fill: 'forwards' });
      }
    }

    function doForge(): void {
      if (busy) return;
      let res: ForgeResult | null = null;
      const before = save.data.bow.level;
      save.update((d) => {
        res = attemptForge(d.bow, d);
        if (res.ok && res.success) unlockFeats(d, null);
      });
      const r = res as ForgeResult | null;
      if (!r || !r.ok) {
        ui.audio.playPreset(SFX.cancel);
        refresh();
        return;
      }
      busy = true;
      forgeBtn.setEnabled(false);
      backBtn.setEnabled(false);
      // 1. build-up: the bow rises and glows, the hearth hums
      ui.audio.playPreset(SFX.charge);
      tweens.add({ set: (v) => (lift = v), from: lift, to: 1, dur: 0.45, delay: 0, ease: ease.sineOut });
      // 2. three strikes, each harder
      for (let i = 0; i < 3; i++) {
        timers.after(0.48 + i * 0.3, () => {
          hammer.animate([{ transform: 'rotate(35deg)' }, { transform: 'rotate(-60deg)', offset: 0.41 }, { transform: 'rotate(-60deg)', offset: 0.59 }, { transform: 'rotate(35deg)' }], { duration: 220, easing: 'ease-in' });
          timers.after(0.09, () => {
            ui.audio.playPreset(SFX.anvil, { pitch: i * 2 });
            flare = 0.6 + i * 0.4;
            flash = 0.6 + i * 0.2;
            shake = 6 + i * 4;
            ui.stage.shake(0.12 + i * 0.06);
            spray(CX, ay - 50, 16 + i * 8, i === 2 ? auraColor(before + 1, clock) : PALETTE.fireCore);
          });
        });
      }
      // 3. the payoff
      timers.after(1.45, () => (r.success ? success(before) : fail()));
    }

    function success(before: number): void {
      const lv = save.data.bow.level;
      const newTier = bowTier(lv) !== bowTier(before);
      const newBand = glowBand(lv) !== glowBand(before);
      flare = newBand ? 3.5 : 2;
      shownLevel = lv;
      shownHeat = 0;
      flash = 1.4;
      dim = 0;
      ui.audio.playPreset(SFX.fanfare);
      spray(CX, CY - 20, newTier ? 70 : 40, auraColor(lv, clock));
      if (newTier) spray(CX, CY - 20, 40, PALETTE.gold);
      const sub = newBand ? t('forge.newGlow', { g: t(`glow.${GLOW_BANDS[glowBand(lv)]!.id}`) }) : newTier ? `${t('forge.newTier')} ${t(`bow.${bowTier(lv)}`)}` : t('bow.name', { name: t(`bow.${bowTier(lv)}`), n: lv });
      if (newBand) {
        const w = el('div', 'ok-scrim', root);
        w.style.cssText += `;background:#fff;pointer-events:none`;
        w.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => w.remove();
        ui.stage.shake(0.6);
      }
      reveal(t('forge.success'), sub, PALETTE.gold);
      refresh();
      nameText.el.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 400, easing: EASE.backOut });
      done();
    }

    function fail(): void {
      dim = 1;
      ui.audio.playPreset(SFX.sizzle);
      // steam and a wobble; the heat meter rises (the next try is easier)
      for (let i = 0; i < 14; i++) sparks.push({ x: CX + (Math.random() - 0.5) * 200, y: CY, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 120, life: 1.2, c: 0xdddddd });
      shake = 10;
      tweens.add({ set: (v) => {
        shownHeat = v;
        refresh();
      }, from: shownHeat, to: save.data.bow.heat, dur: 0.7, delay: 0, ease: ease.cubicOut });
      reveal(t('forge.fail'), t('forge.failSub', { n: Math.round(HEAT_STEP * 100) }), PALETTE.locked);
      done();
    }

    function done(): void {
      tweens.add({ set: (v) => (lift = v), from: 1, to: 0, dur: 0.6, delay: 0.6, ease: ease.sineInOut });
      tweens.add({ set: (v) => (dim = v), from: dim, to: 0, dur: 0.9, delay: 0.9, ease: ease.linear });
      timers.after(1.1, () => {
        busy = false;
        backBtn.setEnabled(true);
        refresh();
      });
      refresh();
    }

    refresh();
    return {
      root,
      update(real) {
        const dt = Math.min(real, 0.1);
        clock += dt;
        timers.update(dt);
        tweens.update(dt);
        flash = Math.max(0, flash - dt * 2.5);
        shake = Math.max(0, shake - dt * 30);
        flare = Math.max(0, flare - dt * 2);
        const g = live.begin();
        const lv = shownLevel;
        const bx = CX + (Math.random() - 0.5) * shake;
        const by = CY - 60 - lift * 40 + Math.sin(clock * 1.6) * 8;
        const col = auraColor(lv, clock);
        g.fillStyle(lv >= 3 ? col : PALETTE.heat, 0.12 + lift * 0.25).fillCircle(bx, by, 140 + lift * 40);
        drawBowItem(g.phaser, bx, by, 135, lv, clock, flash);
        if (dim < 0.5) drawGlow(g, bx, by, 135, lv, clock, lift + flare);
        if (dim > 0) g.fillStyle(0x2a1622, 0.45 * dim).fillCircle(bx, by, 160);
        // what the next band looks like
        const nb = nextGlowBand(lv);
        if (nb) {
          const nx = 92;
          const ny = CY - 70;
          g.fillStyle(PALETTE.ink, 0.55).fillRoundedRect(nx - 82, ny - 96, 164, 210, 22);
          drawBowItem(g.phaser, nx + 8, ny, 62, nb.from, clock);
          drawGlow(g, nx + 8, ny, 62, nb.from, clock);
        }
        // heat meter: a bar of flames, full = sure success
        const d = save.data;
        if (bowCost(d.bow.level) !== null && d.bow.level < BOW_MAX) {
          const hx = CX - 200;
          const hy = CY + 365;
          g.fillStyle(PALETTE.ink, 1).fillRoundedRect(hx - 6, hy - 18, 412, 36, 18);
          g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(hx, hy - 12, 400, 24, 12);
          const k = Math.min(1, shownHeat / Math.max(0.01, 1 - forgeChance(d.bow.level, 0) + 0.0001));
          if (shownHeat > 0) {
            g.fillStyle(PALETTE.heat, 1).fillRoundedRect(hx, hy - 12, Math.max(24, 400 * k), 24, 12);
            for (let i = 0; i < 5; i++) g.fillStyle(PALETTE.fireCore, 0.8).fillCircle(hx + 400 * k * ((i + 0.5) / 5), hy - 14, 6 + Math.sin(clock * 12 + i) * 3);
          }
        }
        // sparks
        const f = fx.begin();
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]!;
          s.life -= dt;
          if (s.life <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          const steam = s.c === 0xdddddd;
          s.vy += 900 * dt * (steam ? -0.1 : 1);
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          f.fillStyle(s.c, Math.min(1, s.life * 2)).fillCircle(s.x, s.y, steam ? 14 * (1.4 - s.life) : 4);
        }
      },
      destroy() {
        for (const l of labels) l.destroy();
        root.remove();
      },
    };
  }

  // ---------------------------------------------------------------- ranks (RanksScene)

  function ranks(): Screen {
    const root = screenRoot(parent, rgba(PALETTE.ink, 0.55));
    const labels: Label[] = [];
    let tab: 'ladder' | 'records' | 'feats' = 'ladder';
    let clock = 0;
    labels.push(text(root, CX, TOP + 66, t('ranks.title'), 58, PALETTE.cream, { stroke: 14 }));
    // Online ranking (Google Play Games): the shared panel from @oyun/core/online.
    const onlineBtn = button(root, 648, TOP + 66, '🌐', ui.unlock, () => {
      ui.audio.play('tap');
      openOnline();
    }, { width: 96, height: 88, fontSize: 44, variant: 'secondary' });
    onlineBtn.el.dataset.testid = 'ranks-online';
    onlineBtn.el.setAttribute('aria-label', t('ranks.online'));
    const tabBtns = new Map<string, ButtonHandle>();
    (['ladder', 'records', 'feats'] as const).forEach((k, i) => {
      const key = k === 'ladder' ? 'ranks.tabLadder' : k === 'records' ? 'ranks.tabRecords' : 'ranks.tabFeats';
      tabBtns.set(k, button(root, CX + (i - 1) * 222, TOP + 156, t(key), ui.unlock, () => setTab(k), { width: 210, height: 84, fontSize: 34, variant: 'secondary' }));
    });
    const body = el('div', 'ok-group', root);
    let bodyLabels: Label[] = [];
    const badges = new Sketch(root, 0, 200, 720, 1000);
    button(root, CX, BOTTOM - 66, t('shop.back'), ui.unlock, () => {
      ui.audio.play('tap');
      hooks.back();
    }, { width: 320, height: 92, variant: 'secondary' });

    // `fit`: the 2D game wraps here, which overlaps the row below with the longer Turkish texts; one shrunk line instead
    const tx = (x: number, y: number, s: string, size: number, color: number, originX = 0.5, fit?: number): Label => {
      const l = new Label(body, x, y, s, { size, color, originX, stroke: Math.max(4, Math.round(size / 5)) });
      if (fit && l.width > fit) l.setScale(fit / l.width);
      bodyLabels.push(l);
      return l;
    };
    const ladderTop = TOP + 650;
    /** two columns of ranks (seven a column since chapters 5 and 6 added two) */
    const perCol = Math.ceil(RANKS.length / 2);
    const ladderRow = Math.min(88, (BOTTOM - 140 - ladderTop) / perCol);

    function setTab(k: 'ladder' | 'records' | 'feats'): void {
      tab = k;
      for (const [key, b] of tabBtns) b.el.style.opacity = key === k ? '1' : '0.55';
      for (const l of bodyLabels) l.destroy();
      bodyLabels = [];
      body.replaceChildren();
      const sheet = new Sketch(body, 0, 200, 720, 1000);
      const g = sheet.begin();
      const d = save.data;
      if (k === 'ladder') {
        const s = progressScore(d);
        const r = rankOf(s.total);
        tx(CX + 40, TOP + 256, t(`rank.${RANKS[r]!.id}`), 50, PALETTE.gold);
        tx(CX + 40, TOP + 306, t('ranks.score', { n: s.total }), 34, PALETTE.cream);
        const need = toNextRank(s.total);
        tx(CX, TOP + 350, need === null ? t('ranks.top') : t('ranks.next', { n: need, r: t(`rank.${RANKS[r + 1]!.id}`) }), 30, PALETTE.heal);
        const parts: [string, number, number][] = [
          ['chapters', s.chapters, SCORE.chapter],
          ['bosses', s.bosses, SCORE.boss],
          ['bow', s.bow, SCORE.bow],
          ['wave', s.wave, SCORE.wave],
          ['feats', s.feats, SCORE.feat],
        ];
        parts.forEach(([key, pts, per], i) => {
          const y = TOP + 410 + i * 42;
          g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(60, y - 18, 600, 36, 14);
          tx(80, y, t(`ranks.part.${key}`, { k: per }), 28, PALETTE.cream, 0);
          tx(640, y, String(pts), 30, PALETTE.gold, 1);
        });
        RANKS.forEach((rk, i) => {
          const x = 70 + Math.floor(i / perCol) * 330;
          const y = ladderTop + (i % perCol) * ladderRow;
          const here = i === r;
          g.fillStyle(here ? PALETTE.gold : PALETTE.ink, here ? 0.35 : 0.5).fillRoundedRect(x - 40, y - ladderRow / 2 + 4, 310, ladderRow - 8, 16);
          tx(x + 46, y - 12, t(`rank.${rk.id}`), 28, i <= r ? PALETTE.cream : PALETTE.locked, 0);
          tx(x + 46, y + 18, t('ranks.at', { n: rk.at }), 24, i <= r ? PALETTE.gold : PALETTE.locked, 0);
        });
      } else if (k === 'records') {
        const rec = d.records;
        const none = t('rec.none');
        const row = (y: number, left: string, right: string, date: string, mid?: string): void => {
          g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(40, y - 26, 640, 52, 16);
          tx(60, y, left, 28, PALETTE.cream, 0, mid === undefined ? 330 : 250);
          if (mid !== undefined) tx(440, y, mid, 26, mid === none ? PALETTE.locked : PALETTE.gold, 1, 120);
          tx(mid === undefined ? 560 : 580, y, right, 28, right === none ? PALETTE.locked : PALETTE.gold, 1, mid === undefined ? undefined : 120);
          tx(668, y, date ? date.slice(5) : '', 22, PALETTE.locked, 1);
        };
        // one row a chapter (six since chapters 5 and 6): furthest stage, then the fastest boss
        let y = TOP + 250;
        tx(CX, y, `${t('rec.bestsTitle')} · ${t('rec.bossTitle')}`, 32, PALETTE.heal, 0.5, 640);
        y += 52;
        for (let c = 0; c < CHAPTERS; c++) {
          const r = rec.chapter[c]!;
          const b = rec.bossTime[c]!;
          row(y, t('rec.chapter', { c: t(`chapter.${c}`) }), b.n === 0 ? none : t('rec.sec', { n: b.n }), b.date || r.date, r.n === 0 ? none : r.n > 7 ? t('rec.cleared') : t('rec.stage', { n: r.n }));
          y += 60;
        }
        y += 16;
        tx(CX, y, t('rec.moreTitle'), 34, PALETTE.heal);
        y += 52;
        for (const [key, r] of [
          ['rec.chain', rec.headChain],
          ['rec.streak', rec.streak],
          ['rec.kos', rec.runKos],
          ['rec.endless', rec.endless],
        ] as const) {
          if (y > BOTTOM - 150) break;
          row(y, t(key), r.n === 0 ? none : String(r.n), r.date);
          y += 60;
        }
      } else {
        tx(CX, TOP + 246, t('ranks.featCount', { n: d.feats.length, m: FEATS.length, c: SCORE.feat }), 28, PALETTE.cream);
        const top = TOP + 300;
        const rows = Math.ceil(FEATS.length / 2);
        const rowH = Math.min(84, (BOTTOM - 140 - top) / rows);
        FEATS.forEach((f, i) => {
          const x = 22 + (i % 2) * 342;
          const y = top + Math.floor(i / 2) * rowH + rowH / 2;
          const on = d.feats.includes(f.id);
          g.fillStyle(on ? PALETTE.gold : PALETTE.ink, on ? 0.3 : 0.5).fillRoundedRect(x, y - rowH / 2 + 3, 334, rowH - 6, 14);
          const sx = x + 30;
          g.fillStyle(PALETTE.ink, 1).fillCircle(sx, y, 18);
          g.fillStyle(on ? PALETTE.gold : PALETTE.pipOff, 1);
          for (let p = 0; p < 5; p++) {
            const a = -Math.PI / 2 + (p * Math.PI * 2) / 5;
            g.fillTriangle(sx, y, sx + Math.cos(a - 0.35) * 6, y + Math.sin(a - 0.35) * 6, sx + Math.cos(a) * 14, y + Math.sin(a) * 14);
            g.fillTriangle(sx, y, sx + Math.cos(a + 0.35) * 6, y + Math.sin(a + 0.35) * 6, sx + Math.cos(a) * 14, y + Math.sin(a) * 14);
          }
          tx(x + 56, y - 14, t(`feat.${f.id}.name`), 27, on ? PALETTE.cream : PALETTE.locked, 0, 268);
          tx(x + 56, y + 16, `${t(`feat.${f.id}.desc`)} · +${f.coins}`, 22, on ? PALETTE.gold : PALETTE.locked, 0, 268);
        });
      }
    }

    setTab('ladder');
    return {
      root,
      update(real) {
        clock += real;
        const g = badges.begin();
        if (tab !== 'ladder') return;
        const r = rankOf(progressScore(save.data).total);
        drawBadge(g.phaser, 150, TOP + 280, 52, r, clock);
        RANKS.forEach((_rk, i) => drawBadge(g.phaser, 70 + Math.floor(i / perCol) * 330, ladderTop + (i % perCol) * ladderRow, 24, i, clock, i > r));
      },
      destroy() {
        for (const l of [...labels, ...bodyLabels]) l.destroy();
        root.remove();
      },
    };
  }

  // ---------------------------------------------------------------- rank-up ceremony (ResultScene.playRankUp)

  function closeCeremony(): void {
    const c = ceremony;
    if (!c) return;
    ceremony = null;
    window.clearTimeout(c.timer);
    c.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => {
      for (const l of c.labels) l.destroy();
      c.root.remove();
    };
  }

  function rankUp(rank: number): void {
    closeCeremony();
    const root = el('div', 'ok-group', parent);
    const scrim = el('div', 'ok-scrim', root);
    scrim.dataset.ui = '1';
    scrim.style.background = rgba(PALETTE.ink, 0.7);
    scrim.addEventListener('pointerdown', (e) => e.stopPropagation());
    scrim.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      closeCeremony();
    });
    const cy = CY - 80;
    const rays = new Sketch(root, CX - 430, cy - 430, 860, 860);
    {
      const g = rays.begin();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.fillStyle(i % 2 ? PALETTE.gold : PALETTE.cream, 0.45).fillTriangle(CX, cy, CX + Math.cos(a - 0.1) * 420, cy + Math.sin(a - 0.1) * 420, CX + Math.cos(a + 0.1) * 420, cy + Math.sin(a + 0.1) * 420);
      }
    }
    rays.cv.animate([{ transform: 'scale(0.3) rotate(0deg)' }, { transform: 'scale(1.1) rotate(120deg)' }], { duration: 2600, easing: EASE.cubicOut, fill: 'forwards' });
    const badge = new Sketch(root, CX - 150, cy - 150, 300, 300);
    drawBadge(badge.begin().phaser, CX, cy, 110, rank, 0);
    badge.cv.animate([{ transform: 'scale(3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: EASE.backOut, fill: 'backwards' }).onfinish = () => ui.stage.shake(0.5);
    const title = new Label(root, CX, CY - 300, t('rankup.title'), { size: 80, color: PALETTE.gold, stroke: 18 });
    title.el.animate([{ transform: 'scale(0.2)' }, { transform: 'scale(1)' }], { duration: 360, delay: 200, easing: EASE.backOut, fill: 'backwards' });
    const name = new Label(root, CX, CY + 110, t(`rank.${RANKS[rank]!.id}`), { size: 64, color: PALETTE.cream, stroke: 14 });
    name.el.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'translateY(-10px)' }], { duration: 300, delay: 520, fill: 'both' });
    ui.audio.playPreset(SFX.fanfare);
    ceremony = { root, labels: [title, name], timer: window.setTimeout(closeCeremony, 3400) };
  }

  return {
    get open() {
      return screen !== null;
    },
    get pauseOpen() {
      return pause !== null;
    },
    get ceremonyOpen() {
      return ceremony !== null;
    },
    openShop(from, tab) {
      swap(shop(from, tab));
    },
    openForge(from) {
      swap(forge(from));
    },
    openRanks() {
      swap(ranks());
    },
    openPause,
    closePause,
    rankUp,
    update(real) {
      screen?.update(real);
    },
    closeAll() {
      swap(null);
      closePause();
      closeCeremony();
    },
  };
}

function mix(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
