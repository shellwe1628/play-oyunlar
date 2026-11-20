# Okçu Weapons, Progression and Tabbed Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 3D Noodle Archers six weapons that play differently, a guaranteed weapon-level / chest / power progression with a coin shop, a tabbed main menu, and wider, more varied maps.

**Architecture:** All rules live in the pure, seeded simulation `games/okcu/src/sim` (new files `weapons.ts`, `arsenal.ts`, `chests.ts`, `shop.ts`; `world.ts` gains per-weapon projectiles). The 3D app `apps/okcu-3d` renders and drives it: a new menu shell (`ui/shell.ts`) with five tabs replaces the dock of `ui/title.ts`; new weapon models/shot animations in `view/`. Only `difficulty: 'hard'` (the 3D build) uses weapons; `'classic'` (2D, unused) keeps the forged bow and must still compile and pass its tests.

**Tech Stack:** TypeScript, vitest (games/okcu), three.js 0.170 + DOM UI (apps/okcu-3d), Playwright for screenshots, `@oyun/core` (Rng, save store, rewarded ads).

**Spec:** `docs/superpowers/specs/2026-11-20-okcu-silahlar-gelisim-menu-design.md` (Turkish; read it first).

## Global Constraints

- No real-money purchases; coins + optional rewarded ads only (`ui.rewarded(placement)`). Every ad reward has a no-ad path.
- No realistic firearms; the sixth weapon is the cartoon "Fişek Atar" (firework tube).
- Simulation stays pure and deterministic (seeded `Rng`); no `Math.random`, no `Date` inside `sim/` (time is passed in as numbers).
- Weapon levels 1…20; `weaponDamage(1) = 1.00`, `weaponDamage(20) = 2.30`; in hard the same `HARD_BOW_POW = 1.6` exponent applies.
- Old bow +N migrates to the lowest weapon level L with `weaponDamage(L) ≥ bowDamage(N)`; +25 → 20. Forge and heat are retired in the 3D build; no coin refund.
- Rank score never drops on migration; earned feats stay earned.
- Beaten bosses unlock their chapter's weapon at migration; one one-time "welcome" gold chest; selected weapon = bow.
- Field span: ch1 1.0 · ch2 1.05 · ch3 1.1 · ch4 1.15 · ch5 1.2 · ch6 1.25 · endless 1.3 (never narrower than today).
- Chest odds are shown on screen exactly as the roll uses them.
- Free chest every 4 h; ad upgrades it (wooden → silver); ad coins at most 3 per day.
- TR + EN strings for every new text; portrait 360×640 … 1080×2400; safe areas.
- No interim Play release of this work; test APKs only until Task 23.
- Never touch `games/okcu/src/scenes` (2D UI) beyond what is needed to compile.

## Review Focus

1. **A long-time save (bow +25, all six bosses, 50k coins, feats)** loads with ≥ damage, ≥ rank score, same coins, all boss weapons owned, exactly one welcome chest → Task 9 test `migrates a maxed save without loss`.
2. **No ad available / ad cancelled** (`rewarded` returns false) → nothing granted, the free chest still opens as wooden, buttons re-enable → Task 17 manual check + Task 11 test `ad upgrade is optional`.
3. **Device clock moved backwards or far forward** → timers never negative, at most one free chest banked, daily offers don't re-roll on the same date key → Task 11 test `free chest clock skew`, Task 13 test `offers stable within a day`.
4. **Projectile leaves the field / player dies / wave clears while a boomerang or rocket is in the air** → it deactivates without hitting the next wave and without throwing → Task 5/6 tests `boomerang cleared on wave change`, `rocket expires off-field`.
5. **A card that means nothing for the selected weapon** (e.g. split with the rocket) → never offered; a held card from a daily/draft hand is ignored safely → Task 7 test `offers respect weapon`.

---

## Phase 1 — Weapons in the simulation

### Task 1: Weapon table and damage curve

**Files:**
- Create: `games/okcu/src/sim/weapons.ts`
- Test: `games/okcu/tests/unit/weapons.test.ts`

**Interfaces:**
- Produces:
  - `type WeaponId = 'bow' | 'crossbow' | 'spear' | 'boomerang' | 'sling' | 'firework'`; `WEAPON_IDS: readonly WeaponId[]` (that order).
  - `type Projectile = 'arrow' | 'bolt' | 'spear' | 'boomerang' | 'pebble' | 'rocket'`.
  - `interface WeaponDef { id; projectile: Projectile; speedMul: number; gravityMul: number; reloadMul: number; dmgMul: number; impulseMul: number; pierce: number; bounces: number; headMul: number; unlockBoss: number | null }` and `WEAPONS: Record<WeaponId, WeaponDef>`.
  - `WEAPON_MAX = 20`; `weaponDamage(level: number): number`; `levelForBow(bowLevel: number): number`; `bowEquivalent(level: number): number` (largest bow +N with `bowDamage(N) ≤ weaponDamage(level)`; used for rank points).
  - `weaponPerks(id: WeaponId, level: number): WeaponPerks` with `interface WeaponPerks { pierce: number; bounces: number; reloadMul: number; returnSpeedMul: number; blastRadiusMul: number }` (perk steps at levels 5, 10, 15, 20; values the builder's call).

Starting values (spec 5.1; tune in Task 8): bow 1/1/1/1/1, pierce 0, bounces 0, headMul 1, unlockBoss null · crossbow speedMul 1.45, gravityMul 0.35, reloadMul 1.6, unlockBoss 0 · spear speedMul 0.8, gravityMul 1.15, impulseMul 2.2, dmgMul 1.35, pierce 1, unlockBoss 1 · boomerang dmgMul 0.6, unlockBoss 2 · sling dmgMul 0.55, bounces 2, headMul 1 (no head bonus: `headMul` replaces the head multiplier), unlockBoss 4 · firework reloadMul 2.0, dmgMul 0.8, unlockBoss 3. Bow keeps the normal head multiplier.

- [ ] **Step 1: Write the failing tests**

```ts
it('weapon damage runs 1.00 → 2.30 over levels 1…20, monotonic', () => {
  expect(weaponDamage(1)).toBe(1);
  expect(weaponDamage(20)).toBeCloseTo(2.3, 2);
  for (let l = 2; l <= 20; l++) expect(weaponDamage(l)).toBeGreaterThan(weaponDamage(l - 1));
});
it('old bow levels map to a level with at least the same damage', () => {
  for (let n = 0; n <= 25; n++) expect(weaponDamage(levelForBow(n))).toBeGreaterThanOrEqual(bowDamage(n) - 1e-9);
  expect(levelForBow(0)).toBe(1);
  expect(levelForBow(25)).toBe(20);
  expect(bowEquivalent(20)).toBe(25);
  for (let n = 0; n <= 25; n++) expect(bowEquivalent(levelForBow(n))).toBeGreaterThanOrEqual(n);
});
it('every weapon except the bow is unlocked by a different boss', () => {
  const bosses = WEAPON_IDS.filter((id) => id !== 'bow').map((id) => WEAPONS[id].unlockBoss);
  expect(new Set(bosses).size).toBe(5);
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/weapons.test.ts` (in `games/okcu`) → FAIL (module missing).
- [ ] **Step 3:** Implement `weapons.ts`. `weaponDamage(L) = bowDamage(round((L-1) × 25/19))` interpolated linearly between neighbours (so 1 → 1.00, 20 → 2.30), rounded to 2 decimals and kept strictly increasing.
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit `okcu sim: weapon table and damage curve`.

### Task 2: Weapons in MetaLevels and stats

**Files:**
- Modify: `games/okcu/src/sim/meta.ts` (`MetaLevels`, `NO_META`), `games/okcu/src/sim/cards.ts` (`statsFor`, `PlayerStats`), `games/okcu/src/sim/world.ts` (lines ~950–970 `fireVolley`, `w.reload` in `shoot`)
- Test: `games/okcu/tests/unit/weapons.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `MetaLevels` gains `weapon: WeaponId` and `wlevel: number` (`NO_META`: `'bow'`, `1`). `PlayerStats` gains `weapon: WeaponId`, `projectile: Projectile`, `gravityMul`, `speedMul`, `headMul`. In hard: `dmgMul` uses `weaponDamage(meta.wlevel) ** HARD_BOW_POW × WEAPONS[w].dmgMul`; `reload` × `reloadMul × perks.reloadMul`; `pierce`/`bounces` add weapon + perks. Classic stays on `meta.bow` exactly as today.

- [ ] **Step 1: Failing tests:** `hard stats follow the weapon` (crossbow lvl 1 reload = bow reload × 1.6; spear lvl 10 dmg = weaponDamage(10)^1.6 × 1.35; bow lvl 1 with meta.bow 25 in hard ignores meta.bow) and `classic ignores weapons` (statsFor classic with weapon 'spear' equals today's output).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `fireVolley` reads `w.stats.speedMul` for speed and spawns with kind from `w.stats.projectile` (new `Arrow['kind']` values `'bolt' | 'spear' | 'boomerang' | 'pebble' | 'rocket'` alongside `'arrow'|'bomb'|'orb'`); `flyArrow(a, DT, TUNING.gravity × a.gravityMul)` with new `Arrow.gravityMul` (1 for existing kinds). Head damage multiplies by `headMul`. The hard impulse term uses `weaponDamage(meta.wlevel) × WEAPONS[w].impulseMul` instead of `bowDamage(meta.bow)`.
- [ ] **Step 4:** Run the whole okcu suite (`npx vitest run`) → all pass (existing 162 + new).
- [ ] **Step 5:** Commit `okcu sim: hard mode stats come from the selected weapon`.

### Task 3: Bolt and spear behaviour

**Files:** Modify `games/okcu/src/sim/world.ts` (hit resolution around `resolveHit` ~2590 and knock-off), Test `games/okcu/tests/unit/weapons.test.ts`

**Interfaces:** Consumes Task 2. Produces no new exports.

- [ ] **Step 1: Failing tests** (use `createWorld({seed, difficulty:'hard', meta:{...NO_META, weapon, wlevel:1}})`, `jumpToWave`, fire with `shoot` at a solved angle via `solveWithWind`):
  - `bolt flies flatter`: same angle/power, after 0.3 s the bolt's y-drop is < 0.5 × an arrow's.
  - `spear pierces one and shoves hard`: two archers in line; one spear throw damages both; the first's knock-back impulse ≥ 2 × an arrow's.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: bolt = arrow with `gravityMul` 0.35 and wind × 0.4; spear = `pierce` 1 + `impulseMul` and a shorter life (`life` 1.2 s).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `okcu sim: crossbow bolts and spears`.

### Task 4: Sling pebbles

**Files:** Modify `world.ts` (ledge / wall / shield contact in `updateArrows`), Test `weapons.test.ts`

- [ ] **Step 1: Failing tests:** `pebble bounces twice then drops` (fired into a ledge face: velocity reflects with 0.7 restitution, third contact deactivates it); `pebble off a shield still hurts` (bounce off a shield, then hits the archer behind).
- [ ] **Step 2:** FAIL. **Step 3:** Implement reflection on contact while `a.bounces > 0` (decrement), never sticking; reuse the existing `bounces` card plumbing so the bounce card adds +1.
- [ ] **Step 4:** PASS. **Step 5:** Commit `okcu sim: sling pebbles bounce`.

### Task 5: Boomerang

**Files:** Modify `world.ts`, Test `weapons.test.ts`

**Interfaces:** `Arrow` gains `turnT: number` (seconds until it turns) and `hitIds: number[]` (ids already hit this pass, cleared on turn).

- [ ] **Step 1: Failing tests:** `boomerang returns to the player` (no target: after ≤ 2.5 s it is back within 60 px of `playerOrigin` and deactivates without hurting the player); `boomerang hits on the way out and back` (an archer on its path takes two hits); `boomerang cleared on wave change` (`jumpToWave` mid-flight → no active boomerang, no hit on the new wave).
- [ ] **Step 2:** FAIL. **Step 3:** Implement: no gravity; flies along launch direction, decelerates (`turnT` = 0.55 + 0.35 × power), then accelerates back toward the player along a curved path (lateral drift by wind ×0.3); `returnSpeedMul` perk.
- [ ] **Step 4:** PASS. **Step 5:** Commit `okcu sim: boomerang`.

### Task 6: Firework rocket

**Files:** Modify `world.ts` (reuse the existing `blast` area damage helper used by blast arrows), Test `weapons.test.ts`

- [ ] **Step 1: Failing tests:** `rocket bursts after its fuse` (straight for 0.45 s with gravityMul 0.15, then bursts: every archer within radius R takes damage, an event `{ t: 'blast' … }` is emitted); `rocket bursts on contact early`; `rocket expires off-field` (fired straight up: deactivates at the field edge, no burst on the player).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; burst radius × `blastRadiusMul` perk; burst never damages the player.
- [ ] **Step 4:** PASS. **Step 5:** Commit `okcu sim: firework rocket`.

### Task 7: Cards per weapon

**Files:** Modify `games/okcu/src/sim/cards.ts` (`drawOffer`, `cardOpen`, `statsFor`), `world.ts` (calls to `drawOffer`), Test `weapons.test.ts`

**Interfaces:** Produces `CARD_WEAPONS: Partial<Record<CardId, readonly WeaponId[]>>` (cards limited to some weapons; absent = all) and `cardFits(id: CardId, weapon: WeaponId): boolean`; `drawOffer(rng, held, n, chapter, weapon: WeaponId = 'bow')`.

Builder fills the table so every remaining card does something with each weapon it fits (e.g. `split`, `double`, `seeker` not for rocket; `overdraw` not for boomerang; `bounce` adds to pebbles).

- [ ] **Step 1: Failing test** `offers respect weapon`: 500 seeded offers for each weapon contain only `cardFits` cards; a held non-fitting card leaves `statsFor` unchanged for that weapon.
- [ ] **Step 2:** FAIL. **Step 3:** Implement and pass the selected weapon from `w.meta.weapon` (classic: always 'bow').
- [ ] **Step 4:** PASS. **Step 5:** Commit `okcu sim: card pool follows the weapon`.

### Task 8: Aimbot per weapon and balance tests

**Files:** Modify `games/okcu/src/sim/aimbot.ts` (`planShot`, `solveShot`, `RunOptions` gains `weapon?: WeaponId; wlevel?: number`), Test: create `games/okcu/tests/unit/balance-weapons.test.ts`

- [ ] **Step 1: Failing tests** (spec 8, all `difficulty:'hard'`, `NO_META` + weapon):
  - `new player clears chapter 1 with any weapon`: CAREFUL, level 1, 8 seeds, `untilWave: 8`, every weapon reaches ≥ 8 in ≥ 6/8 runs.
  - `levels make chapter 1 faster`: bow level 10 needs ≥ 40 % fewer shots than level 1 to reach wave 8 (mean over 8 seeds).
  - `no weapon dominates`: mean reached wave over chapters 1–4 (startChapter 0…3, 6 seeds, level 10, CAREFUL) of each weapon is within ±25 % of the mean of all weapons.
- [ ] **Step 2:** FAIL (aimbot can't aim boomerang/rocket yet).
- [ ] **Step 3:** Teach `solveShot` each projectile (bolt/spear/pebble: gravity × gravityMul; boomerang/rocket: straight-line aim); tune `WEAPONS` numbers and perks until the three tests pass. Mark the test file `{ timeout: 600_000 }`.
- [ ] **Step 4:** Full suite PASS. **Step 5:** Commit `okcu sim: aimbot uses every weapon; weapon balance tests`.

## Phase 2 — Progression, chests, shop

### Task 9: Arsenal save and migration

**Files:**
- Create: `games/okcu/src/sim/arsenal.ts`
- Modify: `games/okcu/src/sim/meta.ts` (`SaveData` + `freshSave`), `games/okcu/src/save.ts` (`repairSave`)
- Test: `games/okcu/tests/unit/arsenal.test.ts`

**Interfaces:**
- Produces:
  - `interface WeaponState { owned: boolean; level: number; shards: number }`
  - `interface Arsenal { selected: WeaponId; weapons: Record<WeaponId, WeaponState>; chests: ChestKind[]; freeChestAt: number; adCoinsDay: string; adCoinsUsed: number; shopDay: string; shopBought: number[]; rankFloor: number; migrated: boolean }` (`ChestKind` from Task 11, declare the type here first: `'wood' | 'silver' | 'gold' | 'boss'`).
  - `SaveData.arsenal: Arsenal`; `freshArsenal(): Arsenal` (bow owned, level 1; `freeChestAt` 0 = ready).
  - `migrateArsenal(save: SaveData): void` — idempotent (guarded by `migrated`): bow level = `levelForBow(save.bow.level)`; for each `c` with `save.bosses[c] > 0` the weapon whose `unlockBoss === c` becomes owned at level 1; push one `'gold'` welcome chest; `rankFloor` = today's `progressScore(save).total`.
  - `metaOf3d(save: SaveData): MetaLevels` (= `metaOf` + `weapon: arsenal.selected`, `wlevel: arsenal.weapons[selected].level`).
- [ ] **Step 1: Failing tests:** `fresh save has only the bow`; `migrates a maxed save without loss` (bow +25, bosses all 1, coins 50000, feats `['forge25']` → bow level 20, 5 other weapons owned, coins 50000, one gold chest, `progressScore` after Task 12 ≥ before — assert `rankFloor` equals the old total now); `migration runs once` (calling twice adds one chest); `repairSave fills a missing or corrupt arsenal` (garbage values → fresh defaults, levels clamped 1…20, unknown weapon ids dropped).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; `apps/okcu-3d/src/ui/save.ts` `openSave` calls `migrateArsenal` inside `store.update` once.
- [ ] **Step 4:** PASS (+ existing save tests). **Step 5:** Commit `okcu: arsenal save and lossless migration from the forged bow`.

### Task 10: Weapon upgrades

**Files:** Modify `arsenal.ts`, Test `arsenal.test.ts`

**Interfaces:** `upgradeCost(level: number): { shards: number; coins: number } | null` (null at 20; level 1→2 is `{ shards: 2, coins: 50 }`, both grow with level — builder's curve, tuned in Task 14); `canUpgrade(save, id): boolean`; `upgradeWeapon(save: SaveData, id: WeaponId): boolean` (guaranteed; spends shards + coins); `selectWeapon(save, id): boolean` (only owned).

- [ ] **Step 1: Failing tests:** `upgrade spends and always succeeds`; `cannot upgrade without shards or coins or past 20`; `cannot select a locked weapon`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `okcu: guaranteed weapon upgrades`.

### Task 11: Chests

**Files:** Create `games/okcu/src/sim/chests.ts`, Test `games/okcu/tests/unit/chests.test.ts`

**Interfaces:**
- `CHEST_ODDS: Record<ChestKind, { coins: [number, number]; shards: [number, number]; newWeaponChance: number }>` (displayed verbatim by the UI).
- `openChest(save: SaveData, kind: ChestKind, rng: Rng): ChestLoot` with `interface ChestLoot { coins: number; shards: { weapon: WeaponId; n: number }[]; unlocked: WeaponId | null }` — shards go to owned weapons and, once `save.chapter ≥ 1`, to the sling even when unowned; 10 sling shards unlock it (`unlocked`).
- `runChest(reached: number): ChestKind` (wood below wave 8, silver from 8, gold from 22).
- `FREE_CHEST_MS = 4 * 3600_000`; `freeChestReady(a: Arsenal, now: number): boolean`; `claimFreeChest(save, now: number, adWatched: boolean): ChestKind | null` (wood, or silver when `adWatched`; sets `freeChestAt = now + FREE_CHEST_MS`).
- Rng seed for chests: `createRng(hash(save.runs, a.chests.length, kind))` (deterministic per save state).
- [ ] **Step 1: Failing tests:** `odds bounds hold` (10 000 opens per kind stay within `CHEST_ODDS` ranges); `ad upgrade is optional` (`claimFreeChest(…, false)` → `'wood'`, `true` → `'silver'`); `free chest clock skew` (`now` earlier than `freeChestAt - FREE_CHEST_MS` resets `freeChestAt` to `now + FREE_CHEST_MS`, never negative wait; jumping a week ahead gives one chest, not 42); `sling unlocks from shards`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `okcu: chests with fixed, shown odds`.

### Task 12: Power, recommended power, rank and feats

**Files:** Modify `games/okcu/src/sim/progress.ts` (`SCORE`, `progressScore`, `FEATS` forge entries), `arsenal.ts`, `games/okcu/src/sim/chapters.ts`; Test `arsenal.test.ts`, `games/okcu/tests/unit/progress.test.ts`

**Interfaces:** `powerOf(save: SaveData): number` (integer; from selected weapon level × weapon base, hp/coins/reroll/starter upgrades; builder's formula, monotonic in each input); `RECOMMENDED_POWER: readonly number[]` (per chapter 0…5, from the Task 8 balance runs: the power at which CAREFUL clears the chapter in ≥ 6/8); `progressScore` uses `bowEquivalent(highest weapon level) × 80 + 40 × (owned weapons − 1)` instead of `save.bow.level × 80`, and returns `max(total, arsenal.rankFloor)`; feats `forge5…forge25` keep ids but test `highest weapon level ≥ 5/10/15/20/20`.
- [ ] **Step 1: Failing tests:** `power rises with every upgrade`; `rank never drops after migration`; `forge feats follow weapon levels`; `recommended power increases by chapter`.
- [ ] **Step 2–4:** FAIL → implement → PASS (update existing progress tests whose expectations used `bow.level`). **Step 5:** Commit `okcu: power number, recommended power, rank from weapons`.

### Task 13: Shop rules

**Files:** Create `games/okcu/src/sim/shop.ts`, Test `games/okcu/tests/unit/shop.test.ts`

**Interfaces:** `dailyOffers(dayKey: string, save: SaveData): ShopOffer[]` (3 offers seeded by `dayKey`; `interface ShopOffer { weapon: WeaponId; shards: number; coins: number }`); `buyOffer(save, dayKey, i): boolean` (once per offer per day, tracked in `arsenal.shopBought`); `CHEST_PRICE: { silver: number; gold: number }`, `buyChest(save, kind): boolean`; `COSMETIC_PRICE(id): number | null` and `buyCosmetic(save, id): boolean` (only not-yet-unlocked cosmetics; owned list `arsenal`-side `boughtLooks: string[]`, add to `Arsenal` and `isUnlocked` checks it); `adCoins(save, dayKey): number | null` (+X coins, null after 3 that day) and `grantAdCoins(save, dayKey): boolean`.
- [ ] **Step 1: Failing tests:** `offers stable within a day` (same key → same offers, after a purchase too); `offer bought once`; `ad coins capped at 3 per day`; `bought cosmetic is unlocked`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `okcu: coin shop rules`.

### Task 14: Economy simulation

**Files:** Create `games/okcu/tests/unit/economy.test.ts`; tune numbers in `arsenal.ts`, `chests.ts`, `shop.ts`

- [ ] **Step 1: Failing test** `level 10 in 3–4 h without ads, ~30 % faster with ads`: loop CAREFUL runs (`playRun`, hard) from a fresh save, banking coins + `runChest` + free chest every 4 h of summed play time (with/without ad upgrade and 3 ad coins/day), buying the best upgrade each time; assert the first weapon reaches level 10 after 3–4 h of summed run time without ads and 20–40 % sooner with ads.
- [ ] **Step 2–4:** FAIL → tune → PASS. **Step 5:** Commit `okcu: economy tuned to the spec's pace`.

### Task 15: Run-end and boss rewards in the game loop

**Files:** Modify `apps/okcu-3d/src/ui/progress.ts` (banking at run end), `apps/okcu-3d/src/main.ts` (create the world with `metaOf3d`, emit chest grants on boss kills / run end / daily goal)

**Interfaces:** run end pushes `runChest(reached)` to `arsenal.chests`; first boss kill of chapter c pushes `'boss'` (and unlocks the weapon with `unlockBoss === c` if not owned); the daily goal's coin reward becomes a `'gold'` chest; the first chapter-6 (sky) boss kill also grants the "göksel" (celestial) look for every weapon (`arsenal.celestial = true`, add to `Arsenal`; drawn in Task 20).

- [ ] **Step 1:** `npm run typecheck -w apps/okcu-3d` and `npm run build -w apps/okcu-3d` pass; manual run with `?wave=7` shows a boss chest in the save (`localStorage['oyun:okcu-3d:save']`). **Step 2:** Commit `okcu 3D: runs, bosses and the daily grant chests`.

## Phase 3 — Menu shell and screens (apps/okcu-3d)

UI tasks are verified with typecheck, build, and a Playwright screenshot script `apps/okcu-3d/tools/menu-shots.mjs` (create in Task 16; 360×640, 390×844, 412×915, TR+EN, fresh and progressed saves via `localStorage`, writes `build/menu-shots/okcu3d-<tab>-<size>-<lang>.png`). Inspect every PNG: no overlap, no clipped text.

### Task 16: Tab shell, top bar, side buttons

**Files:** Create `apps/okcu-3d/src/ui/shell.ts`, `apps/okcu-3d/tools/menu-shots.mjs`; modify `ui/title.ts` (Home tab content: sign, chapter card, PLAY, ready state; remove the medallion dock), `ui/hud.ts` (mount shell), `ui/strings.ts`

**Interfaces:** `createShell(ui: Ui, parent: HTMLElement, hooks: ShellHooks): Shell` with `type TabId = 'shop' | 'weapons' | 'home' | 'ranks' | 'events'`, `Shell.show(tab: TabId)`, `Shell.badge(tab: TabId, n: number | '!')`, `Shell.hide()` (during play). Top bar: rank chip + power (`powerOf`), coins, settings/sound. Side buttons: free chest with countdown (`freeChestReady`), daily. Chapter card shows "Önerilen güç N", green when `powerOf ≥ RECOMMENDED_POWER[c]`, orange otherwise. Tab bar: 5 tabs, centre Home larger; horizontal swipe + tap, tabs slide, buttons squash on press, badges pulse, the free-chest button glows when ready; the home scene's archer holds the selected weapon (Task 20); test ids `tab-shop|tab-weapons|tab-home|tab-ranks|tab-events`; keep `title-play`, `title-chapter*`, `title-ranks`, `title-forge` (→ opens Weapons), `title-shop`.
- [ ] Steps: implement → typecheck/build → screenshots inspected → commit `okcu 3D: tabbed main menu shell`.

### Task 17: Weapons tab

**Files:** Create `apps/okcu-3d/src/ui/weapons.ts`; modify `ui/menus.ts` (remove forge screen in hard; move the 4 upgrades into an "Okçu" card here)

Grid of weapon cards (level, shard bar `7/10`, locked silhouette + "Bölüm N bossunu yen"/"Sandıktan 10 parça"); detail view (stats as bars, perk list with next perk, `Seç`, `Yükselt` with cost); upgrade plays the power count-up. Badge `!` when `canUpgrade` for any weapon.
- [ ] Steps: implement → typecheck/build → screenshots → manual: upgrade a weapon, select it, start a run with it → commit `okcu 3D: weapons tab`.

### Task 18: Shop and Events tabs

**Files:** Create `apps/okcu-3d/src/ui/shop.ts`, `apps/okcu-3d/src/ui/events.ts`; Ranks tab hosts the existing ranks screen (`ui/online.ts` / `menus.ts` ranks) unchanged.

Shop: daily offers (with reset countdown), chests for coins (odds sheet from `CHEST_ODDS`), looks for coins, "▶ REKLAM: +X altın" (`ui.rewarded('shop_coins')`, hidden after 3/day). Events: daily challenge card (moved from title), streak, gold-chest reward. Free-chest side button: `ui.rewarded('free_chest')` optional; if it returns false the wooden chest still opens.
- [ ] Steps: implement → typecheck/build → screenshots → manual with ads unavailable (web build: `rewarded` → false) → commit `okcu 3D: shop and events tabs`.

### Task 19: Chest opening, unlock and upgrade animations

**Files:** Create `apps/okcu-3d/src/ui/chest.ts`

Chest shakes, lid pops, shards fly into weapon cards one by one, coins count; new weapon → full-screen reveal; respects reduced motion (`?fx=0` and `prefers-reduced-motion`). Opened from run end, the free chest, purchases and the welcome chest (shown once after migration).
- [ ] Steps: implement → screenshots of mid-animation frames → commit `okcu 3D: chest opening and weapon reveal`.

### Task 20: 3D weapon models and shot animations

**Files:** Modify `apps/okcu-3d/src/view/archers/gear.ts` (hold the selected weapon), `view/arrows.ts` (meshes per projectile kind: bolt, spear, boomerang spin trail, pebble, rocket smoke + confetti burst), `view/fx/particles.ts`

Code-drawn geometry only (no generated or paid assets). Celestial variant of every weapon model when `arsenal.celestial`. Player rig animations: crossbow recoil, spear throw arm, boomerang throw, sling pull, firework tube kick.
- [ ] Steps: implement → `npm run shot -w apps/okcu-3d` per weapon (`?weapon=<id>` debug param) → inspect → commit `okcu 3D: weapon models and shot animations`.

## Phase 4 — Maps and variety

### Task 21: Wider fields

**Files:** Modify `games/okcu/src/sim/chapters.ts` (`fieldSpan`), Test `games/okcu/tests/unit/chapters56.test.ts`

- [ ] **Step 1: Failing test** `field widths per chapter`: `fieldSpan(chapterStart(c))` equals `[1, 1.05, 1.1, 1.15, 1.2, 1.25][c]`, endless 1.3, and is ≥ today's value for every wave 1…60.
- [ ] **Step 2–4:** FAIL → implement (the 3D camera already follows `w.span`; check framing in screenshots for ch2 and endless) → PASS (rebalance tests that break by seed choice only). **Step 5:** Commit `okcu: fields widen from chapter 2`.

### Task 22: Stage features that favour each weapon

**Files:** Modify `games/okcu/src/sim/combat.ts` (new enemy type `'armored'`: takes ×0.35 damage from arrow/bolt/pebble/boomerang, full from spear and rocket), `waves.ts` (`BASE_HP.armored`), `chapters.ts` (stage lists, new `StageDef.mod?: 'lowCeiling' | 'fog' | 'movingBase'`), `world.ts`; view support in `apps/okcu-3d/src/view` (armour look, fog, ceiling); Test `games/okcu/tests/unit/weapons.test.ts`, `chapters56.test.ts`

Per chapter 1–2 designed stages with the mods; armored enemies from chapter 2; aligned enemies behind cover (boomerang/sling) and healer clusters (firework) placed by design, not randomly; endless pool gains `armored`.
- [ ] **Step 1: Failing tests:** `armored resists arrows, not spears`; `low ceiling blocks high arcs` (an arrow above the ceiling y deactivates); `every stage is clearable with the bow` (CAREFUL, bow level 10, god mode, each chapter's stages reach the boss).
- [ ] **Step 2–4:** FAIL → implement → PASS + Task 8 balance tests still PASS. **Step 5:** Commit `okcu: armored enemies and stage modifiers`.

## Phase 5 — Ship

### Task 23: Store screenshots, gate, test APK

**Files:** Modify `store/okcu/listing.config.mjs` (new menu, Weapons tab, a chest opening, a spear and a firework shot); `docs/production/app-store.md` / `play-yayin.md` notes if any text claims change.

- [ ] Step 1: `npm run gate` (repo root) → passes.
- [ ] Step 2: Regenerate okcu store screenshots (Play + App Store) and inspect them.
- [ ] Step 3: `ANDROID_HOME=$LOCALAPPDATA/Android/Sdk npm run apk -- okcu3d` → send the APK to the owner.
- [ ] Step 4: Commit `okcu: store screenshots for weapons and the new menu`; push. Play upload only after the owner tries the APK and the reviews in flight are done.


---

Out of scope here (spec 9 and the earlier request): the same menu pattern for Fosil and Kıvılcım, and Kıvılcım's new animation/VFX — each gets its own short design after this plan ships.
