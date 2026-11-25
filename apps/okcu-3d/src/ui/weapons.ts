/**
 * The main menu's Weapons tab ("Silahlar"), a pane inside the tab shell (shell.ts):
 *
 * - the Archer card ("Okçu"): the four permanent upgrades (health, coins, reroll, head start;
 *   `buyUpgrade`) and a way to the looks (the Shop's looks screen)
 * - a 3 × 2 grid of the six weapons: level, shard bar "7/10" (shards against the next level's
 *   cost), a green "Yükselt!" when `canUpgrade`; locked ones as dashed silhouettes with how they open
 *   ("Bölüm 4 bossu", or the sling's "4/10 parça" from chests)
 * - the detail card of the focused weapon: description, stats as bars, the level perks with the
 *   next one marked, the next level's gain, "Seç" (`selectWeapon`) and "Yükselt · N parça + M"
 *   (`upgradeWeapon`, guaranteed)
 *
 * Every rule is the simulation's (sim/arsenal.ts, sim/weapons.ts, sim/meta.ts); every change goes
 * through `save.update` (persisted at once). An upgrade or a new selection tells the shell
 * (`changed`), which counts the top bar's POWER up; the weapon card pulses. A level gained is a
 * moment of its own (`levelUp`): a sunburst behind the weapon, a "Level up!" stamp, the damage bar
 * growing to its new length, and the power gained flying up into the top bar's POWER. Reduced
 * motion (`calmMotion`): no pulses, the numbers are simply set.
 *
 * The weapon icons are drawn in code (canvas), in the game's style: chunky shapes with an ink outline.
 */
import { drawHeadIcon } from '@okcu/scenes/art';
import { drawBowItem } from '@okcu/scenes/gear';
import { drawCoin, drawUpgradeIcon } from '@okcu/scenes/icons';
import { SFX } from '@okcu/sfx';
import { PALETTE } from '@okcu/textures';
import { canUpgrade, powerOf, POWER_PER_UPGRADE, selectWeapon, upgradeCost, upgradeWeapon } from '@sim/arsenal';
import { HARD_BOW_POW } from '@sim/cards';
import { SLING_UNLOCK_SHARDS } from '@sim/chests';
import { buyUpgrade, cosmeticById, UPGRADE_IDS, UPGRADES, upgradeCost as shopCost, type SaveData, type UpgradeId } from '@sim/meta';
import { unlockFeats } from '@sim/progress';
import { WEAPON_IDS, WEAPON_MAX, WEAPONS, weaponDamage, weaponPerks, type WeaponId } from '@sim/weapons';
import { BOSS_KINDS } from '@sim/world';
import { calmMotion, EASE, el, fitText, iconCanvas, mix, pressable, TAB_BAR_H } from './dom';
import { css, Gfx, rgba } from './gfx';
import { centreIn, countTo, flyTo, growBar, pop, shine, sparkle, sunburst } from './juice';
import type { Ui } from './screens';
import { featLine } from './progress';

export type Focus = WeaponId | 'archer';

export interface WeaponsHooks {
  /** the save changed here: `power` is the POWER before the change (the shell counts up from it) */
  changed: (power: number) => void;
  /** the looks (the Shop tab's looks view) */
  looks: () => void;
  /** a small piece of good news (an achievement earned by a level) */
  toast: (head: string, sub: string) => void;
}

export interface WeaponsPane {
  destroy(): void;
}

const INK = PALETTE.ink;
const X0 = 24;
const WIDTH = 720 - 2 * X0;
const SHARD = 0xa77bff;
/** each weapon's colour (its card's plate) */
export const WEAPON_TINT: Record<WeaponId, number> = { bow: 0xffb233, crossbow: 0x58a6ff, spear: 0x7cd992, boomerang: 0xff8a4c, sling: 0xd38cff, firework: 0xff6f9a };

/** the focused card survives a rebuild of the pane (relayout, a new world) */
let focus: Focus | null = null;

const STYLE = `
.ok-w{position:absolute;left:${X0}px;width:${WIDTH}px;display:flex;flex-direction:column}
.ok-w-card{position:relative;border-radius:24px;background:${rgba(INK, 0.82)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.14),0 6px 0 ${rgba(INK, 0.4)};pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .1s ease-out}
.ok-w-card.down{transform:scale(.95)}
.ok-w-card.on{background:${rgba(mix(INK, 0x4a2c5c, 0.6), 0.92)};box-shadow:inset 0 0 0 5px ${css(PALETTE.gold)},0 6px 0 ${rgba(INK, 0.4)},0 0 22px ${rgba(PALETTE.gold, 0.45)}}
.ok-w-arch{height:124px;display:flex;align-items:center;padding:0 14px 0 10px;gap:8px;flex:none}
.ok-w-arch .ttl{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.ok-w-arch .ttl b{font-size:34px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-w-arch .ttl span{font-size:19px;line-height:1.1;color:${css(PALETTE.cream)};opacity:.8}
.ok-w-chip{width:98px;height:104px;border-radius:18px;background:${rgba(0xffffff, 0.07)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;flex:none}
.ok-w-chip .n{font-size:17px;line-height:1.05;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-w-chip .l{font-size:19px;line-height:1.05;color:${css(PALETTE.gold)};white-space:nowrap}
.ok-w-chip .l.max{color:${css(PALETTE.heal)}}
.ok-w-dot{position:absolute;right:-6px;top:-10px;min-width:36px;height:36px;border-radius:18px;background:${css(PALETTE.danger)};border:4px solid ${css(INK)};color:#fff;font-size:21px;line-height:28px;text-align:center;pointer-events:none;animation:okw-pulse 1.1s ease-in-out infinite}
.ok-w-grid{display:grid;grid-template-columns:repeat(3,1fr);column-gap:14px;flex:none}
.ok-w-wc{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:16px}
.ok-w-wc>canvas.ic{position:absolute;left:50%;margin-left:-75px;pointer-events:none}
.ok-w-wc.lock{background:${rgba(mix(INK, 0x000000, 0.25), 0.84)};box-shadow:inset 0 0 0 3px rgba(255,255,255,.05)}
.ok-w-wc.lock::before{content:'';position:absolute;inset:5px;border-radius:19px;border:4px dashed rgba(255,243,214,.38);pointer-events:none}
.ok-w-wc.lock.on::before{border-color:${rgba(PALETTE.gold, 0.9)}}
.ok-w-new{position:absolute;right:-8px;top:-12px;height:34px;padding:0 12px;border-radius:17px;background:${css(PALETTE.danger)};border:4px solid ${css(INK)};color:#fff;font-size:19px;line-height:26px;white-space:nowrap;pointer-events:none;transform:rotate(8deg)}
.ok-w-lv{position:absolute;left:10px;top:10px;height:30px;padding:0 11px;border-radius:15px;background:${css(INK)};color:${css(PALETTE.gold)};font-size:20px;line-height:30px;white-space:nowrap}
.ok-w-eq{position:absolute;right:8px;top:8px}
.ok-w-name{font-size:24px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap;margin-bottom:8px}
.ok-w-bar{position:relative;width:170px;height:28px;border-radius:14px;background:${css(INK)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.14);overflow:hidden;flex:none}
.ok-w-bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:14px;background:linear-gradient(180deg,${css(mix(SHARD, 0xffffff, 0.35))},${css(SHARD)})}
.ok-w-bar.full>i{background:linear-gradient(180deg,${css(mix(PALETTE.heal, 0xffffff, 0.35))},${css(mix(PALETTE.heal, 0x1f9a52, 0.4))})}
.ok-w-bar.max>i{background:linear-gradient(180deg,${css(mix(PALETTE.gold, 0xffffff, 0.35))},${css(PALETTE.gold)})}
.ok-w-bar>span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:19px;line-height:1;color:#fff;text-shadow:0 2px 0 ${css(INK)},0 0 3px ${css(INK)}}
.ok-w-hint{font-size:19px;line-height:1.05;color:${css(PALETTE.cream)};opacity:.85;white-space:nowrap;height:28px;display:flex;align-items:center;gap:5px}
.ok-w-go{position:absolute;left:50%;bottom:-17px;height:34px;padding:0 14px;transform:translateX(-50%);border-radius:17px;background:${css(PALETTE.heal)};border:4px solid ${css(INK)};color:${css(INK)};font-size:20px;line-height:26px;white-space:nowrap;pointer-events:none;animation:okw-go 1s ease-in-out infinite}
@keyframes okw-go{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.1)}}
@keyframes okw-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
.ok-w-det{flex:1;min-height:0;cursor:default;padding:14px 20px 18px;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
.ok-w-det>*{position:relative}
.ok-w-head{display:flex;align-items:center;gap:14px;flex:none}
.ok-w-stamp{position:absolute;right:14px;top:-26px;height:56px;padding:0 22px;border-radius:28px;background:linear-gradient(180deg,#ffe27a,#ffc93c 60%,#f7a823);border:5px solid ${css(INK)};color:${css(INK)};font-size:31px;line-height:44px;white-space:nowrap;pointer-events:none;box-shadow:0 6px 0 ${rgba(INK, 0.45)};will-change:transform,opacity}
.ok-w-plate{width:92px;height:92px;border-radius:24px;flex:none;position:relative;box-shadow:inset 0 0 0 4px ${rgba(INK, 0.5)},inset 0 -8px 0 rgba(0,0,0,.18)}
.ok-w-plate>canvas{position:absolute;left:-14px;top:-14px}
.ok-w-head .t{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.ok-w-big{font-size:38px;line-height:1;color:${css(PALETTE.gold)};white-space:nowrap;-webkit-text-stroke:8px ${css(INK)};paint-order:stroke fill}
.ok-w-sub{font-size:21px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap;display:flex;align-items:center;gap:8px}
.ok-w-tag{height:28px;padding:0 10px;border-radius:14px;background:${css(PALETTE.heal)};color:${css(INK)};font-size:18px;line-height:28px}
.ok-w-desc{font-size:21px;line-height:1.2;color:${css(PALETTE.cream)};opacity:.9;flex:none}
.ok-w-stats{display:flex;flex-direction:column;gap:6px;flex:none}
.ok-w-stat{display:flex;align-items:center;gap:10px;height:22px}
.ok-w-stat b{width:118px;font-size:19px;color:${css(PALETTE.cream)};opacity:.85;white-space:nowrap;flex:none}
.ok-w-stat .tr{position:relative;flex:1;height:16px;border-radius:8px;background:${css(INK)};box-shadow:inset 0 0 0 2px rgba(255,255,255,.1);overflow:hidden}
.ok-w-stat .tr>i{position:absolute;left:0;top:0;bottom:0;border-radius:8px}
.ok-w-stat .tr>i.nx{background:${rgba(PALETTE.heal, 0.55)}}
.ok-w-stat span{width:72px;text-align:right;font-size:19px;color:#fff;white-space:nowrap;flex:none}
.ok-w-perks{display:flex;flex-wrap:wrap;gap:6px;flex:none}
.ok-w-perk{height:32px;padding:0 10px;border-radius:12px;font-size:18px;line-height:32px;white-space:nowrap;background:${rgba(0xffffff, 0.07)};color:${css(PALETTE.locked)}}
.ok-w-perk.got{background:${rgba(PALETTE.gold, 0.22)};color:${css(PALETTE.gold)}}
.ok-w-perk.nx{background:${rgba(PALETTE.heal, 0.16)};color:${css(PALETTE.heal)};box-shadow:inset 0 0 0 2px ${rgba(PALETTE.heal, 0.7)}}
.ok-w-gain{font-size:20px;line-height:1.15;color:${css(PALETTE.heal)};flex:none}
.ok-w-gain.dim{color:${css(PALETTE.cream)};opacity:.75}
.ok-w-row{display:flex;gap:12px;flex:none}
.ok-w-btn{position:relative;height:88px;border-radius:30px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 16px 4px;white-space:nowrap;pointer-events:auto;cursor:pointer;touch-action:none;transition:transform .09s ease-out,opacity .15s;box-shadow:0 8px 0 ${rgba(INK, 0.55)}}
.ok-w-btn::after{content:'';position:absolute;left:10px;right:10px;top:8px;height:34%;background:rgba(255,255,255,.18);border-radius:18px;pointer-events:none}
.ok-w-btn.p{background:#ffc93c;color:${css(INK)}}
.ok-w-btn.s{background:#6b4ca8;color:#fff}
.ok-w-btn.down{transform:scale(.94)}
.ok-w-btn.off{opacity:.45;cursor:default}
.ok-w-btn.sel{opacity:1;background:${rgba(PALETTE.heal, 0.14)};color:${css(PALETTE.heal)};box-shadow:inset 0 0 0 4px ${rgba(PALETTE.heal, 0.8)}}
.ok-w-btn.sel::after{display:none}
.ok-w-btn.rdy{overflow:hidden}
.ok-w-btn.rdy::before{content:'';position:absolute;top:-10px;bottom:-10px;left:0;width:70px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.7),rgba(255,255,255,0));transform:translateX(-120px) skewX(-18deg);animation:okw-shine 2.8s ease-in-out .5s infinite;pointer-events:none}
@keyframes okw-shine{0%,58%{transform:translateX(-120px) skewX(-18deg)}86%,100%{transform:translateX(560px) skewX(-18deg)}}
.ok-w-btn .c{display:flex;align-items:center;gap:3px}
.ok-w-up{display:flex;align-items:center;gap:12px;height:62px;flex:none}
.ok-w-up .ic{width:58px;height:58px;border-radius:29px;background:${css(PALETTE.cream)};flex:none;position:relative;box-shadow:0 0 0 4px ${css(INK)}}
.ok-w-up .ic>canvas{position:absolute;left:-6px;top:-6px}
.ok-w-up .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ok-w-up .tx b{font-size:23px;line-height:1;color:${css(PALETTE.cream)};white-space:nowrap}
.ok-w-up .tx span{font-size:18px;line-height:1;color:#fff;opacity:.8;white-space:nowrap}
.ok-w-pips{display:flex;gap:3px;height:12px;margin-top:2px}
.ok-w-pips>i{flex:1;max-width:22px;border-radius:4px;background:${css(PALETTE.pipOff)}}
.ok-w-pips>i.on{background:${css(PALETTE.gold)}}
.ok-w-up .ok-w-btn{height:62px;min-width:136px;border-radius:24px;font-size:26px;padding:0 12px 3px}
.ok-w-up .mx{min-width:136px;text-align:center;font-size:26px;color:${css(PALETTE.heal)}}
.ok-w-calm .ok-w-go,.ok-w-calm .ok-w-dot{animation:none}
.ok-w-calm .ok-w-btn.rdy::before{display:none}
`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** the level's damage factor under the 3D build's hard rules (sim/cards.ts) */
const levelDamage = (level: number): number => weaponDamage(level) ** HARD_BOW_POW;
/** a weapon's damage a hit at a level, and where that sits on the detail card's damage bar (0 … 1) */
const hitOf = (id: WeaponId, level: number): number => WEAPONS[id].dmgMul * levelDamage(level);
const dmgBar = (v: number): number => Math.max(0.06, Math.sqrt(v / (2.4 * levelDamage(WEAPON_MAX))));

/** The perk steps (levels 5, 10, 15, 20) that change something for this weapon, with their text. */
export function perkSteps(id: WeaponId, t: Ui['t']): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  for (const L of [5, 10, 15, 20]) {
    const a = weaponPerks(id, L - 1);
    const b = weaponPerks(id, L);
    if (b.pierce > a.pierce) out.push({ level: L, text: t('perk.pierce') });
    if (b.bounces > a.bounces) out.push({ level: L, text: t('perk.bounce') });
    if (b.reloadMul < a.reloadMul) out.push({ level: L, text: t('perk.reload', { n: Math.round((1 - b.reloadMul) * 100) }) });
    if (b.returnSpeedMul > a.returnSpeedMul) out.push({ level: L, text: t('perk.return', { n: Math.round((b.returnSpeedMul - 1) * 100) }) });
    if (b.blastRadiusMul > a.blastRadiusMul) out.push({ level: L, text: t('perk.blast', { n: Math.round((b.blastRadiusMul - 1) * 100) }) });
  }
  return out;
}

export function createWeaponsPane(ui: Ui, pane: HTMLElement, top: number, bot: number, hooks: WeaponsHooks, quiet: boolean, fresh: readonly WeaponId[] = []): WeaponsPane {
  injectStyle();
  const t = ui.t;
  const save = ui.game.save;
  const calm = calmMotion();
  if (focus === null) focus = save.data.arsenal.selected;

  const scrim = el('div', 'ok-s-scrim', pane);
  scrim.dataset.ui = '1';
  scrim.style.background = rgba(INK, 0.62);
  const y0 = top + 132;
  const y1 = bot - TAB_BAR_H - 22;
  const avail = y1 - y0;
  // the detail card keeps at least DET_MIN; the archer card and the grid take the rest (taller on tall phones)
  const DET_MIN = 468;
  const cardH = Math.round(Math.max(168, Math.min(214, (avail - 124 - DET_MIN - 2 * 14 - 18) / 2)));
  const gap = Math.max(14, Math.min(26, Math.round((avail - 124 - DET_MIN - 2 * cardH - 18) / 3)));
  const wrap = el('div', 'ok-w', pane);
  if (calm) wrap.classList.add('ok-w-calm');
  wrap.style.top = `${y0}px`;
  wrap.style.height = `${avail}px`;
  wrap.style.gap = `${gap}px`;

  const archer = el('div', 'ok-w-card ok-w-arch', wrap);
  archer.dataset.testid = 'archer-card';
  const grid = el('div', 'ok-w-grid', wrap);
  grid.style.rowGap = '22px';
  const cards = new Map<WeaponId, HTMLElement>();
  for (const id of WEAPON_IDS) {
    const c = el('div', 'ok-w-card ok-w-wc', grid);
    c.style.height = `${cardH}px`;
    c.dataset.testid = `weapon-card-${id}`;
    cards.set(id, c);
    pressable(c, () => true, ui.unlock, () => {
      ui.audio.play('tap');
      setFocus(id);
    });
  }
  pressable(archer, () => true, ui.unlock, () => {
    ui.audio.play('tap');
    setFocus('archer');
  });
  const detail = el('div', 'ok-w-card ok-w-det', wrap);
  detail.dataset.testid = 'weapon-detail';
  /** the detail card's damage row as last drawn (a level-up grows the bar and counts the number) */
  let dmgRow: { fill: HTMLElement; value: HTMLElement } | null = null;
  // the detail card is no button: a press on its free space does nothing (and never reaches the scene)
  detail.dataset.ui = '1';
  detail.addEventListener('pointerdown', (e) => e.stopPropagation());
  detail.addEventListener('pointerup', (e) => e.stopPropagation());

  function setFocus(f: Focus): void {
    if (focus === f) return;
    focus = f;
    render();
    if (!calm) detail.animate([{ transform: 'translateY(14px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: EASE.cubicOut });
  }

  // ---------------------------------------------------------------- the cards

  function renderArcher(d: SaveData): void {
    archer.replaceChildren();
    archer.classList.toggle('on', focus === 'archer');
    const cos = cosmeticById(d.cosmetic);
    iconCanvas(archer, 92, 104, (g) => drawHeadIcon(g.phaser, 46, 46, 30, cos, true));
    const ttl = el('div', 'ttl', archer);
    fitText(el('b', '', ttl), t('archer.title'), 34, 150);
    el('span', '', ttl).textContent = t('archer.sub');
    for (const id of UPGRADE_IDS) {
      const chip = el('div', 'ok-w-chip', archer);
      iconCanvas(chip, 54, 54, (g) => g.at(27, 27, 0.66, 0.66, 0, () => drawUpgradeIcon(g.phaser, id, 0, 0)));
      fitText(el('div', 'n', chip), t(`archer.short.${id}`), 17, 92);
      const lv = el('div', 'l', chip);
      const max = d.upgrades[id] >= UPGRADES[id].max;
      lv.classList.toggle('max', max);
      lv.textContent = max ? t('shop.max') : `${d.upgrades[id]}/${UPGRADES[id].max}`;
    }
    if (UPGRADE_IDS.some((id) => affordable(d, id))) el('div', 'ok-w-dot', archer).textContent = '!';
  }

  function renderCard(d: SaveData, id: WeaponId): void {
    const c = cards.get(id)!;
    c.replaceChildren();
    const w = d.arsenal.weapons[id];
    const locked = !w.owned;
    c.classList.toggle('lock', locked);
    c.classList.toggle('on', focus === id);
    // the icon fills the space over the name and the bar
    const ih = cardH - 80;
    const ic = iconCanvas(c, 150, ih, (g) => drawWeaponIcon(g, id, 75, ih / 2 + 2, Math.min(0.9, ih / 100), { level: w.level, silhouette: locked }), 'ic');
    ic.style.top = '6px';
    if (!locked) el('div', 'ok-w-lv', c).textContent = t('weapons.lv', { n: w.level });
    if (!locked && fresh.includes(id)) {
      const nw = el('div', 'ok-w-new', c);
      nw.dataset.testid = `weapon-new-${id}`;
      nw.textContent = t('chest.newTag');
    }
    if (!locked && d.arsenal.selected === id) {
      const eq = iconCanvas(c, 36, 36, (g) => drawCheck(g, 18, 18));
      eq.classList.add('ok-w-eq');
      eq.style.position = 'absolute';
    }
    fitText(el('div', 'ok-w-name', c), t(`weapon.${id}`), 24, 190);
    if (locked) {
      if (id === 'sling') {
        shardBar(c, Math.min(w.shards, SLING_UNLOCK_SHARDS), SLING_UNLOCK_SHARDS, t('weapons.shardsOf', { n: Math.min(w.shards, SLING_UNLOCK_SHARDS), m: SLING_UNLOCK_SHARDS }));
      } else {
        const h = el('div', 'ok-w-hint', c);
        iconCanvas(h, 22, 26, (g) => drawLock(g, 11, 14, 0.8));
        fitText(el('span', '', h), t('weapons.bossLock', { n: (WEAPONS[id].unlockBoss ?? 0) + 1 }), 19, 160);
      }
      return;
    }
    const cost = upgradeCost(w.level);
    if (!cost) {
      const b = shardBar(c, 1, 1, t('shop.max'));
      b.classList.add('max');
      return;
    }
    const b = shardBar(c, w.shards, cost.shards, `${w.shards}/${cost.shards}`);
    b.classList.toggle('full', w.shards >= cost.shards);
    if (canUpgrade(d, id)) el('div', 'ok-w-go', c).textContent = t('weapons.upgradable');
  }

  function shardBar(parent: HTMLElement, n: number, m: number, label: string): HTMLElement {
    const b = el('div', 'ok-w-bar', parent);
    const fill = el('i', '', b);
    fill.style.width = `${Math.max(n > 0 ? 12 : 0, Math.min(1, n / Math.max(1, m)) * 100)}%`;
    const s = el('span', '', b);
    iconCanvas(s, 18, 22, (g) => drawShard(g, 9, 11, 0.7));
    el('b', '', s).textContent = label;
    return b;
  }

  // ---------------------------------------------------------------- the detail card

  function renderDetail(d: SaveData): void {
    detail.replaceChildren();
    dmgRow = null;
    if (focus === 'archer') renderArcherDetail(d);
    else renderWeaponDetail(d, focus ?? d.arsenal.selected);
  }

  function renderWeaponDetail(d: SaveData, id: WeaponId): void {
    const def = WEAPONS[id];
    const w = d.arsenal.weapons[id];
    const locked = !w.owned;
    const lv = w.level;
    const head = el('div', 'ok-w-head', detail);
    const plate = el('div', 'ok-w-plate', head);
    const tint = WEAPON_TINT[id];
    plate.style.background = `radial-gradient(circle at 34% 28%, ${css(mix(tint, 0xffffff, 0.45))}, ${css(tint)} 62%, ${css(mix(tint, INK, 0.3))})`;
    if (locked) plate.style.filter = 'saturate(.25) brightness(.7)';
    iconCanvas(plate, 120, 120, (g) => drawWeaponIcon(g, id, 60, 60, 0.78, { level: lv, silhouette: locked }));
    const tt = el('div', 't', head);
    fitText(el('div', 'ok-w-big', tt), t(`weapon.${id}`), 38, 330);
    const sub = el('div', 'ok-w-sub', tt);
    if (locked) {
      iconCanvas(sub, 22, 26, (g) => drawLock(g, 11, 14, 0.8));
      el('span', '', sub).textContent = t('weapons.locked');
    } else {
      el('span', '', sub).textContent = t('weapons.lvOf', { n: lv, m: WEAPON_MAX });
      if (d.arsenal.selected === id) el('span', 'ok-w-tag', sub).textContent = t('weapons.selected');
    }
    const desc = el('div', 'ok-w-desc', detail);
    desc.textContent = t(`weapon.desc.${id}`);

    // stats as bars: damage a hit, flight speed, shots a second (the next level's gain in green)
    const stats = el('div', 'ok-w-stats', detail);
    const cost = locked ? null : upgradeCost(lv);
    const perks = weaponPerks(id, lv);
    const hit = (l: number): number => hitOf(id, l);
    dmgRow = stat(stats, t('weapons.stat.dmg'), dmgBar(hit(lv)), cost ? dmgBar(hit(lv + 1)) : 0, `×${hit(lv).toFixed(2)}`, tint);
    stat(stats, t('weapons.stat.speed'), def.speedMul / 1.3, 0, `×${def.speedMul.toFixed(2)}`, tint);
    const rate = 1 / (def.reloadMul * perks.reloadMul);
    const rateNext = cost ? 1 / (def.reloadMul * weaponPerks(id, lv + 1).reloadMul) : 0;
    stat(stats, t('weapons.stat.rate'), rate, rateNext > rate ? rateNext : 0, `×${rate.toFixed(2)}`, tint);

    // the level perks: reached ones in gold, the next one in green
    const steps = perkSteps(id, t);
    const pk = el('div', 'ok-w-perks', detail);
    if (steps.length === 0) {
      const p = el('div', 'ok-w-perk got', pk);
      p.textContent = t('weapons.noPerks');
    }
    const next = steps.find((s) => s.level > lv || locked);
    for (const s of steps) {
      const p = el('div', `ok-w-perk${!locked && s.level <= lv ? ' got' : s === next ? ' nx' : ''}`, pk);
      p.textContent = `${t('weapons.lv', { n: s.level })} · ${s.text}`;
    }

    const gain = el('div', 'ok-w-gain', detail);
    if (locked) {
      gain.classList.add('dim');
      const c = def.unlockBoss ?? 0;
      const boss = t(`boss.${BOSS_KINDS[c]!}`);
      gain.textContent = id === 'sling' ? t('weapons.slingHow', { m: SLING_UNLOCK_SHARDS, n: c + 1, b: boss }) : t('weapons.bossHow', { n: c + 1, b: boss });
    } else if (!cost) {
      gain.classList.add('dim');
      gain.textContent = t('weapons.maxed');
    } else {
      const pw = d.arsenal.selected === id ? Math.round(100 * weaponDamage(lv + 1)) - Math.round(100 * weaponDamage(lv)) : 0;
      gain.textContent = t('weapons.next', { a: levelDamage(lv).toFixed(2), b: levelDamage(lv + 1).toFixed(2) }) + (pw > 0 ? t('weapons.nextPow', { n: pw }) : '');
    }

    const row = el('div', 'ok-w-row', detail);
    if (locked && id === 'sling') {
      const b = shardBar(row, Math.min(w.shards, SLING_UNLOCK_SHARDS), SLING_UNLOCK_SHARDS, t('weapons.shardsOf', { n: Math.min(w.shards, SLING_UNLOCK_SHARDS), m: SLING_UNLOCK_SHARDS }));
      b.style.cssText += ';width:100%;height:44px;border-radius:22px';
      return;
    }
    if (locked) return;
    const selected = d.arsenal.selected === id;
    const sel = btn(row, 's', !selected, () => choose(id));
    sel.dataset.testid = 'weapon-select';
    sel.style.width = '210px';
    sel.style.fontSize = '36px';
    sel.textContent = selected ? t('weapons.selected') : t('weapons.select');
    sel.classList.toggle('sel', selected);
    const up = btn(row, 'p', cost !== null && canUpgrade(d, id), () => upgrade(id));
    up.dataset.testid = 'weapon-upgrade';
    up.style.flex = '1';
    // ready to level up: a light keeps running across the button
    if (cost !== null && canUpgrade(d, id)) up.classList.add('rdy');
    if (!cost) {
      up.style.fontSize = '32px';
      up.textContent = t('weapons.maxBtn');
      return;
    }
    const lbl = el('span', '', up);
    lbl.style.fontSize = '34px';
    lbl.textContent = t('weapons.upgrade');
    const dot = el('span', '', up);
    dot.style.cssText = 'font-size:30px;opacity:.6';
    dot.textContent = '·';
    const sc = el('span', 'c', up);
    sc.style.cssText += `;font-size:28px;color:${w.shards >= cost.shards ? css(INK) : css(PALETTE.danger)}`;
    el('span', '', sc).textContent = String(cost.shards);
    iconCanvas(sc, 24, 30, (g) => drawShard(g, 12, 15, 0.95));
    const cc = el('span', 'c', up);
    cc.style.cssText += `;font-size:28px;margin-left:6px;color:${d.coins >= cost.coins ? css(INK) : css(PALETTE.danger)}`;
    el('span', '', cc).textContent = String(cost.coins);
    iconCanvas(cc, 34, 34, (g) => drawCoin(g.phaser, 17, 17, 12));
    // a long cost in a narrow button: shrink the whole face
    const wide = String(cost.coins).length + String(cost.shards).length;
    if (wide > 6) up.style.zoom = String(Math.max(0.72, 1 - (wide - 6) * 0.06));
  }

  function renderArcherDetail(d: SaveData): void {
    const head = el('div', 'ok-w-head', detail);
    const plate = el('div', 'ok-w-plate', head);
    plate.style.background = `radial-gradient(circle at 34% 28%, ${css(mix(PALETTE.gold, 0xffffff, 0.45))}, ${css(PALETTE.gold)} 62%, ${css(mix(PALETTE.gold, INK, 0.3))})`;
    const cos = cosmeticById(d.cosmetic);
    iconCanvas(plate, 120, 120, (g) => drawHeadIcon(g.phaser, 60, 56, 30, cos, true));
    const tt = el('div', 't', head);
    fitText(el('div', 'ok-w-big', tt), t('archer.title'), 38, 300);
    el('div', 'ok-w-sub', tt).textContent = t('archer.sub');
    const looks = btn(head, 's', true, () => hooks.looks());
    looks.dataset.testid = 'archer-looks';
    looks.style.cssText += ';height:70px;border-radius:24px;font-size:26px;flex:none';
    looks.textContent = t('archer.looks');
    for (const id of UPGRADE_IDS) {
      const row = el('div', 'ok-w-up', detail);
      const ic = el('div', 'ic', row);
      iconCanvas(ic, 70, 70, (g) => g.at(35, 35, 0.74, 0.74, 0, () => drawUpgradeIcon(g.phaser, id, 0, 0)));
      const tx = el('div', 'tx', row);
      fitText(el('b', '', tx), t(`up.${id}.name`), 23, 300);
      const pw = POWER_PER_UPGRADE[id];
      fitText(el('span', '', tx), `${t(`up.${id}.desc`)} · ${t('archer.pow', { n: pw })}`, 18, 300);
      const pips = el('div', 'ok-w-pips', tx);
      const max = UPGRADES[id].max;
      for (let i = 0; i < max; i++) el('i', i < d.upgrades[id] ? 'on' : '', pips);
      const cost = shopCost(id, d.upgrades[id]);
      if (cost === null) {
        el('div', 'mx', row).textContent = t('shop.max');
        continue;
      }
      const b = btn(row, 'p', d.coins >= cost, () => buy(id));
      b.dataset.testid = `archer-buy-${id}`;
      const c = el('span', 'c', b);
      el('span', '', c).textContent = String(cost);
      iconCanvas(c, 36, 36, (g) => drawCoin(g.phaser, 18, 18, 13));
    }
  }

  function stat(parent: HTMLElement, name: string, v: number, next: number, value: string, tint: number): { fill: HTMLElement; value: HTMLElement } {
    const r = el('div', 'ok-w-stat', parent);
    fitText(el('b', '', r), name, 19, 116);
    const tr = el('div', 'tr', r);
    if (next > v) {
      const nx = el('i', 'nx', tr);
      nx.style.width = `${Math.min(1, next) * 100}%`;
    }
    const f = el('i', '', tr);
    f.style.width = `${Math.min(1, v) * 100}%`;
    f.style.background = `linear-gradient(180deg, ${css(mix(tint, 0xffffff, 0.35))}, ${css(tint)})`;
    const val = el('span', '', r);
    val.textContent = value;
    return { fill: f, value: val };
  }

  function btn(parent: HTMLElement, variant: 'p' | 's', enabled: boolean, fire: () => void): HTMLElement {
    const b = el('div', `ok-w-btn ${variant}${enabled ? '' : ' off'}`, parent);
    pressable(b, () => enabled, ui.unlock, () => {
      if (!calm) b.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 180, easing: EASE.backOut });
      fire();
    });
    return b;
  }

  // ---------------------------------------------------------------- actions

  function affordable(d: SaveData, id: UpgradeId): boolean {
    const c = shopCost(id, d.upgrades[id]);
    return c !== null && d.coins >= c;
  }

  function feats(got: string[]): void {
    for (const f of got) hooks.toast(t('feat.title'), featLine(t, f));
  }

  function upgrade(id: WeaponId): void {
    const before = powerOf(save.data);
    const level = save.data.arsenal.weapons[id].level;
    let ok = false;
    let got: string[] = [];
    save.update((d) => {
      ok = upgradeWeapon(d, id);
      if (ok) got = unlockFeats(d, null);
    });
    if (!ok) {
      ui.audio.playPreset(SFX.cancel);
      render();
      return;
    }
    ui.audio.playPreset(SFX.fanfare);
    render();
    pulse(cards.get(id)!);
    levelUp(id, level, before);
    hooks.changed(before);
    // an achievement's toast drops over the top bar: let POWER finish climbing there first
    if (calm || got.length === 0) feats(got);
    else window.setTimeout(() => feats(got), 1800);
  }

  /** the power gained flies from `from` up into the top bar's POWER (the shell counts it up meanwhile) */
  function powerFlight(from: HTMLElement, before: number): void {
    const host = pane.parentElement;
    const target = host?.querySelector('[data-testid="shell-power"]');
    if (!host || !target || powerOf(save.data) <= before) return;
    const a = centreIn(from, host);
    const b = centreIn(target, host);
    flyTo(host, a.x, a.y, b.x, b.y, { kind: 'bolt', n: 6, size: 36, color: PALETTE.heal, ms: 560, gap: 55 });
  }

  /**
   * A weapon went up a level (the cards are already drawn at the new level): the grid card's level
   * tag stamps down under a shine; on the detail card a sunburst turns behind the weapon, the
   * plate jumps, "Level up!" is stamped on the corner, the damage bar grows from its old length
   * while its number counts, and the power gained flies up to the top bar.
   */
  function levelUp(id: WeaponId, from: number, before: number): void {
    if (calm) return;
    const card = cards.get(id)!;
    shine(card, 60);
    card.querySelector<HTMLElement>('.ok-w-lv')?.animate([{ transform: 'scale(2.6) rotate(-16deg)', opacity: 0 }, { transform: 'scale(0.88) rotate(4deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: 'ease-out' });
    if (focus !== id) {
      powerFlight(card, before);
      return;
    }
    const tint = WEAPON_TINT[id];
    const plate = detail.querySelector<HTMLElement>('.ok-w-plate');
    const head = plate?.parentElement;
    if (plate && head) {
      // behind the plate and the name (it is put in before them), over the card's face
      sunburst(head, 46, head.offsetHeight / 2, 340, mix(tint, PALETTE.gold, 0.5), 1500, plate);
      plate.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.38) rotate(-10deg)', offset: 0.28 }, { transform: 'scale(0.93) rotate(5deg)', offset: 0.6 }, { transform: 'scale(1.04) rotate(-2deg)', offset: 0.8 }, { transform: 'none' }], { duration: 680, easing: 'ease-out' });
      const host = pane.parentElement ?? pane;
      const c = centreIn(plate, host);
      sparkle(host, c.x, c.y, { n: 12, reach: 150, ring: 100, colors: [PALETTE.gold, mix(tint, 0xffffff, 0.3), PALETTE.white] });
    }
    const lv = detail.querySelector<HTMLElement>('.ok-w-sub>span');
    if (lv) {
      pop(lv, 1.3, 520);
      lv.animate([{ color: css(PALETTE.gold) }, { color: css(PALETTE.gold), offset: 0.7 }, { color: css(PALETTE.cream) }], { duration: 1300 });
    }
    const stamp = el('div', 'ok-w-stamp', detail);
    stamp.textContent = t('weapons.levelUp');
    const rest = 'scale(1) rotate(-7deg)';
    stamp.animate(
      [
        { transform: 'scale(3.2) rotate(-26deg)', opacity: 0 },
        { transform: 'scale(0.86) rotate(-5deg)', opacity: 1, offset: 0.16 },
        { transform: rest, opacity: 1, offset: 0.24 },
        { transform: rest, opacity: 1, offset: 0.84 },
        { transform: 'scale(1) rotate(-7deg) translateY(-26px)', opacity: 0 },
      ],
      { duration: 1900, fill: 'both' },
    ).onfinish = () => stamp.remove();
    // a perk level reached (5, 10, 15, 20): its chip, gold from now on, jumps under a shine and a few stars
    const perk = perkSteps(id, t).findIndex((s) => s.level === from + 1);
    const chip = perk >= 0 ? detail.querySelectorAll<HTMLElement>('.ok-w-perk')[perk] : undefined;
    if (chip) {
      chip.style.position = 'relative';
      chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-4deg)', offset: 0.35 }, { transform: 'scale(0.95) rotate(2deg)', offset: 0.65 }, { transform: 'scale(1)' }], { delay: 500, duration: 620, easing: 'ease-out' });
      shine(chip, 620, 520);
      const host = pane.parentElement ?? pane;
      const c = centreIn(chip, host);
      sparkle(host, c.x, c.y, { n: 8, reach: 90, ring: 60, delay: 560 });
    }
    if (dmgRow) {
      const a = hitOf(id, from);
      const b = hitOf(id, from + 1);
      growBar(dmgRow.fill, dmgBar(a) / dmgBar(b), 120, 620);
      countTo(dmgRow.value, a, b, 700, (n) => `×${n.toFixed(2)}`);
      pop(dmgRow.value, 1.25, 700);
    }
    powerFlight(plate ?? card, before);
  }

  function choose(id: WeaponId): void {
    const before = powerOf(save.data);
    let ok = false;
    save.update((d) => {
      ok = selectWeapon(d, id);
    });
    if (!ok) return;
    ui.audio.play('pop');
    render();
    pulse(cards.get(id)!);
    hooks.changed(before);
  }

  function buy(id: UpgradeId): void {
    const before = powerOf(save.data);
    let ok = false;
    save.update((d) => {
      ok = buyUpgrade(d, id);
    });
    if (!ok) {
      ui.audio.playPreset(SFX.cancel);
      return;
    }
    ui.audio.play('coin');
    render();
    pulse(archer);
    if (!calm) {
      shine(archer, 40);
      powerFlight(archer, before);
    }
    hooks.changed(before);
  }

  function pulse(e: HTMLElement): void {
    if (calm) return;
    e.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 460, easing: EASE.backOut });
    // stars and a ring off the card (over the pane, so they may fly past its edges)
    const c = centreIn(e, pane);
    sparkle(pane, c.x, c.y, { n: 10, reach: 120, ring: 84, colors: [PALETTE.gold, PALETTE.heal, PALETTE.white] });
  }

  function render(): void {
    const d = save.data;
    renderArcher(d);
    for (const id of WEAPON_IDS) renderCard(d, id);
    renderDetail(d);
  }

  render();
  if (!quiet && !calm) {
    [archer, ...cards.values(), detail].forEach((e, i) => e.animate([{ transform: 'scale(0.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 40 + i * 35, duration: 320, easing: EASE.backOut, fill: 'backwards' }));
  }
  return {
    destroy() {
      pane.replaceChildren();
    },
  };
}

// ---------------------------------------------------------------------------- drawings

/** The weapons' own colours: wood, steel, string, paper */
const WOOD = 0xc47e3e;
const WOOD_DARK = 0x8a4f22;
const STEEL = 0xcfd6e6;
const STEEL_DARK = 0x8a93ab;

/**
 * A weapon's icon centred on (x, y), about 120 × 90 px at s = 1. `silhouette` draws it as a flat
 * dark shape (a locked weapon). The bow is the game's own bow item, at its level.
 */
export function drawWeaponIcon(g: Gfx, id: WeaponId, x: number, y: number, s: number, o: { level?: number; silhouette?: boolean } = {}): void {
  const c = g.ctx;
  c.save();
  if (o.silhouette) {
    // drawn on its own layer, then flattened to one colour
    const w = c.canvas.width;
    const h = c.canvas.height;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const oc = off.getContext('2d')!;
    oc.setTransform(c.getTransform());
    const og = new Gfx(oc);
    drawWeaponIcon(og, id, x, y, s, { level: 1 });
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.globalCompositeOperation = 'source-in';
    oc.fillStyle = rgba(0x6e5a8a, 0.75);
    oc.fillRect(0, 0, w, h);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(off, 0, 0);
    c.restore();
    // a lock on top
    drawLock(g, x + 26 * s, y + 18 * s, s);
    return;
  }
  if (id === 'bow') {
    c.restore();
    // the game's own bow item (its look follows the level), tilted, an arrow on the string
    g.at(x, y, 1, 1, -0.42, () => {
      drawBowItem(g.phaser, 4 * s, 0, 42 * s, o.level ?? 1, 0);
      const k = 40 * s;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      stroke(c, () => {
        c.moveTo(-0.62 * k, 0);
        c.lineTo(0.95 * k, 0);
      }, 4 * s + 1, PALETTE.shaftLight);
      shape(c, () => {
        c.moveTo(0.9 * k, -8 * s);
        c.lineTo(1.25 * k, 0);
        c.lineTo(0.9 * k, 8 * s);
      }, PALETTE.arrowHead, 4);
      shape(c, () => {
        c.moveTo(-0.72 * k, -9 * s);
        c.lineTo(-0.42 * k, -2 * s);
        c.lineTo(-0.42 * k, 2 * s);
        c.lineTo(-0.72 * k, 9 * s);
        c.lineTo(-0.6 * k, 0);
      }, PALETTE.fletch, 4);
      c.restore();
    });
    return;
  }
  c.translate(x, y);
  c.scale(s, s);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (id === 'crossbow') drawCrossbow(c);
  else if (id === 'spear') drawSpear(c);
  else if (id === 'boomerang') drawBoomerang(c);
  else if (id === 'sling') drawSling(c);
  else drawFirework(c);
  c.restore();
}

type C = CanvasRenderingContext2D;

/** a stroke in `color` over a wider ink stroke */
function stroke(c: C, path: () => void, w: number, color: number): void {
  c.beginPath();
  path();
  c.lineWidth = w + 7;
  c.strokeStyle = css(INK);
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = css(color);
  c.stroke();
}

/** a filled shape with an ink outline */
function shape(c: C, path: () => void, color: number, outline = 6): void {
  c.beginPath();
  path();
  c.closePath();
  c.lineWidth = outline;
  c.strokeStyle = css(INK);
  c.stroke();
  c.fillStyle = css(color);
  c.fill();
}

function rr(c: C, x: number, y: number, w: number, h: number, r: number): void {
  c.roundRect(x, y, w, h, r);
}

function drawCrossbow(c: C): void {
  c.rotate(-0.5);
  // the stock, the grip under it
  shape(c, () => rr(c, -48, -8, 84, 16, 7), WOOD);
  shape(c, () => rr(c, -36, 2, 14, 24, 5), WOOD_DARK);
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.fillRect(-44, -5, 70, 4);
  // the steel prod across the front, the string pulled back to the nut
  stroke(c, () => {
    c.moveTo(14, -40);
    c.quadraticCurveTo(36, 0, 14, 40);
  }, 9, STEEL_DARK);
  stroke(c, () => {
    c.moveTo(14, -40);
    c.quadraticCurveTo(34, 0, 14, 40);
  }, 3, STEEL);
  c.beginPath();
  c.moveTo(14, -40);
  c.lineTo(-14, 0);
  c.lineTo(14, 40);
  c.lineWidth = 3;
  c.strokeStyle = css(PALETTE.string);
  c.stroke();
  // the bolt: a short shaft, a steel head, red vanes
  stroke(c, () => {
    c.moveTo(-14, -0.5);
    c.lineTo(46, -0.5);
  }, 5, PALETTE.shaftLight);
  shape(c, () => {
    c.moveTo(44, -8);
    c.lineTo(60, -0.5);
    c.lineTo(44, 7);
  }, STEEL, 5);
  shape(c, () => {
    c.moveTo(-16, -1);
    c.lineTo(-4, -10);
    c.lineTo(0, -1);
  }, PALETTE.fletch, 4);
  c.fillStyle = css(INK);
  c.beginPath();
  c.arc(-14, 0, 4, 0, Math.PI * 2);
  c.fill();
}

function drawSpear(c: C): void {
  c.rotate(-0.62);
  // the shaft, a red binding, a tuft at the tail
  stroke(c, () => {
    c.moveTo(-56, 0);
    c.lineTo(28, 0);
  }, 9, PALETTE.shaftLight);
  c.strokeStyle = 'rgba(255,255,255,.35)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(-52, -2);
  c.lineTo(24, -2);
  c.stroke();
  shape(c, () => {
    c.moveTo(-58, 0);
    c.lineTo(-70, -10);
    c.lineTo(-66, 0);
    c.lineTo(-70, 10);
  }, 0xffd23f, 4);
  // a leaf-shaped steel head
  shape(c, () => {
    c.moveTo(26, 0);
    c.quadraticCurveTo(40, -16, 64, 0);
    c.quadraticCurveTo(40, 16, 26, 0);
  }, STEEL);
  c.strokeStyle = css(STEEL_DARK);
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(30, 0);
  c.lineTo(60, 0);
  c.stroke();
  shape(c, () => rr(c, 18, -7, 12, 14, 3), PALETTE.fletch, 4);
}

function drawBoomerang(c: C): void {
  c.rotate(0.1);
  const arm = (): void => {
    c.moveTo(-40, -24);
    c.quadraticCurveTo(-14, 10, 0, 22);
    c.quadraticCurveTo(14, 10, 42, -22);
  };
  stroke(c, arm, 22, 0xff8a3c);
  // a stripe and the tips
  c.lineWidth = 6;
  c.strokeStyle = css(0xffd23f);
  c.beginPath();
  arm();
  c.stroke();
  c.fillStyle = css(PALETTE.fletch);
  for (const [px, py] of [
    [-40, -24],
    [42, -22],
  ] as const) {
    c.beginPath();
    c.arc(px, py, 7, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.4)';
  c.beginPath();
  c.ellipse(-22, -10, 9, 3, 0.9, 0, Math.PI * 2);
  c.fill();
  // speed lines
  c.strokeStyle = 'rgba(255,255,255,.75)';
  c.lineWidth = 4;
  for (const r of [50, 58]) {
    c.beginPath();
    c.arc(0, 4, r, Math.PI * 0.95, Math.PI * 1.25);
    c.stroke();
  }
}

function drawSling(c: C): void {
  c.rotate(0.18);
  // the Y: a wrapped handle, two prongs
  stroke(c, () => {
    c.moveTo(0, 44);
    c.lineTo(0, 6);
  }, 13, WOOD);
  stroke(c, () => {
    c.moveTo(0, 8);
    c.quadraticCurveTo(-6, -8, -22, -30);
    c.moveTo(0, 8);
    c.quadraticCurveTo(6, -8, 22, -30);
  }, 11, WOOD);
  c.strokeStyle = css(WOOD_DARK);
  c.lineWidth = 4;
  for (const yy of [22, 30, 38]) {
    c.beginPath();
    c.moveTo(-6, yy);
    c.lineTo(6, yy - 3);
    c.stroke();
  }
  // the band, pulled back, and the pebble in its pouch
  stroke(c, () => {
    c.moveTo(-22, -30);
    c.quadraticCurveTo(-8, -4, 0, -2);
    c.quadraticCurveTo(8, -4, 22, -30);
  }, 5, PALETTE.fletch);
  shape(c, () => c.ellipse(0, -4, 11, 9, 0, 0, Math.PI * 2), 0x9aa3b5, 5);
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.beginPath();
  c.ellipse(-3, -7, 4, 2.5, -0.4, 0, Math.PI * 2);
  c.fill();
}

function drawFirework(c: C): void {
  c.save();
  c.rotate(-0.55);
  // the cardboard tube with a candy stripe, a rocket peeking out, the fuse at the back
  shape(c, () => rr(c, -44, -15, 74, 30, 9), 0xff4d5e);
  c.save();
  c.beginPath();
  rr(c, -44, -15, 74, 30, 9);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = -3; i < 5; i++) {
    c.beginPath();
    c.moveTo(-44 + i * 18, 15);
    c.lineTo(-36 + i * 18, 15);
    c.lineTo(-22 + i * 18, -15);
    c.lineTo(-30 + i * 18, -15);
    c.fill();
  }
  c.restore();
  shape(c, () => rr(c, 26, -18, 10, 36, 4), 0xffd23f, 5);
  shape(c, () => {
    c.moveTo(36, -10);
    c.lineTo(58, 0);
    c.lineTo(36, 10);
  }, 0x58a6ff, 5);
  stroke(c, () => {
    c.moveTo(-44, 0);
    c.quadraticCurveTo(-54, -8, -58, 2);
  }, 3, 0x6b3f1f);
  c.restore();
  // the spark on the fuse and a little confetti
  const sx = -48;
  const sy = 30;
  c.fillStyle = css(0xffe14d);
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 4 : 10;
    c.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
  }
  c.closePath();
  c.lineWidth = 3;
  c.strokeStyle = css(INK);
  c.stroke();
  c.fill();
  const bits: [number, number, number][] = [
    [40, -40, 0x7cf29c],
    [52, -26, 0xffd23f],
    [28, -50, 0x58a6ff],
    [58, -46, 0xff6f9a],
  ];
  for (const [bx, by, col] of bits) {
    c.save();
    c.translate(bx, by);
    c.rotate(bx * 0.1);
    c.fillStyle = css(INK);
    c.fillRect(-5, -3.5, 10, 7);
    c.fillStyle = css(col);
    c.fillRect(-3.5, -2, 7, 4);
    c.restore();
  }
}

/** A weapon shard: a violet crystal. */
export function drawShard(g: Gfx, x: number, y: number, s: number): void {
  const c = g.ctx;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.lineJoin = 'round';
  shape(c, () => {
    c.moveTo(0, -14);
    c.lineTo(10, -3);
    c.lineTo(5, 14);
    c.lineTo(-5, 14);
    c.lineTo(-10, -3);
  }, SHARD, 4);
  c.fillStyle = 'rgba(255,255,255,.6)';
  c.beginPath();
  c.moveTo(0, -11);
  c.lineTo(4, -3);
  c.lineTo(0, 8);
  c.lineTo(-3, -3);
  c.closePath();
  c.fill();
  c.restore();
}

/** A padlock (locked weapons). */
function drawLock(g: Gfx, x: number, y: number, s: number): void {
  const c = g.ctx;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.lineCap = 'round';
  stroke(c, () => c.arc(0, -4, 8, Math.PI, 0), 4, STEEL);
  shape(c, () => rr(c, -12, -4, 24, 18, 5), PALETTE.gold, 4);
  c.fillStyle = css(INK);
  c.beginPath();
  c.arc(0, 4, 3, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The selected weapon's tick: a green round badge. */
function drawCheck(g: Gfx, x: number, y: number): void {
  const c = g.ctx;
  c.save();
  c.translate(x, y);
  shape(c, () => c.arc(0, 0, 14, 0, Math.PI * 2), PALETTE.heal, 4);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-6, 0);
  c.lineTo(-1.5, 5);
  c.lineTo(7, -5);
  c.lineWidth = 4;
  c.strokeStyle = css(INK);
  c.stroke();
  c.restore();
}
