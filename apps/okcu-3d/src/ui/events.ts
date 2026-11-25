/**
 * The main menu's Events tab ("Etkinlik"), a pane inside the tab shell (shell.ts):
 *
 * - the daily challenge card: today's date and the time left (local midnight), the goal (a wave and
 *   the day's twist, `dailyChallenge`) with today's best against it, the streak (`liveStreak`) as a
 *   week of pips, the reward (a gold chest, sim/rewards.ts `bankDailyChest`) or "done today", and
 *   the button that turns the daily run on (or back to the chapters)
 * - the two modes, side by side (sim/modes.ts): Blitz and Boss Rush, each with its name, its rule in
 *   a line, the personal best and Play (or what opens it, while it is locked), and under them how
 *   many of the day's mode run chests are left
 *
 * Read-only: the daily's rules and its reward, and a mode run's coins, chest and best, are banked
 * by the run (ui/progress.ts).
 */
import { PALETTE } from '@okcu/textures';
import type { SaveData } from '@sim/meta';
import { MODE_CHESTS_PER_DAY, modeChestsLeft, modeUnlocked, RUSH_BOSSES, type Mode } from '@sim/modes';
import { dailyChallenge, liveStreak } from '@sim/progress';
import { calmMotion, EASE, el, fitText, iconCanvas, mix, pressable, TAB_BAR_H } from './dom';
import { css, type Gfx, rgba } from './gfx';
import { countTo, growBar, knock, pop, popIn, shineLoop } from './juice';
import { todayKey } from './save';
import type { Ui } from './screens';
import { clock, drawChestIcon, msToMidnight } from './shop';
import { drawCalendarGlyph, drawTarget } from './title';

export interface EventsHooks {
  /** the daily run on / off */
  daily: () => void;
  /** start a mode (Blitz, Boss Rush): a new world, ready for the first shot */
  mode: (mode: Mode) => void;
}

export interface EventsPane {
  destroy(): void;
}

const INK = PALETTE.ink;
const X0 = 24;
const WIDTH = 720 - 2 * X0;
const PINK = 0xff6f9a;
const WEEK = 7;
/** the modes' own colours: Blitz a storm blue, Boss Rush an ember red */
const MODE_TINT: Record<Mode, number> = { blitz: 0x4fc3ff, bossrush: 0xff7a45 };

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
.ok-ev-modes{display:flex;gap:18px;flex:none}
.ok-ev-mode{flex:1;min-width:0;display:flex;flex-direction:column;gap:11px;padding:16px 16px 20px}
.ok-ev-mode .hd{display:flex;align-items:center;gap:12px}
.ok-ev-mode .pl{width:74px;height:74px;border-radius:22px;flex:none;position:relative;box-shadow:inset 0 0 0 4px ${rgba(INK, 0.5)},inset 0 -6px 0 rgba(0,0,0,.18)}
.ok-ev-mode .pl>canvas{position:absolute;left:0;top:0}
.ok-ev-mode .nm{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.ok-ev-mode .nm>b{font-size:32px;line-height:1;white-space:nowrap;-webkit-text-stroke:7px ${css(INK)};paint-order:stroke fill}
.ok-ev-mode .nm>i{font-style:normal;font-size:17px;line-height:1;color:${css(PALETTE.cream)};opacity:.75;white-space:nowrap}
.ok-ev-mode .ru{font-size:19px;line-height:1.2;color:${css(PALETTE.cream)};opacity:.9;min-height:46px;flex:1}
.ok-ev-mode .bs{display:flex;align-items:center;justify-content:center;height:44px;border-radius:16px;background:${rgba(0xffffff, 0.07)};font-size:22px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-ev-mode .bs.none{color:${css(PALETTE.cream)};opacity:.7}
.ok-ev-mode .go{position:relative;height:78px;border-radius:28px;border:5px solid ${css(INK)};background:linear-gradient(180deg,#ffe27a 0%,#ffc93c 48%,#f7a823 100%);box-shadow:0 8px 0 ${css(INK)},inset 0 -6px 0 rgba(199,110,10,.45),inset 0 4px 0 rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:8px;color:${css(INK)};font-size:34px;line-height:1;white-space:nowrap;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .08s ease-out}
.ok-ev-mode .go.down{transform:translateY(5px) scale(.97)}
.ok-ev-mode .lk{display:flex;align-items:center;justify-content:center;gap:8px;height:78px;padding:0 10px;border-radius:28px;border:4px dashed rgba(255,243,214,.35);font-size:19px;line-height:1.15;text-align:center;color:${css(PALETTE.cream)};opacity:.85}
.ok-ev-mode.locked .pl,.ok-ev-mode.locked .nm,.ok-ev-mode.locked .ru{opacity:.55}
.ok-ev-chests{display:flex;align-items:center;justify-content:center;gap:10px;height:40px;margin-top:-8px;font-size:20px;line-height:1;color:${css(PALETTE.cream)};opacity:.85;flex:none}
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

    // ---- the modes: Blitz and Boss Rush, side by side
    const row = el('div', 'ok-ev-modes', wrap);
    const bests: { e: HTMLElement; n: number; text: (n: number) => string }[] = [];
    const cards: HTMLElement[] = [card];
    const m = save.arsenal.modes;
    for (const id of ['blitz', 'bossrush'] as const) {
      const tint = MODE_TINT[id];
      const open = modeUnlocked(save, id);
      const mc = el('div', `ok-ev-card ok-ev-mode${open ? '' : ' locked'}`, row);
      mc.dataset.testid = `events-mode-${id}`;
      mc.style.boxShadow = `inset 0 0 0 4px ${rgba(tint, open ? 0.75 : 0.35)},0 6px 0 ${rgba(INK, 0.4)}${open ? `,0 0 22px ${rgba(tint, 0.24)}` : ''}`;
      cards.push(mc);
      const hd = el('div', 'hd', mc);
      const pl = el('div', 'pl', hd);
      pl.style.background = `radial-gradient(circle at 34% 28%,${css(mix(tint, 0xffffff, 0.45))},${css(tint)} 62%,${css(mix(tint, INK, 0.3))})`;
      iconCanvas(pl, 74, 74, (g) => (id === 'blitz' ? drawStopwatch(g, 37, 39) : drawCrown(g, 37, 38)));
      const nm = el('div', 'nm', hd);
      const name = el('b', '', nm);
      name.style.color = css(mix(tint, 0xffffff, 0.35));
      fitText(name, t(`mode.${id}`), 32, 212);
      fitText(el('i', '', nm), t('mode.arena'), 17, 212);
      el('div', 'ru', mc).textContent = t(`mode.rule.${id}`);
      const best = id === 'blitz' ? m.blitz : m.rush;
      const bs = el('div', `bs${best > 0 ? '' : ' none'}`, mc);
      bs.dataset.testid = `events-mode-${id}-best`;
      const text = (n: number): string => (id === 'blitz' ? t('mode.best.blitz', { n: Math.round(n) }) : t('mode.best.bossrush', { n: Math.round(n), m: RUSH_BOSSES, t: m.rushTime.toFixed(1) }));
      fitText(bs, best > 0 ? text(best) : t('mode.bestNone'), 22, 280);
      if (best > 0) bests.push({ e: bs, n: best, text });
      if (open) {
        const go = el('div', 'go', mc);
        go.dataset.testid = `events-mode-${id}-play`;
        iconCanvas(go, 34, 38, (g) => g.at(17, 19, 0.78, 0.78, 0, () => drawPlay(g, 0, 0)));
        fitText(el('span', '', go), t('core.play'), 34, 200);
        pressable(go, () => true, ui.unlock, () => {
          ui.audio.play('tap');
          hooks.mode(id);
        });
        // the way in catches the light now and then, the two a beat apart
        shineLoop(go, 3800, id === 'blitz' ? 1900 : 2700);
      } else {
        const lk = el('div', 'lk', mc);
        lk.dataset.testid = `events-mode-${id}-lock`;
        iconCanvas(lk, 30, 34, (g) => drawLock(g, 15, 18));
        el('span', '', lk).textContent = t(`mode.lock.${id}`);
      }
    }
    // a mode run is short: only the first few of a day earn a run chest (sim/modes.ts)
    const chestsLeft = modeChestsLeft(save, key);
    const chests = el('div', 'ok-ev-chests', wrap);
    chests.dataset.testid = 'events-mode-chests';
    iconCanvas(chests, 46, 38, (g) => drawChestIcon(g, 'wood', 23, 20, 0.45));
    el('span', '', chests).textContent = t('mode.chests', { n: chestsLeft, m: MODE_CHESTS_PER_DAY });
    if (chestsLeft === 0) chests.style.opacity = '0.55';

    if (animate && !calm) {
      cards.forEach((e, i) => e.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 40 + i * 60, duration: 320, easing: EASE.backOut, fill: 'backwards' }));
      chests.animate([{ opacity: 0 }, { opacity: Number(chests.style.opacity || 0.85) }], { delay: 300, duration: 260, fill: 'backwards' });
      // a personal best counts up as its card lands, then pops
      for (const b of bests) {
        b.e.textContent = b.text(0);
        window.setTimeout(() => {
          if (!b.e.isConnected) return;
          countTo(b.e, 0, b.n, Math.min(700, 260 + b.n * 14), b.text);
          window.setTimeout(() => {
            if (b.e.isConnected) pop(b.e, 1.12, 360);
          }, Math.min(700, 260 + b.n * 14));
        }, 320);
      }
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

/** Blitz: a stopwatch with a lightning bolt across its face. */
function drawStopwatch(g: Gfx, x: number, y: number): void {
  g.fillStyle(INK, 1).fillRoundedRect(x - 8, y - 33, 16, 12, 4);
  g.fillStyle(PALETTE.cream, 1).fillRoundedRect(x - 4, y - 30, 8, 8, 2);
  g.lineStyle(7, INK, 1).lineBetween(x + 17, y - 20, x + 23, y - 26);
  g.fillStyle(INK, 1).fillCircle(x, y, 25);
  g.fillStyle(PALETTE.cream, 1).fillCircle(x, y, 20);
  const bolt = (k: number, c: number): void => {
    g.fillStyle(c, 1).fillPoints([
      { x: x + 4 * k, y: y - 17 * k },
      { x: x - 10 * k, y: y + 3 * k },
      { x: x - 1 * k, y: y + 3 * k },
      { x: x - 5 * k, y: y + 17 * k },
      { x: x + 10 * k, y: y - 4 * k },
      { x: x + 1 * k, y: y - 4 * k },
    ]);
  };
  bolt(1.2, INK);
  bolt(0.92, 0xffb02e);
}

/** Boss Rush: a crown with three points, a red gem and a dark band. */
function drawCrown(g: Gfx, x: number, y: number): void {
  const crown = (k: number, c: number): void => {
    g.fillStyle(c, 1).fillPoints([
      { x: x - 24 * k, y: y + 16 * k },
      { x: x - 27 * k, y: y - 12 * k },
      { x: x - 12 * k, y: y + 1 * k },
      { x, y: y - 22 * k },
      { x: x + 12 * k, y: y + 1 * k },
      { x: x + 27 * k, y: y - 12 * k },
      { x: x + 24 * k, y: y + 16 * k },
    ]);
  };
  crown(1.16, INK);
  crown(1, PALETTE.gold);
  g.fillStyle(mix(PALETTE.gold, 0x8a4a00, 0.45), 1).fillRect(x - 23, y + 8, 46, 8);
  g.fillStyle(INK, 1).fillCircle(x, y + 1, 8);
  g.fillStyle(PALETTE.danger, 1).fillCircle(x, y + 1, 5.5);
  for (const dx of [-27, 0, 27]) {
    g.fillStyle(INK, 1).fillCircle(x + dx, y - (dx === 0 ? 24 : 14), 6);
    g.fillStyle(PALETTE.cream, 1).fillCircle(x + dx, y - (dx === 0 ? 24 : 14), 3.5);
  }
}

/** A padlock (a mode still to be opened). */
function drawLock(g: Gfx, x: number, y: number): void {
  g.lineStyle(5, PALETTE.cream, 1).beginPath().arc(x, y - 5, 7, Math.PI, 0).strokePath();
  g.fillStyle(PALETTE.cream, 1).fillRoundedRect(x - 11, y - 5, 22, 17, 5);
  g.fillStyle(INK, 1).fillCircle(x, y + 3, 3);
}
