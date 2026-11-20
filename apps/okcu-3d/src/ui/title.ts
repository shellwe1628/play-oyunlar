/**
 * The main menu of the 3D build, over the live 3D scene.
 *
 * Two states:
 * - menu:  a status bar (rank chip, coins, sound), the hanging wooden sign with the wobbly noodle
 *          letters, the chapter picker (or the daily card), one big PLAY button and a dock of
 *          round medallions (upgrades, looks, forge, ranks, daily).
 * - ready: PLAY swept the menu away; only the "pull back & let go" hint, the menu button and the
 *          sound button are left, so the whole field is free for the first shot.
 * The first shot starts the run from either state (dragging on the open sky works in the menu
 * too), exactly as before; the result screen's Replay comes straight back in the ready state.
 *
 * Everything lives in the HUD's logical 720 × 1280 layer; the top bar and the dock follow the real
 * screen edges and safe areas (`Ui.view`), so tall phones put the extra height between them.
 */
import { drawHeadIcon } from '@okcu/scenes/art';
import { drawBadge, drawBowItem } from '@okcu/scenes/gear';
import { drawCoin } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { bowCost, bowTier } from '@sim/bow';
import { CHAPTERS } from '@sim/chapters';
import { cosmeticById, UPGRADE_IDS, upgradeCost } from '@sim/meta';
import { dailyChallenge, liveStreak, progressScore, RANKS, rankOf } from '@sim/progress';
import type { World } from '@sim/world';
import { EASE, el, Label, labelRes, pressable, roundButton, textWidth } from './dom';
import { css, Gfx, rgba } from './gfx';
import { todayKey } from './save';
import type { Ui } from './screens';

const CX = 360;
const INK = PALETTE.ink;

export interface TitleScreen {
  readonly shown: boolean;
  /** the menu was put away with PLAY: the field is clear and waits for the first shot */
  readonly ready: boolean;
  show(w: World): void;
  hide(): void;
  /** the same title laid out again (resize, fonts), without the entrance */
  relayout(): void;
  /** a tap instead of a drag: the hint (or the PLAY button) jumps */
  nudge(): void;
  clear(): void;
}

/** The menu's ways out: upgrades, looks (the shop's cosmetics tab), forge, ranks, daily, chapter select. */
export interface TitleHooks {
  shop: () => void;
  looks: () => void;
  forge: () => void;
  ranks: () => void;
  daily: () => void;
  /** chapter select: the next (1) or previous (-1) chapter reached, wrapping round */
  chapter: (dir: 1 | -1) => void;
}

/** One colour per world (chapter theme order), for the chapter picker's island and rim. */
const WORLD_TINT = [0x6fdc4f, 0x9fe8ff, 0xffb24a, 0x8f7bff, 0xff6b3a, 0xf5e27a, 0xff6fb5];

const STYLE = `
.ok-m-part{position:absolute;width:0;height:0}
.ok-m-bar{position:absolute;left:0;width:720px;height:120px;display:flex;align-items:center;gap:14px;padding:0 128px 0 18px}
.ok-m-glass{background:${rgba(INK, 0.74)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(INK, 0.35)}}
.ok-m-chip{position:relative;height:88px;border-radius:44px;display:flex;align-items:center;gap:8px;padding:0 26px 0 8px;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .09s ease-out;min-width:0}
.ok-m-chip.down{transform:scale(.94)}
.ok-m-chip .t1{font-size:30px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-m-chip .t2{font-size:24px;line-height:1;margin-top:6px;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-m-coins{height:66px;border-radius:33px;display:flex;align-items:center;gap:8px;padding:0 22px 0 9px;font-size:36px;color:${css(PALETTE.coin)};margin-left:auto;white-space:nowrap}
.ok-m-round{background:${rgba(INK, 0.74)}!important;box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(INK, 0.35)}!important}
.ok-m-burger{position:absolute;left:28px;right:28px;height:7px;border-radius:4px;background:${css(PALETTE.cream)}}
.ok-m-rope{position:absolute;width:10px;border-radius:5px;background:repeating-linear-gradient(160deg,#e8cf9f 0 9px,#b98d55 9px 13px);box-shadow:0 0 0 3px ${css(INK)}}
.ok-m-board{position:absolute;border-radius:26px;border:6px solid ${css(INK)};background:
  radial-gradient(circle at 22px 22px,${css(INK)} 0 5px,transparent 6px),
  radial-gradient(circle at calc(100% - 22px) 22px,${css(INK)} 0 5px,transparent 6px),
  repeating-linear-gradient(180deg,rgba(0,0,0,0) 0 64px,rgba(66,30,10,.45) 64px 69px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 3px,rgba(0,0,0,.04) 3px 11px),
  linear-gradient(180deg,#d08a48,#a9632e);box-shadow:0 12px 0 ${rgba(INK, 0.45)},inset 0 5px 0 rgba(255,236,190,.35),inset 0 -8px 0 rgba(60,25,8,.35)}
.ok-m-card{position:absolute;border-radius:56px;display:flex;align-items:center;padding:0 12px}
.ok-m-arrow{width:80px;height:80px;flex:none;border-radius:40px;background:${rgba(PALETTE.white, 0.14)};pointer-events:auto;cursor:pointer;touch-action:none;display:flex;align-items:center;justify-content:center;transition:transform .09s ease-out}
.ok-m-arrow.down{transform:scale(.86)}
.ok-m-arrow::before{content:'';width:22px;height:22px;border-left:8px solid ${css(PALETTE.cream)};border-bottom:8px solid ${css(PALETTE.cream)};border-radius:3px;transform:translateX(5px) rotate(45deg)}
.ok-m-arrow.next::before{transform:translateX(-5px) rotate(-135deg)}
.ok-m-mid{flex:1;min-width:0;height:100%;display:flex;align-items:center;justify-content:center;gap:14px;pointer-events:auto;cursor:pointer;touch-action:none}
.ok-m-mid .c1{font-size:24px;line-height:1;letter-spacing:2px;color:${css(PALETTE.cream)};opacity:.85;text-transform:uppercase}
.ok-m-mid .c2{font-size:36px;line-height:1.05;margin-top:4px;white-space:nowrap}
.ok-m-play{position:absolute;left:-250px;top:-72px;width:500px;height:144px;border-radius:72px;border:7px solid ${css(INK)};background:linear-gradient(180deg,#ffe27a 0%,#ffc93c 48%,#f7a823 100%);box-shadow:0 12px 0 ${css(INK)},inset 0 -10px 0 rgba(199,110,10,.45),inset 0 6px 0 rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:16px;padding-right:20px;color:${css(INK)};font-size:70px;line-height:1;pointer-events:auto;cursor:pointer;touch-action:none;overflow:hidden;transition:transform .08s ease-out,box-shadow .08s ease-out;white-space:nowrap}
.ok-m-play.down{transform:translateY(8px) scale(.97);box-shadow:0 4px 0 ${css(INK)},inset 0 -10px 0 rgba(199,110,10,.45),inset 0 6px 0 rgba(255,255,255,.55)}
.ok-m-play::after{content:'';position:absolute;top:-20px;bottom:-20px;width:90px;left:-140px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.7),rgba(255,255,255,0));transform:skewX(-18deg);animation:okm-shine 3.4s ease-in-out 1.2s infinite;pointer-events:none}
@keyframes okm-shine{0%,62%{left:-140px}88%,100%{left:560px}}
.ok-m-dock{position:absolute;left:8px;width:704px;height:620px;border-radius:46px 46px 0 0;background:linear-gradient(180deg,${rgba(INK, 0.86)},${rgba(INK, 0.92)});box-shadow:inset 0 4px 0 rgba(255,255,255,.14),0 -6px 0 ${rgba(INK, 0.25)}}
.ok-m-item{position:absolute;top:0;width:140px;height:168px;pointer-events:auto;cursor:pointer;touch-action:none}
.ok-m-item>.lbl{position:absolute;left:0;right:0;top:120px;text-align:center;font-size:28px;line-height:1.1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-m-med{position:absolute;left:21px;top:14px;width:98px;height:98px;border-radius:50%;border:6px solid ${css(INK)};box-shadow:0 6px 0 ${rgba(0, 0.45)},inset 0 -8px 0 rgba(0,0,0,.18),inset 0 6px 0 rgba(255,255,255,.35);transition:transform .09s ease-out}
.ok-m-item.down .ok-m-med{transform:scale(.86)}
.ok-m-med>canvas{position:absolute;left:-6px;top:-6px;width:98px;height:98px}
.ok-m-dot::after{content:'!';position:absolute;right:-12px;top:-10px;width:38px;height:38px;border-radius:50%;background:${css(PALETTE.danger)};border:4px solid ${css(INK)};color:#fff;font-size:24px;line-height:31px;text-align:center;animation:okm-dot 1.1s ease-in-out infinite}
@keyframes okm-dot{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
.ok-m-daily{position:absolute;border-radius:40px;border:4px solid ${css(PALETTE.gold)}}
`;

let styled = false;
function injectTitleStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** A crisp canvas of w × h logical px; `draw` gets a Gfx in those px. */
function iconCanvas(parent: HTMLElement, w: number, h: number, draw: (g: Gfx) => void, cls = ''): HTMLCanvasElement {
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
function fitText(e: HTMLElement, text: string, size: number, max: number): void {
  e.textContent = text;
  e.style.fontSize = `${(size * Math.min(1, max / Math.max(1, textWidth(text, size)))).toFixed(1)}px`;
}

type Mode = 'menu' | 'ready';

export function createTitle(ui: Ui, parent: HTMLElement, hooks: TitleHooks): TitleScreen {
  injectTitleStyle();
  let root: HTMLElement | null = null;
  let menuG: HTMLElement | null = null;
  let readyG: HTMLElement | null = null;
  let world: World | null = null;
  let mode: Mode = 'menu';
  /** this build skips the entrance (a chapter switch, a relayout) */
  let soft = false;
  /** a show before this time (performance.now) is the answer to our own chapter / daily switch */
  let softUntil = 0;
  let labels: Label[] = [];
  let hint: Label | null = null;
  let pulse: Animation | null = null;
  let playFace: HTMLElement | null = null;
  let intervals: number[] = [];
  let swapTimer = 0;

  function drop(): void {
    for (const i of intervals) window.clearInterval(i);
    intervals = [];
    window.clearTimeout(swapTimer);
    for (const l of labels) l.destroy();
    labels = [];
    hint = null;
    pulse = null;
    playFace = null;
    root?.remove();
    root = menuG = readyG = null;
  }

  const L = (l: Label): Label => {
    labels.push(l);
    return l;
  };

  const tap = (fn: () => void) => () => {
    ui.audio.play('tap');
    fn();
  };

  /** a moving part of a state: entered from / left towards `away` (a CSS transform) */
  function part(g: HTMLElement, x: number, y: number, away: string, delay: number): HTMLElement {
    const p = el('div', 'ok-m-part', g);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.dataset.away = away;
    p.dataset.delay = String(delay);
    return p;
  }

  function enter(g: HTMLElement, base = 0): void {
    for (const p of Array.from(g.children) as HTMLElement[]) {
      const away = p.dataset.away;
      if (!away) continue;
      p.animate([{ transform: away, opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: base + Number(p.dataset.delay ?? 0), duration: 560, easing: EASE.backOut, fill: 'backwards' });
    }
  }

  function leave(g: HTMLElement): void {
    for (const p of Array.from(g.children) as HTMLElement[]) {
      const away = p.dataset.away;
      if (!away) continue;
      p.animate([{ transform: 'none', opacity: 1 }, { transform: away, opacity: 0 }], { duration: 300, easing: EASE.cubicIn, fill: 'forwards' });
    }
  }

  function settle(g: HTMLElement, on: boolean): void {
    g.style.visibility = on ? '' : 'hidden';
    if (!on) return;
    for (const p of Array.from(g.children) as HTMLElement[]) for (const a of p.getAnimations()) a.cancel();
  }

  const startPulse = (): void => {
    if (!hint) return;
    pulse = hint.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }], { duration: 520, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
  };

  function setMode(next: Mode): void {
    if (!menuG || !readyG || next === mode) return;
    mode = next;
    window.clearTimeout(swapTimer);
    const out = next === 'ready' ? menuG : readyG;
    const inn = next === 'ready' ? readyG : menuG;
    leave(out);
    settle(inn, true);
    enter(inn, next === 'ready' ? 140 : 60);
    swapTimer = window.setTimeout(() => settle(out, false), 320);
  }

  // ---------------------------------------------------------------- build

  function build(w: World): void {
    const t = ui.t;
    const game = ui.game;
    const save = game.save.data;
    const daily = game.daily;
    const view = ui.view?.() ?? { top: 0, bottom: 1280 };
    const top = Math.max(-400, view.top);
    const bot = Math.min(1680, view.bottom);
    root = el('div', 'ok-group', parent);
    menuG = el('div', 'ok-group', root);
    readyG = el('div', 'ok-group', root);
    const on = (m: Mode) => () => mode === m && root !== null;
    const rank = rankOf(progressScore(save).total);
    const level = game.bowLevel;
    const chapter = Math.min(CHAPTERS, game.chapter);
    const where = daily ? t('title.dailyOn', { d: todayKey() }) : chapter >= CHAPTERS ? t(`chapter.${CHAPTERS}`) : `${t('title.chapter', { n: chapter + 1 })} · ${t(`chapter.${chapter}`)}`;

    // ---- the hanging sign: two ropes, a plank, the name in wobbly letters, an arrow stuck in it
    const signTop = top + 112;
    const signP = part(menuG, CX, signTop, 'translateY(-520px) rotate(-6deg)', 40);
    const swing = el('div', 'ok-m-part', signP);
    swing.style.cssText = 'left:0;top:0;transform-origin:0 -300px';
    const BW = 548;
    const BH = 214;
    for (const x of [-BW / 2 + 70, BW / 2 - 80]) {
      const rope = el('div', 'ok-m-rope', swing);
      rope.style.cssText = `left:${x}px;top:-420px;height:440px`;
    }
    const board = el('div', 'ok-m-board', swing);
    board.style.cssText = `left:${-BW / 2}px;top:0;width:${BW}px;height:${BH}px`;
    const name = t('title.name');
    const cut = name.indexOf(' ');
    const lines = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name];
    const looks = lines.length > 1
      ? [
          { size: 58, color: PALETTE.cream, y: 60, stroke: 14, tilt: -2.5 },
          { size: 96, color: PALETTE.gold, y: 146, stroke: 20, tilt: 1.5 },
        ]
      : [{ size: 84, color: PALETTE.gold, y: BH / 2, stroke: 18, tilt: 0 }];
    const letterHosts: { host: HTMLElement; i: number }[] = [];
    // two passes (outlines under every fill) so a letter's outline never covers its neighbour
    for (const pass of ['under', 'over'] as const) {
      let n = 0;
      lines.forEach((line, li) => {
        const lk = looks[li]!;
        const fit = Math.min(1, (BW - 60) / Math.max(1, textWidth(line, lk.size)));
        const size = lk.size * fit;
        const total = textWidth(line, size);
        const row = el('div', 'ok-m-part', swing);
        row.style.cssText = `left:0;top:${lk.y}px;transform:rotate(${lk.tilt}deg)`;
        let x = -total / 2;
        for (const ch of Array.from(line)) {
          const cw = textWidth(ch, size);
          const host = el('div', 'ok-m-part', row);
          host.style.left = `${x + cw / 2}px`;
          host.style.top = '0px';
          x += cw;
          if (ch !== ' ') {
            L(
              pass === 'under'
                ? new Label(host, 0, 0, ch, { size, color: INK, stroke: lk.stroke * fit, strokeColor: INK, shadowY: li === lines.length - 1 ? 8 : 5, shadowColor: 0x5a2d12 })
                : new Label(host, 0, 0, ch, { size, color: lk.color }),
            );
          }
          letterHosts.push({ host, i: n });
          n += 1;
        }
      });
    }
    // the noodle wobble: every letter bobs and tilts on its own beat (both passes in step)
    for (const { host, i } of letterHosts) {
      host.animate([{ transform: 'translateY(4px) rotate(-5deg)' }, { transform: 'translateY(-5px) rotate(5deg)' }], { duration: 1150, delay: -i * 140, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
    }
    swing.animate([{ transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }], { duration: 2300, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
    // the arrow stuck in the plank's corner, which boings now and then
    const arrow = el('canvas', '', swing);
    const apx = 3;
    arrow.width = 150 * apx;
    arrow.height = 130 * apx;
    arrow.style.cssText = `position:absolute;width:150px;height:130px;left:${BW / 2 - 40 - 30}px;top:${122 - 100}px;transform-origin:30px 100px`;
    const ag = new Gfx(arrow.getContext('2d')!);
    ag.ctx.setTransform(apx * 1.3, 0, 0, apx * 1.3, 30 * apx, 100 * apx);
    ag.lineStyle(9, INK, 1).lineBetween(0, 0, 54, -40);
    ag.lineStyle(5, PALETTE.shaftLight, 1).lineBetween(0, 0, 54, -40);
    ag.fillStyle(INK, 1).fillTriangle(42, -40, 60, -27, 64, -56);
    ag.fillStyle(PALETTE.fletch, 1).fillTriangle(45, -39, 58, -30, 61, -51);
    const boing = (): void => {
      arrow.animate([{ transform: 'rotate(-14deg)' }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'rotate(-3deg)', offset: 0.55 }, { transform: 'rotate(1deg)', offset: 0.78 }, { transform: 'rotate(0deg)' }], { duration: 700, easing: 'ease-out' });
    };
    intervals.push(window.setInterval(boing, 3400));
    // a tap on the sign wobbles it (and the arrow)
    const signHit = el('div', '', board);
    signHit.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
    pressable(signHit, on('menu'), ui.unlock, () => {
      ui.audio.playPreset(SFX.boing, { volume: 0.7 });
      board.animate([{ transform: 'scale(1.08, 0.9)' }, { transform: 'scale(0.96, 1.05)', offset: 0.4 }, { transform: 'none' }], { duration: 420, easing: EASE.backOut });
      boing();
    });

    // ---- top bar: rank chip (opens the ranks), coins; over the sign's ropes
    const barP = part(menuG, 0, top, 'translateY(-130px)', 0);
    const bar = el('div', 'ok-m-bar', barP);
    bar.style.top = '0px';
    const chip = el('div', 'ok-m-chip ok-m-glass', bar);
    iconCanvas(chip, 76, 76, (g) => drawBadge(g.phaser, 38, 40, 24, rank, 0));
    const chipText = el('div', '', chip);
    chipText.style.minWidth = '0';
    fitText(el('div', 't1', chipText), t(`rank.${RANKS[rank]!.id}`), 30, 250);
    fitText(el('div', 't2', chipText), t('bow.name', { name: t(`bow.${bowTier(level)}`), n: level }), 24, 250);
    pressable(chip, on('menu'), ui.unlock, tap(hooks.ranks));
    if (save.coins > 0 || save.runs > 0) {
      const coins = el('div', 'ok-m-coins ok-m-glass', bar);
      iconCanvas(coins, 48, 48, (g) => drawCoin(g.phaser, 24, 24, 17));
      el('span', '', coins).textContent = String(save.coins);
    }

    // ---- chapter picker (or the daily card)
    const cardY = signTop + BH + 84;
    if (daily) {
      const ch = dailyChallenge(todayKey());
      const dP = part(menuG, CX, cardY + 30, 'scale(0.6)', 160);
      const box = el('div', 'ok-m-daily ok-m-glass', dP);
      box.style.cssText = 'left:-320px;top:-92px;width:640px;height:184px';
      L(new Label(dP, 0, -50, t('title.dailyOn', { d: todayKey() }), { size: 36, color: PALETTE.gold, stroke: 8 }));
      const goal = L(new Label(dP, 0, 0, t('title.dailyGoal', { n: ch.goal, m: t(`mod.${ch.mod}`) }), { size: 30, color: PALETTE.cream }));
      if (goal.width > 600) goal.setScale(600 / goal.width);
      const info = L(new Label(dP, 0, 48, `${t('title.dailyInfo')} · ${t('title.dailyStreak', { n: liveStreak(save, todayKey()) })}`, { size: 26, color: PALETTE.cream }));
      if (info.width > 600) info.setScale(600 / info.width);
    } else {
      const tint = WORLD_TINT[chapter] ?? PALETTE.gold;
      const cP = part(menuG, CX, cardY, 'scale(0.6)', 160);
      const card = el('div', 'ok-m-card ok-m-glass', cP);
      card.style.cssText = `left:-300px;top:-56px;width:600px;height:112px;box-shadow:inset 0 0 0 4px ${css(tint)},0 6px 0 ${rgba(INK, 0.35)}`;
      const pick = save.chapter > 0;
      if (pick) {
        const prev = el('div', 'ok-m-arrow', card);
        prev.dataset.testid = 'title-chapter-prev';
        prev.setAttribute('aria-label', t('menu.chapterPrev'));
        pressable(prev, on('menu'), ui.unlock, tap(() => switchChapter(-1)));
      }
      const mid = el('div', 'ok-m-mid', card);
      iconCanvas(mid, 84, 76, (g) => drawIsland(g, 42, 34, chapter, tint));
      const words = el('div', '', mid);
      words.style.minWidth = '0';
      el('div', 'c1', words).textContent = chapter >= CHAPTERS ? '∞' : t('title.chapter', { n: chapter + 1 });
      const c2 = el('div', 'c2', words);
      c2.style.color = css(tint);
      fitText(c2, t(`chapter.${chapter}`), 36, pick ? 300 : 420);
      if (pick) {
        mid.dataset.testid = 'title-chapter';
        pressable(mid, on('menu'), ui.unlock, tap(() => switchChapter(1)));
        const next = el('div', 'ok-m-arrow next', card);
        next.dataset.testid = 'title-chapter-next';
        next.setAttribute('aria-label', t('menu.chapterNext'));
        pressable(next, on('menu'), ui.unlock, tap(() => switchChapter(1)));
      }
      // the best wave, and the starting hand a later chapter deals
      const facts = [save.best > 0 ? t('title.best', { n: save.best }) : '', w.startChapter > 0 ? t('title.hand', { n: w.cards.length }) : ''].filter(Boolean).join('  ·  ');
      if (facts) {
        const fP = part(menuG, CX, cardY + 94, 'translateY(-20px)', 220);
        const f = L(new Label(fP, 0, 0, facts, { size: 30, color: PALETTE.cream, stroke: 9 }));
        if (f.width > 640) f.setScale(640 / f.width);
      }
    }

    // ---- the dock: five medallions on a dark tray along the bottom edge
    const dockTop = bot - 176;
    const dP = part(menuG, 0, dockTop, 'translateY(240px)', 80);
    el('div', 'ok-m-dock', dP).style.top = '0px';
    const affordUp = !daily && UPGRADE_IDS.some((id) => {
      const c = upgradeCost(id, save.upgrades[id]);
      return c !== null && save.coins >= c;
    });
    const forgeCost = bowCost(save.bow.level);
    const items: { id: string; text: string; tint: number; dot: boolean; draw: (g: Gfx, x: number, y: number) => void; act: () => void }[] = [
      { id: 'title-shop', text: t('title.shop'), tint: 0x4cc96a, dot: affordUp, draw: drawUpgradeGlyph, act: hooks.shop },
      { id: 'title-looks', text: t('shop.looks'), tint: 0xff7fc0, dot: false, draw: (g, x, y) => drawHeadIcon(g.phaser, x, y + 4, 30, cosmeticById(save.cosmetic), true), act: hooks.looks },
      { id: 'title-forge', text: t('title.forge'), tint: PALETTE.gold, dot: forgeCost !== null && save.coins >= forgeCost, draw: (g, x, y) => drawBowItem(g.phaser, x, y, 30, level, 0), act: hooks.forge },
      { id: 'title-ranks', text: t('title.ranks'), tint: 0x58a6ff, dot: false, draw: (g, x, y) => drawBadge(g.phaser, x, y + 2, 28, rank, 0), act: hooks.ranks },
      { id: 'title-daily', text: daily ? t('title.dailyExit') : t('title.daily'), tint: 0xff7a55, dot: !daily && save.dailyDone !== todayKey(), draw: (g, x, y) => drawCalendarGlyph(g, x, y, daily), act: () => quietly(hooks.daily) },
    ];
    const meds: HTMLElement[] = [];
    items.forEach((it, i) => {
      const item = el('div', 'ok-m-item', dP);
      item.style.left = `${10 + i * 140}px`;
      item.dataset.testid = it.id;
      // the caption first: the element's text is its label (store/tools taps buttons by their text)
      const lbl = el('div', 'lbl', item);
      fitText(lbl, it.text, 28, 132);
      const med = el('div', `ok-m-med${it.dot ? ' ok-m-dot' : ''}`, item);
      med.style.background = `radial-gradient(circle at 34% 28%, ${css(mix(it.tint, 0xffffff, 0.45))}, ${css(it.tint)} 58%, ${css(mix(it.tint, INK, 0.25))})`;
      iconCanvas(med, 98, 98, (g) => {
        g.fillStyle(0xffffff, 0.22).fillCircle(49, 49, 36);
        it.draw(g, 49, 49);
      });
      meds.push(med);
      med.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { delay: soft ? 0 : 380 + i * 70, duration: soft ? 0 : 420, easing: EASE.backOut, fill: 'backwards' });
      pressable(item, on('menu'), ui.unlock, () => {
        med.animate([{ transform: 'scale(1.18) rotate(-8deg)' }, { transform: 'none' }], { duration: 260, easing: EASE.backOut });
        ui.audio.play('tap');
        it.act();
      });
    });
    // now and then one medallion hops, so the tray never sits dead still
    let hop = 0;
    intervals.push(
      window.setInterval(() => {
        if (mode !== 'menu') return;
        const med = meds[hop % meds.length];
        hop += 1;
        med?.animate([{ transform: 'none' }, { transform: 'translateY(-14px) scale(1.06, 0.94)', offset: 0.35 }, { transform: 'translateY(0) scale(1.08, 0.9)', offset: 0.7 }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
      }, 1900),
    );

    // ---- PLAY: the one big action, just above the tray
    const playY = dockTop - 104;
    const pP = part(menuG, CX, playY, 'scale(0.3)', 260);
    const breathe = el('div', 'ok-m-part', pP);
    breathe.style.cssText = 'left:0;top:0';
    breathe.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }], { duration: 900, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
    const play = el('div', 'ok-m-play', breathe);
    play.dataset.testid = 'title-play';
    const label = el('span', '', play);
    const target = el('div', '', play);
    target.style.cssText = 'position:relative;width:104px;height:104px;flex:none;order:-1';
    iconCanvas(target, 104, 104, (g) => drawTarget(g, 52, 52, 46));
    const dart = iconCanvas(target, 104, 104, (g) => drawDart(g, 52, 52));
    dart.style.cssText += ';position:absolute;left:0;top:0';
    fitText(label, t('core.play'), 70, 300);
    playFace = play;
    const thunk = (): void => {
      if (mode !== 'menu') return;
      dart.animate([{ transform: 'translate(-90px, 40px) rotate(-10deg)', opacity: 0 }, { transform: 'translate(-30px, 12px)', opacity: 1, offset: 0.5 }, { transform: 'none', opacity: 1, offset: 0.62 }, { transform: 'rotate(-6deg)', offset: 0.74 }, { transform: 'rotate(3deg)', offset: 0.86 }, { transform: 'none' }], { duration: 760, easing: 'ease-out' });
      target.animate([{ transform: 'none' }, { transform: 'none', offset: 0.6 }, { transform: 'scale(0.9)', offset: 0.68 }, { transform: 'none' }], { duration: 760 });
    };
    intervals.push(window.setInterval(thunk, 3600));
    pressable(play, on('menu'), ui.unlock, () => {
      ui.audio.playPreset(SFX.whistle, { volume: 0.8 });
      setMode('ready');
    });

    // ---- ready: the menu button, the sound button stays; the hint over the field
    const mP = part(readyG, 62, top + 62, 'translateX(-140px)', 0);
    const menuBtn = el('div', 'ok-round ok-m-round', mP);
    menuBtn.style.cssText = 'left:-46px;top:-46px;width:92px;height:92px';
    menuBtn.dataset.testid = 'title-menu';
    menuBtn.setAttribute('aria-label', t('core.menu'));
    for (const y of [27, 42, 57]) el('div', 'ok-m-burger', menuBtn).style.top = `${y}px`;
    pressable(menuBtn, on('ready'), ui.unlock, tap(() => setMode('menu')));
    const hintY = Math.min(Math.max(top + 300, 250), 440);
    const hP = part(readyG, CX, hintY, 'scale(0.4)', 0);
    hint = L(new Label(hP, 0, 0, t('title.drag'), { size: 56, color: PALETTE.white, wrap: 640, stroke: 15 }));
    const sP = part(readyG, CX, hintY + hint.height / 2 + 30, 'translateY(-30px)', 120);
    const sub = L(new Label(sP, 0, 0, where, { size: 34, color: daily ? PALETTE.gold : (WORLD_TINT[chapter] ?? PALETTE.cream), stroke: 10 }));
    if (sub.width > 640) sub.setScale(640 / sub.width);

    // ---- shared: sound (both states)
    const snd = roundButton(root, 658, top + 62, 92, ui.audio.muted ? 'sound-off' : 'sound-on', ui.unlock, () => {
      const muted = ui.audio.toggleMute();
      snd.setIcon(muted ? 'sound-off' : 'sound-on');
      if (!muted) ui.audio.play('pop');
    });
    snd.el.classList.add('ok-m-round');
    snd.el.dataset.testid = 'title-sound';
    snd.el.setAttribute('aria-label', t(ui.audio.muted ? 'core.soundOff' : 'core.soundOn'));

    // ---- the state to open in, and the entrance
    settle(menuG, mode === 'menu');
    settle(readyG, mode === 'ready');
    if (mode === 'ready') startPulse();
    if (!soft) {
      enter(mode === 'menu' ? menuG : readyG, 60);
      snd.el.animate([{ transform: 'scale(0)' }, { transform: 'none' }], { delay: 200, duration: 380, easing: EASE.backOut, fill: 'backwards' });
    }
  }

  /** a switch that starts a new world at the title: its title comes back as it was, without the entrance */
  function quietly(fn: () => void): void {
    softUntil = performance.now() + 600;
    fn();
  }

  function switchChapter(dir: 1 | -1): void {
    quietly(() => hooks.chapter(dir));
  }

  function show(w: World, keepMode: boolean, quiet: boolean): void {
    drop();
    world = w;
    if (!keepMode) mode = ui.game.quick ? 'ready' : 'menu';
    soft = quiet;
    build(w);
    soft = false;
  }

  return {
    get shown() {
      return root !== null;
    },
    get ready() {
      return root !== null && mode === 'ready';
    },
    show(w) {
      // our own chapter / daily switch keeps the menu open and skips the entrance
      const quiet = performance.now() < softUntil;
      softUntil = 0;
      show(w, quiet, quiet);
    },
    relayout() {
      if (root && world) show(world, true, true);
    },
    hide() {
      const r = root;
      if (!r) return;
      for (const i of intervals) window.clearInterval(i);
      intervals = [];
      window.clearTimeout(swapTimer);
      const gone = labels;
      labels = [];
      hint = null;
      playFace = null;
      root = menuG = readyG = null;
      r.style.pointerEvents = 'none';
      for (const e of Array.from(r.querySelectorAll<HTMLElement>('[data-ui]'))) e.removeAttribute('data-ui');
      const a = r.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-60px)' }], { duration: 260, easing: EASE.cubicIn, fill: 'forwards' });
      a.onfinish = () => {
        for (const l of gone) l.destroy();
        r.remove();
      };
    },
    nudge() {
      if (mode === 'menu' && playFace) {
        playFace.animate([{ transform: 'scale(1.12) rotate(-3deg)' }, { transform: 'scale(0.96) rotate(2deg)', offset: 0.5 }, { transform: 'none' }], { duration: 420, easing: EASE.backOut });
        return;
      }
      if (!hint) return;
      pulse?.cancel();
      const a = hint.el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 420, easing: EASE.backOut });
      a.onfinish = startPulse;
    },
    clear: drop,
  };
}

// ---------------------------------------------------------------------------- drawings

function mix(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** The upgrades medallion: a chunky green arrow pointing up. */
function drawUpgradeGlyph(g: Gfx, x: number, y: number): void {
  const arrow = (dy: number, color: number): void => {
    g.fillStyle(color, 1).fillTriangle(x - 26, y - 2 + dy, x + 26, y - 2 + dy, x, y - 30 + dy);
    g.fillRect(x - 11, y - 4 + dy, 22, 30);
  };
  arrow(9, INK);
  arrow(4, 0xffffff);
  g.fillStyle(0x2ea356, 0.35).fillRect(x + 1, y, 10, 30);
}

/** The daily medallion: a calendar page with its rings and today's mark (a cross back to normal). */
function drawCalendarGlyph(g: Gfx, x: number, y: number, exit: boolean): void {
  g.fillStyle(INK, 1).fillRoundedRect(x - 28, y - 24, 56, 54, 10);
  g.fillStyle(0xffffff, 1).fillRoundedRect(x - 23, y - 19, 46, 44, 7);
  g.fillStyle(PALETTE.danger, 1).fillRect(x - 23, y - 19, 46, 13);
  g.fillStyle(INK, 1).fillRoundedRect(x - 16, y - 32, 8, 18, 4).fillRoundedRect(x + 8, y - 32, 8, 18, 4);
  if (exit) {
    g.lineStyle(7, INK, 1).lineBetween(x - 10, y + 1, x + 10, y + 19).lineBetween(x + 10, y + 1, x - 10, y + 19);
  } else {
    g.fillStyle(PALETTE.gold, 1).fillCircle(x, y + 10, 9);
    g.lineStyle(3, INK, 1).strokeCircle(x, y + 10, 9);
  }
}

/** A floating island in a world's colour (the chapter picker's emblem). */
function drawIsland(g: Gfx, x: number, y: number, chapter: number, tint: number): void {
  g.fillStyle(INK, 1).fillTriangle(x - 34, y - 2, x + 34, y - 2, x + 4, y + 40);
  g.fillStyle(PALETTE.rock, 1).fillTriangle(x - 28, y + 1, x + 28, y + 1, x + 3, y + 34);
  g.fillStyle(PALETTE.rockDark, 1).fillTriangle(x + 3, y + 1, x + 28, y + 1, x + 3, y + 34);
  g.fillStyle(INK, 1).fillRoundedRect(x - 38, y - 14, 76, 22, 10);
  g.fillStyle(tint, 1).fillRoundedRect(x - 34, y - 11, 68, 16, 8);
  g.fillStyle(0xffffff, 0.35).fillRoundedRect(x - 28, y - 9, 30, 5, 3);
  // a little flag on the islands reached; a lantern by night; an ember on the lava
  g.lineStyle(4, INK, 1).lineBetween(x + 14, y - 12, x + 14, y - 34);
  g.fillStyle(chapter === 3 ? PALETTE.lantern : chapter === 4 ? PALETTE.fire : PALETTE.fletch, 1).fillTriangle(x + 16, y - 34, x + 32, y - 28, x + 16, y - 22);
}

/** The PLAY button's archery target. */
function drawTarget(g: Gfx, x: number, y: number, r: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y + 3, r + 4);
  const rings = [0xffffff, PALETTE.danger, 0xffffff, PALETTE.danger, PALETTE.gold];
  rings.forEach((c, i) => g.fillStyle(c, 1).fillCircle(x, y, r * (1 - i * 0.19)));
  g.lineStyle(3, INK, 0.35).strokeCircle(x, y, r * 0.62);
  g.fillStyle(0xffffff, 0.35).fillEllipse(x - r * 0.35, y - r * 0.45, r * 0.6, r * 0.28);
}

/** The arrow that keeps landing in the target's gold (drawn stuck, pointing in from the lower left). */
function drawDart(g: Gfx, x: number, y: number): void {
  const ex = x - 44;
  const ey = y + 30;
  g.lineStyle(8, INK, 1).lineBetween(x, y, ex, ey);
  g.lineStyle(4, PALETTE.shaftLight, 1).lineBetween(x, y, ex, ey);
  g.fillStyle(INK, 1).fillTriangle(ex - 4, ey - 12, ex + 10, ey + 2, ex - 14, ey + 10);
  g.fillStyle(PALETTE.fletch, 1).fillTriangle(ex - 2, ey - 8, ex + 6, ey + 1, ex - 10, ey + 6);
}
