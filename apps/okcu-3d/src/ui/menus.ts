/**
 * The menu screens of the 2D game as DOM overlays over the 3D scene: the pause menu (core
 * PauseScene), ranks / records / achievements
 * (RanksScene) and the rank-up ceremony (ResultScene.playRankUp). Same layout (logical px),
 * texts, numbers, sounds and drawings (the game's own `drawBadge`, `drawHeadIcon`, `drawCoin` run
 * on canvases through Gfx). Every rule is the game's: isUnlocked, progressScore …
 *
 * The 3D build plays 'hard', where the forge is retired (weapons level up instead) and the four
 * permanent upgrades live on the Weapons tab's archer card (weapons.ts); so there is no forge
 * screen here. The shop (offers, chests, looks) is the main menu's Shop tab (shop.ts).
 */
import { drawBadge } from '@okcu/scenes/gear';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { CHAPTERS } from '@sim/chapters';
import { FEATS, progressScore, RANKS, rankOf, SCORE, toNextRank } from '@sim/progress';
import { button, calmMotion, EASE, el, Label, roundButton, Sketch, type ButtonHandle, type LabelOpts } from './dom';
import { css, rgba } from './gfx';
import { growBar } from './juice';
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

export type From = 'title' | 'result';

interface Screen {
  root: HTMLElement;
  update(real: number): void;
  destroy(): void;
}

export interface Menus {
  /** a full-screen menu (the ranks) is up */
  readonly open: boolean;
  readonly pauseOpen: boolean;
  readonly ceremonyOpen: boolean;
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
  /** the ranks were closed with Back (2D: `goTo(SCENES.game, {})`, a fresh title) */
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

    /** the tab's page arrives: its sheet rises and its lines follow from the top down (reduced motion: it is simply there) */
    function arrive(sheet: Sketch): void {
      if (calmMotion()) return;
      sheet.cv.animate([{ transform: 'translateY(22px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: EASE.cubicOut });
      for (const l of bodyLabels) {
        const y = parseFloat(l.el.style.top) || 0;
        // on top of the label's own fit scale, so a shrunk line stays shrunk while it moves
        l.el.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { delay: Math.max(0, Math.min(420, (y - 240) * 0.42)), duration: 260, easing: EASE.cubicOut, fill: 'backwards', composite: 'add' });
      }
    }

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
        if (need !== null) {
          // how far along this rank is: a bar from its threshold to the next one's, filling as the page arrives
          const a = RANKS[r]!.at;
          const b = RANKS[r + 1]!.at;
          const bar = el('div', '', body);
          bar.style.cssText = `position:absolute;left:180px;top:${TOP + 373}px;width:360px;height:12px;border-radius:6px;background:${rgba(PALETTE.ink, 0.7)};box-shadow:0 0 0 3px ${rgba(PALETTE.ink, 0.7)};overflow:hidden`;
          const fill = el('div', '', bar);
          fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:${(Math.max(0.03, Math.min(1, (s.total - a) / Math.max(1, b - a))) * 100).toFixed(1)}%;border-radius:6px;background:linear-gradient(180deg,#b9ffcf,${css(PALETTE.heal)})`;
          growBar(fill, 0.03, 320, 800);
        }
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
          // the 3D build's "bow" points also count the weapons owned past the bow (progressScore): one "Weapons" row, no single multiplier
          tx(80, y, key === 'bow' ? t('ranks.part.weapons') : t(`ranks.part.${key}`, { k: per }), 28, PALETTE.cream, 0);
          tx(640, y, String(pts), 30, PALETTE.gold, 1);
        });
        RANKS.forEach((rk, i) => {
          const x = 70 + Math.floor(i / perCol) * 330;
          const y = ladderTop + (i % perCol) * ladderRow;
          const here = i === r;
          g.fillStyle(here ? PALETTE.gold : PALETTE.ink, here ? 0.35 : 0.5).fillRoundedRect(x - 40, y - ladderRow / 2 + 4, 310, ladderRow - 8, 16);
          if (here) {
            // the player's own rung: a gold rim that breathes (under the texts)
            const rim = document.createElement('div');
            rim.style.cssText = `position:absolute;left:${x - 40}px;top:${y - ladderRow / 2 + 4}px;width:310px;height:${ladderRow - 8}px;border-radius:16px;box-shadow:inset 0 0 0 4px ${css(PALETTE.gold)};pointer-events:none`;
            body.insertBefore(rim, sheet.cv.nextSibling);
            if (!calmMotion()) rim.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 900, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
          }
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
      arrive(sheet);
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
