/**
 * The main menu's Events tab ("Etkinlik"), a pane inside the tab shell (shell.ts):
 *
 * - the daily challenge card: today's date and the time left (local midnight), the goal (a wave and
 *   the day's twist, `dailyChallenge`) with today's best against it, the streak (`liveStreak`) as a
 *   week of pips, the reward (a gold chest, sim/rewards.ts `bankDailyChest`) or "done today", and
 *   the button that turns the daily run on (or back to the chapters)
 * - a quiet card for the events still to come
 *
 * Read-only: the daily's rules and its reward are banked by the run (ui/progress.ts).
 */
import { PALETTE } from '@okcu/textures';
import type { SaveData } from '@sim/meta';
import { dailyChallenge, liveStreak } from '@sim/progress';
import { calmMotion, EASE, el, fitText, iconCanvas, mix, pressable, TAB_BAR_H } from './dom';
import { css, type Gfx, rgba } from './gfx';
import { growBar, knock, popIn, shineLoop } from './juice';
import { todayKey } from './save';
import type { Ui } from './screens';
import { clock, drawChestIcon, msToMidnight } from './shop';
import { drawCalendarGlyph, drawTarget } from './title';

export interface EventsHooks {
  /** the daily run on / off */
  daily: () => void;
}

export interface EventsPane {
  destroy(): void;
}

const INK = PALETTE.ink;
const X0 = 24;
const WIDTH = 720 - 2 * X0;
const PINK = 0xff6f9a;
const WEEK = 7;

const STYLE = `
.ok-ev{position:absolute;left:${X0}px;width:${WIDTH}px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.ok-ev-card{position:relative;border-radius:26px;background:${rgba(INK, 0.84)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.14),0 6px 0 ${rgba(INK, 0.4)};flex:none}
.ok-ev-day{display:flex;flex-direction:column;gap:16px;padding:20px 22px 24px;box-shadow:inset 0 0 0 4px ${rgba(PINK, 0.75)},0 6px 0 ${rgba(INK, 0.4)},0 0 26px ${rgba(PINK, 0.28)}}
.ok-ev-head{display:flex;align-items:center;gap:16px}
.ok-ev-plate{width:100px;height:100px;border-radius:26px;flex:none;position:relative;background:radial-gradient(circle at 34% 28%,${css(mix(PINK, 0xffffff, 0.45))},${css(PINK)} 62%,${css(mix(PINK, INK, 0.3))});box-shadow:inset 0 0 0 4px ${rgba(INK, 0.5)},inset 0 -8px 0 rgba(0,0,0,.18)}
.ok-ev-plate>canvas{position:absolute;left:0;top:0}
.ok-ev-head .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.ok-ev-big{font-size:38px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap;-webkit-text-stroke:8px ${css(INK)};paint-order:stroke fill}
.ok-ev-sub{display:flex;align-items:center;gap:10px;font-size:21px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-ev-sub i{font-style:normal;height:30px;line-height:30px;padding:0 12px;border-radius:15px;background:${rgba(0xffffff, 0.08)}}
.ok-ev-goal{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:20px;background:${rgba(0xffffff, 0.06)}}
.ok-ev-goal .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.ok-ev-goal b{font-size:26px;line-height:1;color:#fff;white-space:nowrap}
.ok-ev-goal span{font-size:19px;line-height:1.15;color:${css(PALETTE.cream)};opacity:.8}
.ok-ev-bar{position:relative;height:26px;border-radius:13px;background:${css(INK)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.12);overflow:hidden}
.ok-ev-bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:13px;background:linear-gradient(180deg,${css(mix(PALETTE.heal, 0xffffff, 0.35))},${css(mix(PALETTE.heal, 0x1f9a52, 0.4))})}
.ok-ev-bar>em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:18px;line-height:1;color:#fff;text-shadow:0 2px 0 ${css(INK)},0 0 3px ${css(INK)}}
.ok-ev-streak{display:flex;align-items:center;gap:12px}
.ok-ev-streak>b{font-size:22px;line-height:1;color:${css(PALETTE.cream)};opacity:.85;white-space:nowrap;width:80px}
.ok-ev-pips{flex:1;display:flex;gap:8px}
.ok-ev-pips>i{flex:1;height:34px;border-radius:12px;background:${rgba(0xffffff, 0.08)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.06);position:relative}
.ok-ev-pips>i.on{background:linear-gradient(180deg,#ffd36a,#ff9a3c);box-shadow:inset 0 0 0 3px ${rgba(INK, 0.35)},0 0 10px ${rgba(0xff9a3c, 0.5)}}
.ok-ev-pips>i.today{box-shadow:inset 0 0 0 3px ${css(PALETTE.gold)}}
.ok-ev-streak>span{font-size:24px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap;min-width:84px;text-align:right}
.ok-ev-reward{display:flex;align-items:center;gap:12px;height:72px;padding:0 16px 0 8px;border-radius:20px;background:${rgba(PALETTE.gold, 0.14)};box-shadow:inset 0 0 0 3px ${rgba(PALETTE.gold, 0.5)}}
.ok-ev-reward>span{font-size:26px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-ev-reward.done{background:${rgba(PALETTE.heal, 0.14)};box-shadow:inset 0 0 0 3px ${rgba(PALETTE.heal, 0.7)}}
.ok-ev-reward.done>span{color:${css(PALETTE.heal)}}
.ok-ev-play{position:relative;height:100px;border-radius:36px;border:6px solid ${css(INK)};background:linear-gradient(180deg,#ffe27a 0%,#ffc93c 48%,#f7a823 100%);box-shadow:0 10px 0 ${css(INK)},inset 0 -8px 0 rgba(199,110,10,.45),inset 0 5px 0 rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:12px;color:${css(INK)};font-size:42px;line-height:1;white-space:nowrap;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .08s ease-out}
.ok-ev-play.s{background:linear-gradient(180deg,#8e6fd0,#6b4ca8);color:#fff;box-shadow:0 10px 0 ${css(INK)},inset 0 5px 0 rgba(255,255,255,.3)}
.ok-ev-play.down{transform:translateY(6px) scale(.97)}
.ok-ev-more{display:flex;align-items:center;gap:16px;height:112px;padding:0 22px;background:${rgba(mix(INK, 0x000000, 0.25), 0.8)}}
.ok-ev-more::before{content:'';position:absolute;inset:6px;border-radius:20px;border:4px dashed rgba(255,243,214,.3);pointer-events:none}
.ok-ev-more>span{font-size:25px;line-height:1.2;color:${css(PALETTE.cream)};opacity:.8}
`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

export function createEventsPane(ui: Ui, pane: HTMLElement, top: number, bot: number, hooks: EventsHooks, quiet: boolean): EventsPane {
  injectStyle();
  const t = ui.t;
  const calm = calmMotion();

  const scrim = el('div', 'ok-s-scrim', pane);
  scrim.dataset.ui = '1';
  scrim.style.background = rgba(INK, 0.55);
  const y0 = top + 132;
  const y1 = bot - TAB_BAR_H - 22;
  const wrap = el('div', 'ok-ev', pane);
  wrap.dataset.ui = '1';
  wrap.style.top = `${y0}px`;
  wrap.style.height = `${y1 - y0}px`;
  // on a short screen the cards sit closer
  const tight = y1 - y0 < 1000;

  /** the day the card shows: a new local day (midnight passed with the pane up) draws it again */
  let key = '';
  let left: HTMLElement | null = null;

  function render(animate: boolean): void {
    wrap.replaceChildren();
    key = todayKey();
    // read fresh: the save may have changed (or been replaced) since the pane was made
    const save: SaveData = ui.game.save.data;
    // ---- the daily challenge
    const ch = dailyChallenge(key);
    const done = save.dailyDone === key;
    const best = save.dailyDate === key ? save.dailyBest : 0;
    const streak = liveStreak(save, key);
    const card = el('div', 'ok-ev-card ok-ev-day', wrap);
    card.dataset.testid = 'events-daily-card';
    if (tight) card.style.gap = '13px';
    const head = el('div', 'ok-ev-head', card);
    const plate = el('div', 'ok-ev-plate', head);
    iconCanvas(plate, 100, 100, (g) => g.at(50, 52, 1.2, 1.2, 0, () => drawCalendarGlyph(g, 0, 0, false)));
    const tt = el('div', 't', head);
    fitText(el('div', 'ok-ev-big', tt), t('events.daily'), 38, 480);
    const sub = el('div', 'ok-ev-sub', tt);
    el('i', '', sub).textContent = key;
    el('span', '', sub).textContent = t('events.endsIn', { t: clock(msToMidnight()) });

    const goal = el('div', 'ok-ev-goal', card);
    iconCanvas(goal, 64, 64, (g) => drawTarget(g, 32, 31, 25));
    const gx = el('div', 'tx', goal);
    fitText(el('b', '', gx), t('title.dailyGoal', { n: ch.goal, m: t(`mod.${ch.mod}`) }), 26, 540);
    const bar = el('div', 'ok-ev-bar', gx);
    const fill = el('i', '', bar);
    const k = done ? 1 : Math.min(1, best / ch.goal);
    fill.style.width = `${Math.max(k > 0 ? 8 : 0, k * 100)}%`;
    el('em', '', bar).textContent = `${Math.min(done ? Math.max(best, ch.goal) : best, ch.goal)} / ${ch.goal}`;
    el('span', '', gx).textContent = t('title.dailyInfo');

    const st = el('div', 'ok-ev-streak', card);
    fitText(el('b', '', st), t('events.streak'), 22, 80);
    const pips = el('div', 'ok-ev-pips', st);
    // the week so far: a full week starts a new row of pips; today's slot is outlined until it is done
    const filled = streak === 0 ? 0 : ((streak - 1) % WEEK) + 1;
    for (let i = 0; i < WEEK; i++) {
      const p = el('i', i < filled ? 'on' : '', pips);
      if (!done && i === filled && filled < WEEK) p.classList.add('today');
    }
    el('span', '', st).textContent = t('events.days', { n: streak });

    const rw = el('div', `ok-ev-reward${done ? ' done' : ''}`, card);
    if (done) {
      iconCanvas(rw, 56, 56, (g) => drawTick(g, 28, 28));
      fitText(el('span', '', rw), t('events.done'), 26, 520);
    } else {
      // the prize still to win knocks now and then
      knock(iconCanvas(rw, 80, 64, (g) => drawChestIcon(g, 'gold', 40, 34, 0.78)), 3000, 1100);
      fitText(el('span', '', rw), t('events.reward'), 26, 500);
    }

    const play = el('div', `ok-ev-play${ui.game.daily ? ' s' : ''}`, card);
    play.dataset.testid = 'events-daily-play';
    if (!ui.game.daily) iconCanvas(play, 44, 48, (g) => drawPlay(g, 22, 24));
    const pl = el('span', '', play);
    fitText(pl, ui.game.daily ? t('events.exit') : t('events.play'), 42, 470);
    if (tight) play.style.height = '92px';
    pressable(play, () => true, ui.unlock, () => {
      ui.audio.play('tap');
      hooks.daily();
    });

    // ---- what is still to come
    const more = el('div', 'ok-ev-card ok-ev-more', wrap);
    iconCanvas(more, 70, 70, (g) => drawSparkle(g, 35, 35));
    fitText(el('span', '', more), t('events.more'), 25, 520);

    if (animate && !calm) {
      [card, more].forEach((e, i) => e.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 40 + i * 60, duration: 320, easing: EASE.backOut, fill: 'backwards' }));
      // the day's progress fills up and the streak's days pop in one by one, once the card has landed
      if (k > 0) growBar(fill, 0.04, 300, 700);
      popIn(Array.from(pips.querySelectorAll<HTMLElement>('i.on')), 420, 80);
    }
    // the way into the daily run catches the light now and then
    if (!ui.game.daily) shineLoop(play, 3400, 1400);
    left = sub.lastElementChild as HTMLElement;
  }

  render(!quiet);
  const timer = window.setInterval(() => {
    if (todayKey() !== key) render(false);
    else if (left) left.textContent = t('events.endsIn', { t: clock(msToMidnight()) });
  }, 1000);
  return {
    destroy() {
      window.clearInterval(timer);
      pane.replaceChildren();
    },
  };
}

/** The play triangle on the daily's button. */
function drawPlay(g: Gfx, x: number, y: number): void {
  g.fillStyle(INK, 1).fillPoints([
    { x: x - 14, y: y - 20 },
    { x: x + 20, y },
    { x: x - 14, y: y + 20 },
  ]);
  g.fillStyle(0xffffff, 1).fillPoints([
    { x: x - 8, y: y - 10 },
    { x: x + 9, y },
    { x: x - 8, y: y + 10 },
  ]);
}

/** A green tick in an ink ring (today's daily done). */
function drawTick(g: Gfx, x: number, y: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y, 24);
  g.fillStyle(PALETTE.heal, 1).fillCircle(x, y, 19);
  g.lineStyle(7, INK, 1).lineBetween(x - 9, y, x - 2, y + 8).lineBetween(x - 2, y + 8, x + 11, y - 8);
}

/** Three little stars (more events to come). */
function drawSparkle(g: Gfx, x: number, y: number): void {
  const star = (cx: number, cy: number, r: number, c: number): void => {
    const pts = (k: number) =>
      Array.from({ length: 8 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.38 * k : r * k;
        return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      });
    g.fillStyle(INK, 1).fillPoints(pts(1.25));
    g.fillStyle(c, 1).fillPoints(pts(1));
  };
  star(x - 8, y + 6, 20, PALETTE.gold);
  star(x + 18, y - 16, 11, PINK);
  star(x + 20, y + 20, 8, 0x58a6ff);
}
