/**
 * The main menu's Shop tab ("Mağaza"), a pane inside the tab shell (shell.ts), in two views:
 *
 * - offers: the day's three weapon-shard offers (`dailyOffers`, snapshotted for the day; bought ones
 *   show "Bought") with the time left until they change at local midnight; the two chests sold for
 *   coins (`buyChest`, queued like every chest) with the odds sheet that prints `CHEST_ODDS` exactly
 *   as the roll uses them; and "▶ AD: +X coins" (`ui.rewarded('shop_coins')`, `grantAdCoins`), gone
 *   once the day's three are used
 * - looks: the archer's looks (the old full-screen shop's): a preview with wear / buy, and the grid;
 *   a look unlocked by progress or bought (`buyCosmetic`) is the player's
 *
 * Coins only: no real money anywhere. Every rule is the simulation's (sim/shop.ts, sim/chests.ts,
 * sim/meta.ts); every change goes through `save.update` (persisted at once) and tells the shell
 * (`changed`), which updates the top bar and the badges. Without ads (the web build: `rewarded`
 * resolves false) everything still works; the ad button just shows the neutral "no ad" notice.
 */
import { drawHeadIcon } from '@okcu/scenes/art';
import { drawCoin } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { powerOf, type ChestKind } from '@sim/arsenal';
import { CHEST_ODDS, SLING_UNLOCK_SHARDS } from '@sim/chests';
import { COSMETICS, cosmeticById, isUnlocked, type SaveData } from '@sim/meta';
import { unlockFeats } from '@sim/progress';
import { adCoins, AD_COINS_PER_DAY, boughtToday, buyChest, buyCosmetic, buyOffer, CHEST_PRICE, COSMETIC_PRICE, dailyOffers, grantAdCoins } from '@sim/shop';
import { WEAPON_MAX } from '@sim/weapons';
import { BOSS_KINDS } from '@sim/world';
import { calmMotion, EASE, el, fitText, iconCanvas, mix, pressable, TAB_BAR_H } from './dom';
import { css, type Gfx, rgba } from './gfx';
import { todayKey } from './save';
import { featLine } from './progress';
import type { Ui } from './screens';
import { drawShard, drawWeaponIcon, WEAPON_TINT } from './weapons';

export type ShopView = 'offers' | 'looks';

export interface ShopHooks {
  /** the save changed here: `power` is the POWER before the change (the shell updates the top bar from it) */
  changed: (power: number) => void;
  /** good news at the top (a chest bought, ad coins, an achievement) */
  toast: (head: string, sub: string) => void;
}

export interface ShopPane {
  /** draw again from the save (another tab changed it) */
  refresh(): void;
  destroy(): void;
}

/** the view survives a rebuild of the pane (relayout, a new world); the Weapons tab's "Looks" sets it */
let view: ShopView = 'offers';
/** the look in the preview */
let lookFocus: string | null = null;

export function setShopView(v: ShopView): void {
  view = v;
}

const INK = PALETTE.ink;
const X0 = 24;
const WIDTH = 720 - 2 * X0;
const SHARD = 0xa77bff;
const AD_GREEN = 0x5fd36a;
export const CHEST_KINDS: readonly ChestKind[] = ['wood', 'silver', 'gold', 'boss'];

const STYLE = `
.ok-sh{position:absolute;left:${X0}px;width:${WIDTH}px;display:flex;flex-direction:column}
.ok-sh-card{position:relative;border-radius:24px;background:${rgba(INK, 0.82)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.14),0 6px 0 ${rgba(INK, 0.4)}}
.ok-sh-seg{height:72px;border-radius:36px;display:flex;padding:7px;gap:7px;flex:none}
.ok-sh-seg>div{flex:1;border-radius:29px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1;color:${css(PALETTE.cream)};opacity:.72;white-space:nowrap;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .09s ease-out}
.ok-sh-seg>div.on{opacity:1;color:${css(INK)};background:linear-gradient(180deg,#ffe27a,#ffc93c);box-shadow:0 4px 0 ${rgba(0xc76e0a, 0.6)}}
.ok-sh-seg>div.down{transform:scale(.95)}
.ok-sh-head{display:flex;align-items:center;justify-content:space-between;gap:10px;height:48px;padding:0 4px;flex:none}
.ok-sh-head>b{font-size:34px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap;-webkit-text-stroke:8px ${css(INK)};paint-order:stroke fill}
.ok-sh-pill{height:40px;padding:0 16px 0 10px;border-radius:20px;background:${rgba(INK, 0.82)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.12);display:flex;align-items:center;gap:6px;font-size:21px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-sh-pill.btn{pointer-events:auto;cursor:pointer;touch-action:none;background:#6b4ca8;box-shadow:0 4px 0 ${rgba(INK, 0.5)};transition:transform .09s ease-out}
.ok-sh-pill.btn.down{transform:scale(.94)}
.ok-sh-row{display:flex;gap:14px;flex:none}
.ok-sh-off{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;padding:10px 10px 14px;gap:6px}
.ok-sh-plate{position:relative;width:100%;flex:1;min-height:0;border-radius:18px;box-shadow:inset 0 0 0 4px ${rgba(INK, 0.45)},inset 0 -8px 0 rgba(0,0,0,.16);overflow:hidden}
.ok-sh-plate>canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.ok-sh-name{font-size:24px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-sh-shards{display:flex;align-items:center;gap:4px;font-size:25px;line-height:1;color:${css(mix(SHARD, 0xffffff, 0.45))};white-space:nowrap}
.ok-sh-tag{position:absolute;right:8px;top:8px;height:30px;padding:0 10px;border-radius:15px;background:${css(PALETTE.danger)};border:3px solid ${css(INK)};color:#fff;font-size:18px;line-height:24px;white-space:nowrap}
.ok-sh-off.done .ok-sh-plate{filter:saturate(.3) brightness(.6)}
.ok-sh-btn{position:relative;height:64px;border-radius:24px;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 10px 3px;white-space:nowrap;font-size:28px;line-height:1;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .09s ease-out,opacity .15s;box-shadow:0 7px 0 ${rgba(INK, 0.55)};background:#ffc93c;color:${css(INK)};flex:none}
.ok-sh-btn::after{content:'';position:absolute;left:10px;right:10px;top:6px;height:32%;background:rgba(255,255,255,.2);border-radius:14px;pointer-events:none}
.ok-sh-btn.s{background:#6b4ca8;color:#fff}
.ok-sh-btn.down{transform:scale(.94)}
.ok-sh-btn.off{opacity:.45;cursor:default}
.ok-sh-btn.got{opacity:1;background:${rgba(PALETTE.heal, 0.14)};color:${css(PALETTE.heal)};box-shadow:inset 0 0 0 4px ${rgba(PALETTE.heal, 0.8)};cursor:default}
.ok-sh-btn.got::after{display:none}
.ok-sh-btn .red{color:${css(PALETTE.danger)}}
.ok-sh-chest{flex:1;min-width:0;display:flex;flex-direction:column;padding:10px 14px 16px;gap:8px}
.ok-sh-chest .top{flex:1;min-height:0;display:flex;align-items:center;gap:8px}
.ok-sh-chest .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ok-sh-chest .tx b{font-size:27px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-sh-chest .tx span{display:flex;align-items:center;gap:6px;font-size:21px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-sh-chest .tx em{font-style:normal}
.ok-sh-ad{position:relative;height:100px;border-radius:34px;border:5px solid ${css(INK)};background:linear-gradient(180deg,${css(mix(AD_GREEN, 0xffffff, 0.3))},${css(AD_GREEN)} 55%,${css(mix(AD_GREEN, 0x1f7a3a, 0.45))});box-shadow:0 9px 0 ${rgba(INK, 0.55)},inset 0 4px 0 rgba(255,255,255,.4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${css(INK)};pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .09s ease-out,opacity .15s;flex:none}
.ok-sh-ad>b{font-size:34px;line-height:1;white-space:nowrap;display:flex;align-items:center;gap:6px}
.ok-sh-ad>span{font-size:19px;line-height:1;opacity:.8;white-space:nowrap}
.ok-sh-ad.down{transform:scale(.96)}
.ok-sh-ad.off{opacity:.5;cursor:default}
.ok-sh-empty{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 30px;font-size:24px;line-height:1.25;color:${css(PALETTE.cream)};opacity:.85}
.ok-sh-prev{display:flex;align-items:center;gap:16px;padding:14px 18px;flex:none}
.ok-sh-prev .face{position:relative;border-radius:28px;flex:none;background:radial-gradient(circle at 40% 32%,#bfe8ff,#5aa9e6 70%);box-shadow:inset 0 0 0 4px ${rgba(INK, 0.45)},inset 0 -10px 0 rgba(0,0,0,.15)}
.ok-sh-prev .face>canvas{position:absolute;left:0;top:0}
.ok-sh-prev .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
.ok-sh-prev .tx b{font-size:38px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap;-webkit-text-stroke:8px ${css(INK)};paint-order:stroke fill}
.ok-sh-prev .tx span{font-size:21px;line-height:1.15;color:${css(PALETTE.cream)};opacity:.9}
.ok-sh-looks{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;flex:none}
.ok-sh-look{position:relative;border-radius:22px;background:${rgba(INK, 0.82)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.14),0 5px 0 ${rgba(INK, 0.4)};pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .1s ease-out}
.ok-sh-look.down{transform:scale(.93)}
.ok-sh-look.on{background:${rgba(mix(INK, 0x4a2c5c, 0.6), 0.92)};box-shadow:inset 0 0 0 5px ${css(PALETTE.gold)},0 5px 0 ${rgba(INK, 0.4)},0 0 18px ${rgba(PALETTE.gold, 0.45)}}
.ok-sh-look>canvas{position:absolute;left:50%;top:6px;transform:translateX(-50%)}
.ok-sh-look .pr{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);height:30px;padding:0 10px 0 6px;border-radius:15px;background:${css(INK)};display:flex;align-items:center;gap:3px;font-size:19px;line-height:1;color:${css(PALETTE.coin)};white-space:nowrap}
.ok-sh-look .ck{position:absolute;right:6px;top:6px}
.ok-sh-modal{position:absolute;left:0;top:0;width:720px;height:1280px}
.ok-sh-board{position:absolute;left:30px;width:660px;border-radius:30px;border:6px solid ${css(INK)};background:${rgba(mix(INK, 0x3a2450, 0.5), 0.97)};box-shadow:0 12px 0 ${rgba(INK, 0.45)},inset 0 0 0 3px rgba(255,255,255,.12);padding:22px 22px 26px;display:flex;flex-direction:column;gap:10px;pointer-events:auto}
.ok-sh-board>h2{margin:0;text-align:center;font-size:44px;line-height:1.1;font-weight:inherit;color:${css(PALETTE.gold)};-webkit-text-stroke:9px ${css(INK)};paint-order:stroke fill}
.ok-sh-odds{display:grid;grid-template-columns:1fr 148px 84px 74px;align-items:center;column-gap:8px;row-gap:8px}
.ok-sh-odds>.h{font-size:20px;line-height:1;color:${css(PALETTE.cream)};opacity:.7;text-align:center;white-space:nowrap}
.ok-sh-odds>.k{display:flex;align-items:center;gap:8px;min-width:0;height:78px;border-radius:18px;background:${rgba(0xffffff, 0.06)};padding-left:4px}
.ok-sh-odds>.k .nm{display:flex;flex-direction:column;gap:4px;min-width:0}
.ok-sh-odds>.k b{font-size:23px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-sh-odds>.k span{font-size:17px;line-height:1;color:${css(PALETTE.cream)};opacity:.75;white-space:nowrap}
.ok-sh-odds>.v{font-size:24px;line-height:1;color:#fff;text-align:center;white-space:nowrap}
.ok-sh-odds>.v.p{color:${css(PALETTE.heal)}}
.ok-sh-note{font-size:19px;line-height:1.3;color:${css(PALETTE.cream)};opacity:.85}
`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** h:mm:ss (or m:ss under an hour) */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** ms until the next local midnight (when `todayKey()` changes: the offers, the ad coins and the daily) */
export function msToMidnight(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime();
}

export function createShopPane(ui: Ui, pane: HTMLElement, top: number, bot: number, hooks: ShopHooks, quiet: boolean): ShopPane {
  injectStyle();
  const t = ui.t;
  const save = ui.game.save;
  const calm = calmMotion();
  let alive = true;
  let adBusy = false;
  let modal: HTMLElement | null = null;
  let resetEl: HTMLElement | null = null;
  let shownDay = todayKey();

  const scrim = el('div', 'ok-s-scrim', pane);
  scrim.dataset.ui = '1';
  scrim.style.background = rgba(INK, 0.62);
  const y0 = top + 132;
  const y1 = bot - TAB_BAR_H - 22;
  const avail = y1 - y0;
  const wrap = el('div', 'ok-sh', pane);
  if (calm) wrap.classList.add('ok-sh-calm');
  wrap.style.top = `${y0}px`;
  wrap.style.height = `${avail}px`;
  // a press on the free space of the pane does nothing (and never reaches the scene)
  wrap.dataset.ui = '1';

  const seg = el('div', 'ok-sh-card ok-sh-seg', wrap);
  const segs = new Map<ShopView, HTMLElement>();
  for (const v of ['offers', 'looks'] as const) {
    const s = el('div', '', seg);
    s.dataset.testid = `shop-seg-${v}`;
    s.textContent = t(v === 'offers' ? 'shop.tabOffers' : 'shop.tabLooks');
    segs.set(v, s);
    pressable(s, () => view !== v, ui.unlock, () => {
      ui.audio.play('tap');
      view = v;
      render(true);
    });
  }
  const body = el('div', '', wrap);
  body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';

  const tick = window.setInterval(() => {
    if (!alive) return;
    if (todayKey() !== shownDay) render(false);
    else if (resetEl) resetEl.textContent = t('shop.resetIn', { t: clock(msToMidnight()) });
  }, 1000);

  // ---------------------------------------------------------------- offers

  function renderOffers(d: SaveData): void {
    const key = shownDay;
    let offers: ReturnType<typeof dailyOffers> = [];
    // a new day snapshots its offers into the save: persist that at once
    save.update((s) => {
      offers = dailyOffers(key, s);
    });
    const bought = boughtToday(save.data, key);
    const fixed = 48 * 2 + 100;
    const offerH = Math.round(Math.max(236, Math.min(330, (avail - 72 - fixed - 6 * 16) * 0.58)));
    const chestH = Math.round(Math.max(176, Math.min(226, avail - 72 - fixed - offerH - 6 * 16)));
    const gap = Math.max(12, Math.min(30, Math.floor((avail - 72 - fixed - offerH - chestH) / 6)));
    wrap.style.gap = `${gap}px`;
    body.style.gap = `${gap}px`;

    // ---- the day's offers
    const h1 = el('div', 'ok-sh-head', body);
    fitText(el('b', '', h1), t('shop.offers'), 34, 330);
    const pill = el('div', 'ok-sh-pill', h1);
    iconCanvas(pill, 26, 26, (g) => drawClock(g, 13, 13, 11));
    resetEl = el('span', '', pill);
    resetEl.textContent = t('shop.resetIn', { t: clock(msToMidnight()) });
    const row = el('div', 'ok-sh-row', body);
    row.style.height = `${offerH}px`;
    if (offers.length === 0) {
      const e = el('div', 'ok-sh-card ok-sh-empty', row);
      e.textContent = t('shop.noOffers');
    }
    offers.forEach((o, i) => {
      const w = d.arsenal.weapons[o.weapon];
      const got = bought.includes(i);
      const maxed = w.level >= WEAPON_MAX;
      const c = el('div', `ok-sh-card ok-sh-off${got ? ' done' : ''}`, row);
      c.dataset.offer = String(i);
      const plate = el('div', 'ok-sh-plate', c);
      const tint = WEAPON_TINT[o.weapon];
      plate.style.background = `radial-gradient(circle at 34% 28%, ${css(mix(tint, 0xffffff, 0.45))}, ${css(tint)} 62%, ${css(mix(tint, INK, 0.3))})`;
      const ph = offerH - 150;
      iconCanvas(plate, 190, ph, (g) => drawWeaponIcon(g, o.weapon, 95, ph / 2 + 2, Math.min(0.92, ph / 104), { level: w.owned ? w.level : 1 }));
      if (!w.owned) el('div', 'ok-sh-tag', plate).textContent = o.weapon === 'sling' ? `${Math.min(w.shards, SLING_UNLOCK_SHARDS)}/${SLING_UNLOCK_SHARDS}` : t('shop.newTag');
      fitText(el('div', 'ok-sh-name', c), t(`weapon.${o.weapon}`), 24, 190);
      const sh = el('div', 'ok-sh-shards', c);
      iconCanvas(sh, 22, 28, (g) => drawShard(g, 11, 14, 0.85));
      el('span', '', sh).textContent = t('shop.shards', { n: o.shards });
      const ok = !got && !maxed && d.coins >= o.coins;
      const b = btn(c, 'p', ok, () => buyOfferAt(i, c));
      b.dataset.testid = `shop-offer-${i}`;
      b.style.alignSelf = 'stretch';
      if (got) {
        b.classList.remove('off');
        b.classList.add('got');
        b.textContent = `✓ ${t('shop.bought')}`;
        fitText(b, b.textContent, 26, 170);
      } else if (maxed) {
        fitText(b, t('weapons.maxBtn'), 24, 170);
      } else price(b, o.coins, d.coins >= o.coins, 28);
    });

    // ---- chests for coins (the odds sheet beside the heading)
    const h2 = el('div', 'ok-sh-head', body);
    fitText(el('b', '', h2), t('shop.chests'), 34, 300);
    const odds = el('div', 'ok-sh-pill btn', h2);
    odds.dataset.testid = 'shop-odds';
    iconCanvas(odds, 28, 28, (g) => drawInfo(g, 14, 14, 12));
    el('span', '', odds).textContent = t('shop.odds');
    pressable(odds, () => modal === null, ui.unlock, () => {
      ui.audio.play('tap');
      openOdds();
    });
    const crow = el('div', 'ok-sh-row', body);
    crow.style.height = `${chestH}px`;
    for (const kind of ['silver', 'gold'] as const) {
      const c = el('div', 'ok-sh-card ok-sh-chest', crow);
      const tp = el('div', 'top', c);
      const ih = Math.min(104, chestH - 84);
      iconCanvas(tp, 110, ih, (g) => drawChestIcon(g, kind, 55, ih / 2 + 4, Math.min(1.25, ih / 76)));
      const tx = el('div', 'tx', tp);
      fitText(el('b', '', tx), t(`chest.${kind}`), 27, 180);
      const od = CHEST_ODDS[kind];
      const c1 = el('span', '', tx);
      iconCanvas(c1, 22, 22, (g) => drawCoin(g.phaser, 11, 11, 8.5));
      el('em', '', c1).textContent = `${od.coins[0]}–${od.coins[1]}`;
      const c2 = el('span', '', tx);
      iconCanvas(c2, 22, 24, (g) => drawShard(g, 11, 12, 0.72));
      el('em', '', c2).textContent = `${od.shards[0]}–${od.shards[1]}`;
      const cost = CHEST_PRICE[kind];
      const b = btn(c, 'p', d.coins >= cost, () => buyChestKind(kind, c));
      b.dataset.testid = `shop-chest-${kind}`;
      price(b, cost, d.coins >= cost, 28);
    }

    // ---- the rewarded coins: three a day, gone after that
    const n = adCoins(d, key);
    if (n !== null) {
      const used = d.arsenal.adCoinsDay === key ? d.arsenal.adCoinsUsed : 0;
      const ad = el('div', `ok-sh-ad${adBusy ? ' off' : ''}`, body);
      ad.dataset.testid = 'shop-ad-coins';
      const b = el('b', '', ad);
      b.textContent = t('shop.adCoins', { n });
      el('span', '', ad).textContent = t('shop.adLeft', { n: AD_COINS_PER_DAY - used, m: AD_COINS_PER_DAY });
      pressable(ad, () => !adBusy, ui.unlock, () => {
        ui.audio.play('tap');
        void watchAd(ad);
      });
    }
  }

  function buyOfferAt(i: number, card: HTMLElement): void {
    // the card belongs to the day on screen: after midnight it may be another day's offer, so draw the new day instead
    if (todayKey() !== shownDay) {
      ui.audio.playPreset(SFX.cancel);
      render(false);
      return;
    }
    const before = powerOf(save.data);
    const key = shownDay;
    let ok = false;
    let got: string[] = [];
    let offer: { weapon: string; shards: number } | null = null;
    let unlocked = false;
    save.update((d) => {
      offer = dailyOffers(key, d)[i] ?? null;
      const owned = offer ? d.arsenal.weapons[offer.weapon as 'sling'].owned : true;
      ok = buyOffer(d, key, i);
      if (ok && offer) {
        unlocked = !owned && d.arsenal.weapons[offer.weapon as 'sling'].owned;
        got = unlockFeats(d, null);
      }
    });
    if (!ok || !offer) {
      ui.audio.playPreset(SFX.cancel);
      render(false);
      return;
    }
    const o = offer as { weapon: string; shards: number };
    ui.audio.play('coin');
    render(false);
    pulse(body.querySelector<HTMLElement>(`[data-offer="${i}"]`) ?? card);
    hooks.changed(before);
    if (unlocked) hooks.toast(t('shop.weaponGot'), t(`weapon.${o.weapon}`));
    else hooks.toast(t('shop.offerGot'), t('shop.offerSub', { n: o.shards, w: t(`weapon.${o.weapon}`) }));
    feats(got);
  }

  function buyChestKind(kind: 'silver' | 'gold', card: HTMLElement): void {
    const before = powerOf(save.data);
    let ok = false;
    let n = 0;
    save.update((d) => {
      ok = buyChest(d, kind);
      n = d.arsenal.chests.length;
    });
    if (!ok) {
      ui.audio.playPreset(SFX.cancel);
      return;
    }
    ui.audio.playPreset(SFX.loot);
    render(false);
    void card;
    const again = body.querySelector<HTMLElement>(`[data-testid="shop-chest-${kind}"]`)?.parentElement;
    if (again) pulse(again);
    hooks.changed(before);
    // the chest opening comes with its own screen; until then the chest waits in the line
    hooks.toast(t('shop.chestGot'), t('shell.chestQueued', { k: t(`chest.${kind}`), n }));
  }

  async function watchAd(ad: HTMLElement): Promise<void> {
    if (adBusy) return;
    adBusy = true;
    ad.classList.add('off');
    const watched = await ui.rewarded('shop_coins');
    adBusy = false;
    // the ad was watched: the coins are the player's even if the pane went away meanwhile
    const before = powerOf(save.data);
    let granted = 0;
    if (watched) {
      const key = todayKey();
      save.update((d) => {
        const n = adCoins(d, key);
        if (n !== null && grantAdCoins(d, key)) granted = n;
      });
    }
    if (granted > 0) {
      ui.audio.play('coin');
      hooks.changed(before);
      hooks.toast(t('shop.adGot'), t('shop.coins', { n: granted }));
    }
    if (alive) render(false);
  }

  // ---------------------------------------------------------------- the odds sheet

  function openOdds(): void {
    closeOdds();
    const m = el('div', 'ok-sh-modal', pane);
    modal = m;
    const sc = el('div', 'ok-s-scrim', m);
    sc.dataset.ui = '1';
    sc.style.background = rgba(INK, 0.6);
    sc.addEventListener('pointerdown', (e) => e.stopPropagation());
    sc.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      closeOdds();
    });
    const board = el('div', 'ok-sh-board', m);
    board.dataset.testid = 'shop-odds-sheet';
    board.dataset.ui = '1';
    board.addEventListener('pointerdown', (e) => e.stopPropagation());
    board.addEventListener('pointerup', (e) => e.stopPropagation());
    const h = el('h2', '', board);
    fitText(h, t('odds.title'), 44, 600);
    const grid = el('div', 'ok-sh-odds', board);
    for (const k of ['', 'odds.coins', 'odds.shards', 'odds.sling']) {
      const c = el('div', 'h', grid);
      if (k) fitText(c, t(k), 20, 106);
    }
    const src: Record<ChestKind, string> = { wood: 'odds.free', silver: 'odds.sale', gold: 'odds.sale', boss: 'odds.boss' };
    for (const kind of CHEST_KINDS) {
      // printed straight from CHEST_ODDS: the numbers the roll uses (inclusive ranges, the chance as a percent)
      const o = CHEST_ODDS[kind];
      const k = el('div', 'k', grid);
      iconCanvas(k, 74, 64, (g) => drawChestIcon(g, kind, 37, 34, 0.74));
      const nm = el('div', 'nm', k);
      fitText(el('b', '', nm), t(`chest.${kind}`), 23, 180);
      fitText(el('span', '', nm), t(src[kind]), 17, 180);
      el('div', 'v', grid).textContent = `${o.coins[0]}–${o.coins[1]}`;
      el('div', 'v', grid).textContent = `${o.shards[0]}–${o.shards[1]}`;
      const p = el('div', 'v p', grid);
      p.textContent = ui.t('odds.pct', { n: Math.round(o.newWeaponChance * 1000) / 10 });
    }
    el('div', 'ok-sh-note', board).textContent = t('odds.note');
    const close = btn(board, 's', true, () => {
      ui.audio.play('tap');
      closeOdds();
    });
    close.dataset.testid = 'shop-odds-close';
    close.style.cssText += ';height:80px;font-size:32px;margin:6px 120px 0';
    close.textContent = t('odds.close');
    // centred in the pane's free space
    const r = board.getBoundingClientRect();
    const host = pane.getBoundingClientRect();
    const k = host.width / 720 || 1;
    const bh = r.height / k || 760;
    board.style.top = `${Math.max(y0, y0 + (avail - bh) / 2)}px`;
    if (!calm) board.animate([{ transform: 'scale(0.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE.backOut });
  }

  function closeOdds(): void {
    modal?.remove();
    modal = null;
  }

  // ---------------------------------------------------------------- looks

  function renderLooks(d: SaveData): void {
    resetEl = null;
    const gap = 16;
    wrap.style.gap = `${gap}px`;
    body.style.gap = `${gap}px`;
    const rows = Math.ceil(COSMETICS.length / 4);
    const prevH = Math.round(Math.max(196, Math.min(250, (avail - 72 - 2 * gap) * 0.26)));
    const tileH = Math.round(Math.max(104, Math.min(150, (avail - 72 - 2 * gap - prevH - (rows - 1) * 12) / rows)));
    if (lookFocus === null || !COSMETICS.some((c) => c.id === lookFocus)) lookFocus = d.cosmetic;
    const cos = cosmeticById(lookFocus);
    const owned = isUnlocked(cos, d.best, d.runs, d.bosses, d.arsenal.boughtLooks);
    const worn = d.cosmetic === cos.id;
    const cost = COSMETIC_PRICE(cos.id);

    const prev = el('div', 'ok-sh-card ok-sh-prev', body);
    prev.style.height = `${prevH}px`;
    prev.dataset.testid = 'shop-look-preview';
    const fs = prevH - 28;
    const face = el('div', 'face', prev);
    face.style.width = face.style.height = `${fs}px`;
    iconCanvas(face, fs, fs, (g) => drawHeadIcon(g.phaser, fs / 2, fs / 2 + fs * 0.08, fs * 0.27, cos, owned));
    const tx = el('div', 'tx', prev);
    fitText(el('b', '', tx), t(`cos.${cos.id}`), 38, 380);
    const note = el('span', '', tx);
    note.textContent = owned ? t('shop.owned') : t('shop.orBuy', { c: unlockText(cos.id) });
    const b = btn(tx, worn ? 's' : 'p', !worn && (owned || (cost !== null && d.coins >= cost)), () => lookAction(cos.id));
    b.dataset.testid = 'shop-look-action';
    b.style.alignSelf = 'flex-start';
    b.style.minWidth = '220px';
    if (worn) {
      b.classList.remove('off');
      b.classList.add('got');
      b.textContent = `✓ ${t('shop.worn')}`;
    } else if (owned) {
      b.textContent = t('shop.wear');
    } else if (cost !== null) {
      el('span', '', b).textContent = `${t('shop.buy')} · `;
      price(b, cost, d.coins >= cost, 28);
    }

    const grid = el('div', 'ok-sh-looks', body);
    for (const c of COSMETICS) {
      const tile = el('div', `ok-sh-look${c.id === lookFocus ? ' on' : ''}`, grid);
      tile.dataset.testid = `shop-look-${c.id}`;
      tile.style.height = `${tileH}px`;
      const un = isUnlocked(c, d.best, d.runs, d.bosses, d.arsenal.boughtLooks);
      const hs = tileH - (un ? 16 : 42);
      iconCanvas(tile, 140, hs, (g) => drawHeadIcon(g.phaser, 70, hs / 2 + 6, Math.min(30, hs * 0.27), c, un));
      if (d.cosmetic === c.id) {
        const ck = iconCanvas(tile, 34, 34, (g) => drawTick(g, 17, 17));
        ck.classList.add('ck');
        ck.style.position = 'absolute';
      }
      const p = COSMETIC_PRICE(c.id);
      if (!un && p !== null) {
        const pr = el('div', 'pr', tile);
        iconCanvas(pr, 24, 24, (g) => drawCoin(g.phaser, 12, 12, 9));
        const s = el('span', '', pr);
        s.textContent = String(p);
        if (d.coins < p) s.style.color = css(PALETTE.danger);
      }
      pressable(tile, () => true, ui.unlock, () => {
        if (lookFocus === c.id) {
          // a second tap on a look the player has wears it
          if (un && d.cosmetic !== c.id) lookAction(c.id);
          return;
        }
        ui.audio.play('tap');
        lookFocus = c.id;
        render(false);
      });
    }
  }

  function unlockText(id: string): string {
    const c = cosmeticById(id);
    return c.boss !== undefined ? t('shop.boss', { b: t(`boss.${BOSS_KINDS[c.boss]!}`) }) : c.runs > 0 ? t('shop.runs', { n: c.runs }) : t('shop.unlock', { n: c.wave });
  }

  function lookAction(id: string): void {
    const before = powerOf(save.data);
    const d0 = save.data;
    const c = cosmeticById(id);
    if (d0.cosmetic === id) return;
    if (isUnlocked(c, d0.best, d0.runs, d0.bosses, d0.arsenal.boughtLooks)) {
      save.update((d) => {
        d.cosmetic = id;
      });
      ui.audio.play('pop');
      render(false);
      pulse(body.querySelector<HTMLElement>('[data-testid="shop-look-preview"]'));
      hooks.changed(before);
      return;
    }
    let ok = false;
    let got: string[] = [];
    save.update((d) => {
      ok = buyCosmetic(d, id);
      if (ok) {
        d.cosmetic = id;
        got = unlockFeats(d, null);
      }
    });
    if (!ok) {
      ui.audio.playPreset(SFX.cancel);
      return;
    }
    ui.audio.playPreset(SFX.fanfare);
    render(false);
    pulse(body.querySelector<HTMLElement>('[data-testid="shop-look-preview"]'));
    hooks.changed(before);
    hooks.toast(t('shop.lookGot'), t(`cos.${id}`));
    feats(got);
  }

  // ---------------------------------------------------------------- helpers

  function feats(got: string[]): void {
    for (const f of got) hooks.toast(t('feat.title'), featLine(t, f));
  }

  function btn(parent: HTMLElement, variant: 'p' | 's', enabled: boolean, fire: () => void): HTMLElement {
    const b = el('div', `ok-sh-btn ${variant}${enabled ? '' : ' off'}`, parent);
    pressable(b, () => enabled, ui.unlock, () => {
      if (!calm) b.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 180, easing: EASE.backOut });
      fire();
    });
    return b;
  }

  function price(b: HTMLElement, n: number, enough: boolean, size: number): void {
    const s = el('span', enough ? '' : 'red', b);
    s.style.fontSize = `${size}px`;
    s.textContent = String(n);
    iconCanvas(b, 34, 34, (g) => drawCoin(g.phaser, 17, 17, 12.5));
  }

  function pulse(e: HTMLElement | null): void {
    if (calm || !e) return;
    e.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 420, easing: EASE.backOut });
    const r = e.getBoundingClientRect();
    const host = pane.getBoundingClientRect();
    const k = host.width / 720 || 1;
    const cx = (r.left + r.width / 2 - host.left) / k;
    const cy = (r.top + r.height / 2 - host.top) / k;
    for (let i = 0; i < 12; i++) {
      const s = el('div', '', pane);
      const a = (i / 12) * Math.PI * 2;
      const dd = 70 + (i % 3) * 30;
      s.style.cssText = `position:absolute;left:${cx - 9}px;top:${cy - 9}px;width:18px;height:18px;border-radius:50%;background:${css(i % 2 ? PALETTE.gold : PALETTE.coin)};box-shadow:0 0 0 3px ${css(INK)};pointer-events:none`;
      const an = s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dd}px,${Math.sin(a) * dd}px) scale(0.3)`, opacity: 0 }], { duration: 560, easing: EASE.cubicOut, fill: 'forwards' });
      an.onfinish = () => s.remove();
    }
  }

  function render(animate: boolean): void {
    if (!alive) return;
    const d = save.data;
    for (const [v, s] of segs) s.classList.toggle('on', v === view);
    body.replaceChildren();
    resetEl = null;
    // the day this draw shows (the tick draws again once when local midnight passes)
    shownDay = todayKey();
    if (view === 'offers') renderOffers(d);
    else renderLooks(d);
    if (animate && !calm) Array.from(body.children).forEach((e, i) => (e as HTMLElement).animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: i * 35, duration: 260, easing: EASE.cubicOut, fill: 'backwards' }));
  }

  render(!quiet);
  if (!quiet && !calm) seg.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE.backOut, fill: 'backwards' });
  return {
    refresh() {
      closeOdds();
      render(false);
    },
    destroy() {
      alive = false;
      window.clearInterval(tick);
      pane.replaceChildren();
    },
  };
}

// ---------------------------------------------------------------------------- drawings

const CHEST_LOOK: Record<ChestKind, { lid: number; body: number; band: number; lock: number }> = {
  wood: { lid: 0xc47e3e, body: 0x8a4f22, band: PALETTE.gold, lock: PALETTE.gold },
  silver: { lid: 0xd3dcec, body: 0x8f9bb8, band: 0xf6f9ff, lock: 0x58a6ff },
  gold: { lid: 0xffd84f, body: 0xe39a1c, band: 0xfff4c2, lock: 0xff6f9a },
  boss: { lid: 0x9b6be0, body: 0x5f3a9c, band: 0xff4d5e, lock: PALETTE.gold },
};

/** A chest of `kind` centred on (x, y): about 80 × 62 px at s = 1. */
export function drawChestIcon(g: Gfx, kind: ChestKind, x: number, y: number, s: number): void {
  const k = CHEST_LOOK[kind];
  g.at(x, y, s, s, 0, () => {
    g.fillStyle(INK, 1).fillRoundedRect(-40, -30, 80, 62, 12);
    g.fillStyle(k.body, 1).fillRoundedRect(-35, -4, 70, 31, 7);
    g.fillStyle(k.lid, 1).fillRoundedRect(-35, -26, 70, 22, 10);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-30, -23, 40, 6, 3);
    g.fillStyle(INK, 1).fillRect(-38, -6, 76, 6);
    g.fillStyle(k.band, 1).fillRect(-25, -26, 9, 53).fillRect(16, -26, 9, 53);
    g.fillStyle(INK, 1).fillRoundedRect(-11, -12, 22, 24, 6);
    g.fillStyle(k.lock, 1).fillRoundedRect(-8, -9, 16, 18, 4);
    g.fillStyle(INK, 1).fillCircle(0, -2, 3).fillRect(-1.5, -1, 3, 6);
    if (kind === 'boss') {
      // two little horns on the lid
      g.fillStyle(INK, 1).fillTriangle(-34, -22, -20, -26, -34, -42).fillTriangle(34, -22, 20, -26, 34, -42);
      g.fillStyle(PALETTE.cream, 1).fillTriangle(-31, -25, -23, -27, -31, -36).fillTriangle(31, -25, 23, -27, 31, -36);
    }
    if (kind === 'gold') {
      g.fillStyle(0xffffff, 0.85).fillCircle(26, -18, 3).fillCircle(-28, 12, 2);
    }
  });
}

/** A little clock face (the offers' reset). */
function drawClock(g: Gfx, x: number, y: number, r: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y, r + 2);
  g.fillStyle(PALETTE.cream, 1).fillCircle(x, y, r - 1);
  g.lineStyle(3, INK, 1).lineBetween(x, y, x, y - r + 4).lineBetween(x, y, x + r - 5, y + 1);
  g.fillStyle(PALETTE.danger, 1).fillCircle(x, y, 2.5);
}

/** An "i" in a circle (the odds sheet). */
function drawInfo(g: Gfx, x: number, y: number, r: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y, r + 2);
  g.fillStyle(PALETTE.cream, 1).fillCircle(x, y, r - 1);
  g.fillStyle(INK, 1).fillCircle(x, y - 5, 2.6).fillRoundedRect(x - 2.3, y - 1, 4.6, 10, 2);
}

/** A green tick in an ink ring (the worn look). */
function drawTick(g: Gfx, x: number, y: number): void {
  g.fillStyle(INK, 1).fillCircle(x, y, 16);
  g.fillStyle(PALETTE.heal, 1).fillCircle(x, y, 12.5);
  g.lineStyle(4.5, INK, 1).lineBetween(x - 6, y, x - 1.5, y + 5).lineBetween(x - 1.5, y + 5, x + 7, y - 5);
}
