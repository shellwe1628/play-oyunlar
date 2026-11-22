/**
 * The Home tab of the 3D build's main menu, over the live 3D scene (the tab shell around it, with
 * the top bar, the side buttons and the tab bar, is shell.ts).
 *
 * Two states:
 * - menu:  the hanging wooden sign with the wobbly noodle letters, the chapter card (or the daily
 *          card) with the recommended power, and one big PLAY button sitting on the tab bar.
 * - ready: PLAY swept the menu away (the shell hides too); only the "pull back & let go" hint,
 *          the menu button and the sound button are left, so the whole field is free for the
 *          first shot.
 * The first shot starts the run from either state (dragging on the open sky works in the menu
 * too), exactly as before; the result screen's Replay comes straight back in the ready state.
 *
 * Everything lives in the HUD's logical 720 × 1280 layer; the parts follow the real screen edges
 * and safe areas (`Ui.view`), so tall phones put the extra height in the middle.
 */
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { powerOf } from '@sim/arsenal';
import { CHAPTERS, RECOMMENDED_POWER } from '@sim/chapters';
import { dailyChallenge, liveStreak } from '@sim/progress';
import type { World } from '@sim/world';
import { calmMotion, EASE, el, fitText, iconCanvas, Label, pressable, roundButton, TAB_BAR_H, textWidth } from './dom';
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
  /** the next show answers a switch made elsewhere (the Events tab's daily): no entrance */
  quiet(): void;
  clear(): void;
}

/** The Home tab's ways out (the other screens are the shell's tabs). */
export interface TitleHooks {
  /** chapter select: the next (1) or previous (-1) chapter reached, wrapping round */
  chapter: (dir: 1 | -1) => void;
}

/** Green "easy" / orange "tough" on the chapter card (the player's power against the chapter's recommended power). */
export const EASY_COLOR = 0x7cf29c;
export const TOUGH_COLOR = 0xffa23a;

/** One colour per world (chapter theme order), for the chapter picker's island and rim. */
const WORLD_TINT = [0x6fdc4f, 0x9fe8ff, 0xffb24a, 0x8f7bff, 0xff6b3a, 0xf5e27a, 0xff6fb5];

const STYLE = `
.ok-m-part{position:absolute;width:0;height:0}
.ok-m-glass{background:${rgba(INK, 0.74)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.16),0 6px 0 ${rgba(INK, 0.35)}}
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
.ok-m-rec{display:inline-flex;align-items:center;gap:8px;margin-top:8px;height:34px;padding:0 14px;border-radius:17px;background:rgba(0,0,0,.28);font-size:22px;line-height:1;white-space:nowrap}
.ok-m-rec>i{font-style:normal;padding:4px 10px;border-radius:12px;color:${css(INK)};font-size:20px}
.ok-m-play{position:absolute;left:-250px;top:-72px;width:500px;height:144px;border-radius:72px;border:7px solid ${css(INK)};background:linear-gradient(180deg,#ffe27a 0%,#ffc93c 48%,#f7a823 100%);box-shadow:0 12px 0 ${css(INK)},inset 0 -10px 0 rgba(199,110,10,.45),inset 0 6px 0 rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:16px;padding-right:20px;color:${css(INK)};font-size:70px;line-height:1;pointer-events:auto;cursor:pointer;touch-action:none;overflow:hidden;transition:transform .08s ease-out,box-shadow .08s ease-out;white-space:nowrap}
.ok-m-play.down{transform:translateY(8px) scale(.97);box-shadow:0 4px 0 ${css(INK)},inset 0 -10px 0 rgba(199,110,10,.45),inset 0 6px 0 rgba(255,255,255,.55)}
.ok-calm .ok-m-play::after{display:none}
.ok-m-play::after{content:'';position:absolute;top:-20px;bottom:-20px;width:90px;left:-140px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.7),rgba(255,255,255,0));transform:skewX(-18deg);animation:okm-shine 3.4s ease-in-out 1.2s infinite;pointer-events:none}
@keyframes okm-shine{0%,62%{left:-140px}88%,100%{left:560px}}
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

type Mode = 'menu' | 'ready';

export function createTitle(ui: Ui, parent: HTMLElement, hooks: TitleHooks): TitleScreen {
  injectTitleStyle();
  const calm = calmMotion();
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
  /** the chapter picker was just turned this way: the next build slides the card's content in from there */
  let turned: 1 | -1 | 0 = 0;

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
    if (calm) root.classList.add('ok-calm');
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
    for (const { host, i } of calm ? [] : letterHosts) {
      host.animate([{ transform: 'translateY(4px) rotate(-5deg)' }, { transform: 'translateY(-5px) rotate(5deg)' }], { duration: 1150, delay: -i * 140, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
    }
    if (!calm) swing.animate([{ transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }], { duration: 2300, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
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
    if (!calm) intervals.push(window.setInterval(boing, 3400));
    // a tap on the sign wobbles it (and the arrow)
    const signHit = el('div', '', board);
    signHit.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
    pressable(signHit, on('menu'), ui.unlock, () => {
      ui.audio.playPreset(SFX.boing, { volume: 0.7 });
      board.animate([{ transform: 'scale(1.08, 0.9)' }, { transform: 'scale(0.96, 1.05)', offset: 0.4 }, { transform: 'none' }], { duration: 420, easing: EASE.backOut });
      boing();
    });

    // ---- chapter card (or the daily card), under the sign
    const cardY = signTop + BH + 92;
    if (daily) {
      const ch = dailyChallenge(todayKey());
      const dP = part(menuG, CX, cardY + 22, 'scale(0.6)', 160);
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
      card.style.cssText = `left:-310px;top:-68px;width:620px;height:136px;box-shadow:inset 0 0 0 4px ${css(tint)},0 6px 0 ${rgba(INK, 0.35)}`;
      const pick = save.chapter > 0;
      if (pick) {
        const prev = el('div', 'ok-m-arrow', card);
        prev.dataset.testid = 'title-chapter-prev';
        prev.setAttribute('aria-label', t('menu.chapterPrev'));
        pressable(prev, on('menu'), ui.unlock, tap(() => switchChapter(-1)));
      }
      const mid = el('div', 'ok-m-mid', card);
      const isle = iconCanvas(mid, 84, 76, (g) => drawIsland(g, 42, 34, chapter, tint));
      if (turned !== 0 && !calm) {
        // a chapter switch: the new world's name slides in the way the picker was turned, its island hops
        mid.animate([{ transform: `translateX(${turned * 70}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE.cubicOut });
        isle.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-14px) scale(1.15)', offset: 0.4 }, { transform: 'translateY(0) scale(1)' }], { delay: 120, duration: 420, easing: EASE.backOut });
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 320, easing: EASE.cubicOut });
      }
      const words = el('div', '', mid);
      words.style.minWidth = '0';
      el('div', 'c1', words).textContent = chapter >= CHAPTERS ? '∞' : t('title.chapter', { n: chapter + 1 });
      const c2 = el('div', 'c2', words);
      c2.style.color = css(tint);
      fitText(c2, t(`chapter.${chapter}`), 36, pick ? 300 : 440);
      // the recommended power: green "easy" when the player's power reaches it, orange "tough" below
      const rec = RECOMMENDED_POWER[chapter];
      if (rec !== undefined) {
        const easy = powerOf(save) >= rec;
        const color = easy ? EASY_COLOR : TOUGH_COLOR;
        const row = el('div', 'ok-m-rec', words);
        row.dataset.testid = 'title-chapter-rec';
        const txt = el('span', '', row);
        txt.style.color = css(color);
        fitText(txt, t('shell.recommended', { n: rec }), 22, pick ? 210 : 300);
        const tag = el('i', '', row);
        tag.style.background = css(color);
        tag.textContent = t(easy ? 'shell.easy' : 'shell.tough');
      }
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
        const fP = part(menuG, CX, cardY + 100, 'translateY(-20px)', 220);
        const f = L(new Label(fP, 0, 0, facts, { size: 28, color: PALETTE.cream, stroke: 9 }));
        if (f.width > 600) f.setScale(600 / f.width);
      }
    }

    // ---- PLAY: the one big action, sitting on the tab bar
    const playY = bot - TAB_BAR_H - 104;
    const pP = part(menuG, CX, playY, 'scale(0.3)', 260);
    const breathe = el('div', 'ok-m-part', pP);
    breathe.style.cssText = 'left:0;top:0';
    if (!calm) breathe.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }], { duration: 900, direction: 'alternate', iterations: Infinity, easing: EASE.sine });
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
    if (!calm) intervals.push(window.setInterval(thunk, 3600));
    pressable(play, on('menu'), ui.unlock, () => {
      ui.audio.playPreset(SFX.whistle, { volume: 0.8 });
      setMode('ready');
    });

    // ---- ready: the menu button, the sound button; the hint over the field
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
    // in the menu state the sound button is the shell's (its top bar)
    const sndP = part(readyG, 658, top + 62, 'translateX(140px)', 0);
    const snd = roundButton(sndP, 0, 0, 92, ui.audio.muted ? 'sound-off' : 'sound-on', ui.unlock, () => {
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
    if (!soft) enter(mode === 'menu' ? menuG : readyG, 60);
    turned = 0;
  }

  /** a switch that starts a new world at the title: its title comes back as it was, without the entrance */
  function quietly(fn: () => void): void {
    softUntil = performance.now() + 600;
    fn();
  }

  function switchChapter(dir: 1 | -1): void {
    turned = dir;
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
    quiet() {
      softUntil = performance.now() + 600;
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

/** The daily glyph (Events tab, daily side button): a calendar page with its rings and today's mark (a cross back to normal). */
export function drawCalendarGlyph(g: Gfx, x: number, y: number, exit: boolean): void {
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
export function drawTarget(g: Gfx, x: number, y: number, r: number): void {
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
