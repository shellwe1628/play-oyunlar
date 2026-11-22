# Fossil Odds (TR: Fosil Şansı) — concept

Slug `fosil` · portrait 720×1280 · score 74/100 · mechanic: collection clicker where every drop shows its odds

## Pitch

Dig through the ages. Every fossil you uncover comes stamped with its odds — from
"1 in 2" to "1 in 1,000,000". Fill the museum, fuse duplicates, dig deeper, and
chase the one-in-a-million find.

## Why this game

The mobile gap is the clearest of the three (largest rival found: 10K installs), and
the build is the smallest. The browser evidence is thin (one new title, 1.5k votes,
rated 9.2), so this is the riskiest bet of the batch; it is cheap enough to test.
Mining clickers are saturated on mobile, so the identity here is the printed odds
and the museum, not the digging.

## Core loop

1. Tap the dig site. Each tap deals your Dig Power to the current stratum block.
2. When a block breaks, the layer's loot table is rolled once and a fossil pops out
   with its rarity frame and its odds printed large ("1 in 250").
3. The fossil goes to the museum. Dig Power is the sum of the power of everything in
   your collection, so every find makes the next block break faster.
4. Three copies of the same fossil fuse into one of the next grade (plain → bronze →
   silver → gold), which is worth more power.
5. Completing a layer's set gives a permanent bonus (luck, auto-dig speed or offline
   cap). Reaching a Dig Power threshold unlocks the next, deeper layer with a new
   loot table.

Session shape: short bursts. A combo meter fills while you keep tapping and raises
luck up to ×2; it drains when you stop. Every 20–40 seconds a **glint** appears on
the dig site for 3 seconds — tapping it gives one roll at 10× luck.

## Honesty rule (non-negotiable)

The printed odds are the true base odds of that fossil in its layer. Luck multiplies
the chance of rarer tiers and the current multiplier is always shown on screen.
There is no purchasable randomness in this design.

## Content for the vertical slice

- 4 layers: Topsoil, Ice Age, Cretaceous, Deep Sea. 12 fossils each, spread over
  seven rarity tiers from 1 in 2 up to 1 in 1,000,000 (the deepest tiers appear from
  layer 2 on).
- Fossil art is built from code-drawn archetypes (spiral shell, segmented trilobite,
  bone, tooth, leaf, footprint, skull, claw) with per-fossil colour and pattern, on a
  rarity-coloured card.
- Upgrades bought with "dust" (earned per block): pick strength, luck, an assistant
  that auto-digs, offline cap. The assistant keeps digging while the app is closed,
  capped at 2 hours, at a lower rate than active play.
- Museum: per-layer grid with silhouettes for undiscovered fossils, counts, grade,
  and set progress.

## Pacing targets (the builder must prove these with a simulation test)

With a simple "tap 5 times per second, buy the cheapest useful upgrade" policy:
- Layer 1 set complete in about 3–5 minutes of play.
- Layer 2 unlocked within 2 minutes; layer 3 within 12; layer 4 within 30.
- First find at 1 in 10,000 or rarer expected around minute 15–25.
- No stretch longer than 60 seconds without a new fossil, a fusion or an affordable
  upgrade during the first 20 minutes.

## Feel

The reveal is the game. Scale the ceremony with rarity:
- Common: quick pop and a tick sound.
- 1 in 100+: card flip, sparkle, rising chime.
- 1 in 10,000+: brief slow-motion, screen shake, colour flash, the odds number
  slams in, long chime, strong haptic.
Palette: warm sediment browns and ochres for the dig, a clean museum cream for the
collection, saturated tier colours reserved for rarity frames.

## Sim (pure, in `src/sim/`)

Data-driven loot tables and upgrade costs. `DigSim(seed, save)` with `tap()`,
`tapGlint()`, `tick(dt)` (combo decay, assistant, glint timer), `buy(upgradeId)`,
`fuse()` (automatic on the third copy), `claimOffline(elapsedSeconds)`, derived Dig
Power and luck. Deterministic per seed.

Unit tests must cover: empirical drop frequencies match printed odds within
tolerance at base luck (large seeded sample); luck shifts distribution toward rarer
tiers without making any printed tier impossible; fusion arithmetic; power is the
sum of the collection; offline gain respects the cap and the lower rate; save
round-trips; the pacing targets above via the scripted policy.

## Test hook

`state()` returns layer, dig power, luck, dust, combo, museum counts, last find.
`act('tap', n)`, `act('glint')`, `act('buy', id)`, `act('advance', seconds)`.
The smoke test taps until the first layer-2 unlock and opens the museum.

## Monetisation hooks (interface only, no provider)

Rewarded: 2× luck for 60 seconds; double an offline haul. No interstitials during
active digging.

## Out of scope for the slice

Prestige, trading, events, more layers, leaderboards.

## Built (vertical slice)

**Playable now.** Menu (title, museum progress, rarest find) → Dig → Museum, with core's pause menu.
- **Dig**: tappable stratum block with sediment bands and cracks that spread with damage, "N taps
  left" HP bar, combo label + meter (tap luck ×1 → ×2), Dig Power / Dust / Luck readouts (the luck
  chip is the luck of *your taps* right now; tapping any chip explains it), glints (first one 8 s into
  a new dig, then every 20–40 s, 3 s each) labelled with the exact luck they roll at, layer arrows
  (a glowing ring nudges you to an open layer you have not dug yet), last-find strip (odds + the
  luck it was rolled at + who rolled it), rewarded "2× luck 60 s", and an upgrade drawer that stops
  below the HP bar. One-time tips (odds, dust, dig power, combo, glint, assistant, fusion, new layer).
- **Reveal** (`src/scenes/Reveal.ts`), scaled by printed odds: < 1 in 100 = pop with odds and the
  luck line; 1 in 100+ = card (back flips, the front pops in whole), rays kept inside the dig site,
  luck caption above the card, badges for New / Glint / Assistant, rising chime, medium haptic,
  digging continues; 1 in 10,000+ = everything stops: darkening + slow push-in while debris hangs,
  flip with tier-colour flash, shake, hit-stop and heavy haptic, the odds number slams in, "luck ×N"
  with its source, confetti, long chime, "tap to continue". **Fusion**: three copies fly together
  into the new grade with "+N dig power" and a sound.
- **Museum**: ten layer tabs (two rows of five; a dot marks completed sets), set progress and bonus, 2×6 grid (names wrap to two lines, copies
  badge, grade pips), silhouettes for undiscovered fossils (odds always printed), detail view.
- **Time away**: every scene saves on going to the background and credits away time on return (and
  at boot). The haul is applied and saved at once; the dig screen shows "dust added" with a
  "Great!" button (and "Double dust (ad)"); finds at 1 in 1,000+ made while away get a real reveal
  after the popup. Finds made while the museum is open are saved immediately and revealed on return.
- **Save**: whole sim in core's versioned store; immediate on new species, any 1 in 100+ find,
  purchases, travel, unlocks, scene changes, background, `pagehide`/`beforeunload`; otherwise at most
  every 2 s. The stored last-seen time never moves backwards (`src/sim/clock.ts`), so winding the
  clock back and forth earns nothing until real time passes it.

**Presentation layer (animation and art round).** Driven by sim events and time, never feeding
back: `src/fx/model.ts` (pure) decides visual tiers and the helper's moods from a read-only
`SimView` (getters only); `src/fx/*` draws. `tests/unit/fx.test.ts` proves a seeded 4,000-step
session ends in the identical save with the presentation reading the sim every step, that printed
odds and displayed luck are unchanged, and checks the one read-only hook added (`TickResult.assistantHits`).
`?fx=0` switches the presentation off (same gameplay) for comparisons.
- *Dig*: a pickaxe (5 looks by pick level: wood, iron, steel, gold, crystal) swings onto the tap
  point; each tap restarts the strike instead of queuing, and taps < 130 ms apart add motion ghosts
  (a flurry). Chips and dust fly from the strike point; cracks start where the block was hit (up to
  three strike origins). A breaking block splits into chunks that tumble, bounce and settle at its
  foot while the next block rises; a found fossil rises out of the rubble (glowing in its tier colour)
  before its card appears; very rare finds lift a dark silhouette out of the rubble during the
  slow-motion build. Everything is pooled (fixed particle slots, oldest reused).
- *Four places*: each layer has its own baked backdrop and block material plus ambient actors —
  topsoil roots, burrowing worms and spores; ice-age icicles, frost, glinting crystals, snow and a
  cold shimmer; cretaceous amber, swaying ferns and embers; deep-sea kelp, sand, bubbles, plankton,
  light shafts and a leviathan silhouette crossing far behind. A dark band behind the HUD keeps the
  readouts on top. Travel plays a short descent/ascent of rushing strata.
- *The helper*: appears with the first assistant level, works at its own rhythm in time with real
  assistant hits (never more than 3 queued swings), is visibly better equipped as it levels (cap,
  pick, lamp helmet, drill), shows "!" when it finds something, cheers at 1 in 100+, naps through the
  offline popup (and a moment after) and wakes with a stretch.
- *Cards*: rare and prized get a slow sheen, legendary drifting motes, mythic and singular a
  breathing glow — on reveal cards, the last-find strip, museum cases and the museum detail.
  Fusion: three copies spin together with trailing sparks into the new grade, shockwave ring, shake,
  haptic and a counting-up power gain. Glints: a glow, a main star and seven twinkling sparkles.
- *Museum*: layer-tinted wall, wooden shelves under each row, glass glint on found cases, a
  spotlight and "Rarest" ribbon on the rarest find of the layer, and a one-time set-completion
  celebration (cases pop in sequence, confetti, banner, fanfare; remembered outside the save).
- *Screens*: the menu shows the dig site in miniature with the helper working and your rarest find
  on a lit pedestal. Drawer icons (pick at its tier, clover, helper head, moon) bob and glow when
  affordable and spin when bought.
- *Cost* (Deep Sea, assistant on, 15 real touches/s, this shared machine at ~6 FPS): own scene JS
  0.4–0.6 ms per idle frame and 0.4–1.2 ms per tap with the presentation, 0.3–0.9 / 0.4–0.5 ms with
  `?fx=0`; whole-page JS per frame 5.1–5.4 ms before this round, 5.3–7.0 ms after. Every tap counted
  (150/150) in every run. Bundle 394/550 KB gz.

**Honesty: luck per roll source** (`tests/unit/honesty.test.ts` checks each against what the sim
exposes for display immediately before the action):
| source | luck applied = shown as |
|---|---|
| tap | `luck` (HUD chip) = base × combo *before* the tap; the tap raises the combo after rolling |
| glint | `glintLuck` = base × combo × 10, fixed when the glint appears; its label is refreshed from it |
| assistant | `assistantLuck` = base luck, no combo; finds are marked "Assistant · luck ×N" |
| offline | `offlineLuck` = upgrades × set bonus, no combo, no rewarded boost; shown in the popup |
The rewarded boost is wall-clock: time away uses it up. Every find carries the luck it was rolled at.
One offline haul is rolled entirely at the luck captured when it starts (a set it completes counts
after it); the popup lists the distinct lucks its finds actually used, and merged hauls list all of
them. Inside one large tick each assistant find shows its own recorded luck; nothing aggregates.
Dig-screen toasts sit between the HP bar and the last-find strip (not over the block, the luck
readout or the main buttons).

**Loot tables (exact)**, integer weights summing to 12,000,000 per layer (1.2 M-roll empirical test):
- Topsoil: 4 5 6 8 10 15 30 40 50 100 400 1,200
- Ice Age: 2 5 6 12 50 60 150 250 600 1,500 4,000 12,000
- Cretaceous: 2 4 6 25 50 64 200 500 2,500 4,000 20,000 120,000
- Deep Sea: 2 3 12 16 64 300 800 2,500 5,000 50,000 250,000 1,000,000
- Coal Swamp: 2 5 6 10 64 80 300 800 2,500 5,000 50,000 200,000
- Amber Forest: 2 3 10 25 48 250 800 2,500 8,000 25,000 60,000 600,000
- Salt Caves: 2 3 12 25 32 120 300 5,000 8,000 20,000 30,000 120,000
- Crystal Geode: 2 3 10 30 40 250 300 1,500 4,000 15,000 100,000 150,000
- Magma Vents: 2 3 10 25 40 800 5,000 8,000 15,000 50,000 250,000 1,000,000
- First Seas: 2 3 10 16 500 800 1,500 8,000 10,000 50,000 250,000 1,000,000
No two layers share a table (tested); every table passes the 1.2 M-roll χ² test.
Luck ×L multiplies every fossil at 1 in 100 or rarer by exactly L; commons/uncommons keep ≥ 10 %.

**Numbers** (`src/sim/data.ts`). Power of a copy = tier power (1, 2, 5, 12, 40, 150, 800) × layer
scale (1, 6, 40, 250, 1,500, 9,000, 54 K, 320 K, 1.9 M, 11 M) × grade (1, 4, 16, 64). Dig Power =
(1 + collection) × pick × set power bonuses × expedition bonus × 1.15 per relic. Block HP =
base × (1 + ramp·k)² × stratum, base 4 / 6,000 / 150,000 / 4.5 M / 26 M / 220 M / 2.2 B / 15 B /
140 B / 600 B, ramp 0.28 / 0.009 / 0.004 / 0.003 (all deeper layers 0.003). Unlocks at power 300 /
20,000 / 1.4 M / 13 M / 110 M / 1.1 B / 7.5 B / 70 B / 300 B (× stratum). Upgrades: pick 15 × 1.6^l (+0.25 ×/lvl), lucky charm 60 × 2.4^l
(+0.25 luck/lvl, max 12), assistant 30 × 1.8^l (0.1 digs/s per lvl), night shift 150 × 3^l (away cap
30 min + 15/lvl, max 6). Set bonuses: Topsoil luck ×1.25, Ice Age assistant ×1.5, Cretaceous +30 min
away cap, Deep Sea power ×2, Coal Swamp luck ×1.25, Amber Forest power ×1.5, Salt Caves assistant
×1.5, Crystal Geode luck ×1.25, Magma Vents power ×1.5, First Seas power ×2. Away time: 50 % of the assistant rate, hard cap 2 h (max night shift
plus the Cretaceous set would be 2.5 h). Combo +0.05 per tap, drains 0.4/s after 0.45 s idle.

**Why a real player was slower than the old policy.** Replaying the playtest in the sim: a player
tapping ~1/s with pauses who does not travel reaches power 759 with Pick 8 / Assistant 5 and 11/12
Topsoil after 8–9 minutes — the tester's state. Progress is almost entirely taps (and the Topsoil
HP ramp makes it worse than linear), and nothing pushed them to the open layer: after ~2.5 min only
the 1 in 250 and 1 in 1,000 were left in Topsoil, so it was commons only. Fixes: lower unlocks
(450 → 300, 40,000 → 20,000), a glowing arrow + "new layer" tip until you dig there, visible fusions,
tips; the old fast policy plus a casual one now both pass.

**Measured pacing** (`tests/unit/pacing.test.ts`). *Fast*: 5 taps/s, glint after 0.6 s, cheapest
of pick/luck/assistant when affordable, finishes sets up to 1 in 2,000 but goes deeper 4 min after the
next layer opens (60 seeds; Topsoil set over 100 seeds). *Casual*: 2.5 taps/s in 7 s bursts with 3 s
pauses, glints only while tapping (1.2 s), buys the leftmost affordable upgrade every 5 s, travels
as soon as a layer opens (30 seeds).
| target | fast | casual |
|---|---|---|
| layer 2 within 2 (fast) / ~3 (casual) min | 0.4–0.9, median 0.7 | 1.6–2.9, median 2.2 |
| layer 3 within 12 (fast) / ~15 (casual) min | 3.5–6.4, median 5.2 | 10.4–12.8, median 11.9 |
| layer 4 within 30 min | 14.9–22.4, median 18.7 | not reached in 40 min |
| Topsoil set ~3–5 min | median 3.1 (100 seeds), 68/100 within 6 | leaves Topsoil at once |
| first 1 in 10,000+ ~15–25 min | median 20.0; 19/60 none in 40 min | 22/30 none in 40 min |
| longest gap without new fossil / fusion / purchase (first 20 min) | 5.1–13.1 s | 13.4–29.1 s |
(The previous round's figures were a little slower: fever, golden blocks, goal rewards and the lucky
streak all speed the first minutes; golden blocks only start after 150 finds and fever needs 240
combo-weighted taps so the Topsoil set stays at 3–5 min.)

**Deviations from the concept, and why.**
- Topsoil holds one *prized* fossil (1 in 1,200) so its set takes minutes; legendary and rarer start
  in the Ice Age. Topsoil has no "1 in 2". Odds are exact divisors of 12,000,000 (1 in 16, 64).
- A tap breaks at most one block. Fusion stops at gold. "Double an offline haul" doubles dust only.
- The Deep Sea set bonus is power ×2. The first glint of a new dig comes after 8 s (to teach it).
- The 1 in 10,000+ reveal pauses the sim, so the combo does not drain while you watch.
- No result screen (continuous game): the smoke test ends with reload-and-compare.
- Museum card labels are 27–31 px on a 2×6 grid (core's guideline is 34 px); the detail view is larger.

**Candidates for core**: checked `at(arr, i)`; Turkish locative + short number formatting
(`src/sim/format.ts`); session save cadence with monotonic last-seen (`src/session.ts`,
`src/sim/clock.ts`); invisible ≥ 88 px `hitZone`; a "disabled but readable" button look. **Found**:
Phaser clamps delta to 16.7 ms while unfocused (headless), so automated game time runs slow; in this
headless renderer dimming overlays render lighter than their alpha.

## Built: content and progression round

**Ten layers**, each its own place (baked backdrop, block material, ambient life) and 12-fossil table,
and from layer 5 on its own twist, introduced alone with a one-time tip when first met:
| # | layer | twist | look |
|---|---|---|---|
| 5 | Coal Swamp | **hard vein** (35 % of blocks): taps do ×0.25; hold and release: ×0.25 → ×5 over 0.8 s (charge ring, clang) | horsetail trunks, black water, fireflies, coal seams and fern prints |
| 6 | Amber Forest | **unstable** (35 %): first hit starts 6 s; break it in time for a bonus roll; the block trembles faster as time runs out | amber-weeping pines, golden drops, sun motes |
| 7 | Salt Caves | **twin** (40 %): ×1.7 hp, two fossils | pink/white stalactites, salt cubes, brine drips |
| 8 | Crystal Geode | **relic fragments**: 1 in 6 blocks; 5 = a relic, dig power ×1.15 for good, up to 3 | the pit is a geode of violet points; twinkling crystals |
| 9 | Magma Vents | **cave-in** (1 in 8): rubble, ×0.4 hp, no fossil, ×3 dust, rumble | basalt, lava rivers, embers, heat haze |
| 10 | First Seas | **boss** every 20th block: ×6 hp in 3 phases, each phase rolls at boss luck ×3 ("Boss luck ×3" shown), ×5 dust | shallow sea, quilted fronds, disc prints, drifting discs, light shafts |
Everywhere: **golden blocks** (1 in 20 after the first 150 finds): ×1.5 hp, two fossils, ×5 dust.
A line above the block always says what is special about it (hold / timer / twin / golden / rubble /
boss phase / relic parts / boss in N).

**Expedition** (prestige), open once First Seas is reached: restart from Topsoil keeping the museum
(every species ever found, best grade per species), set bonuses, relics, records, goals and the daily
streak; dust, upgrades, layers and copies reset. Each expedition adds +60 % dig power and dust for good
and digs one stratum deeper: block hp and layer thresholds ×(1 + 0.6·n). The confirm screen lists
exactly this. Cost-curve check (long-run pacing below): with "harder" at 0.3 runs collapsed to 11 min
(trivial), at 1.0 they never got shorter (pointless); 0.6 gives run 2 ≈ 65 % of run 1 and later runs
that shrink slowly (set bonuses) and never under 30 min.

**Rank system.** Progress score (pure, `scoreOf` in `src/sim/dig.ts`, deterministic, tested; `score`
and `scoreParts` in the dig test state) = per species ever found 10 / 20 / 40 / 80 / 150 / 300 / 600 by
tier + 15 per best-grade step (gold = 45) + 150 per set + 100 per layer of depth + 200 per relic +
1,500 per expedition. Twelve ranks with their own code-drawn badges (`src/art/badges.ts`: medallions,
shields, rayed crests): Pebble Picker 0, Sand Sifter 100, Root Digger 400, Bone Finder 1,000, Stone
Reader 2,200, Strata Scout 4,000, Fossil Hunter 6,500, Field Curator 10,000, Deep Delver 15,000, Master
Excavator 22,000, Grand Curator 32,000, Legend of the Layers 46,000. Measured: the fast player is at
rank 8 at the first expedition (~3.3 h) and rank 9 after 15 h; casual rank 7 at ~7.3 h. Rank-up
ceremony (old badge shatters, new one lands, name, score, next rank); badge on the dig screen (opens
the Ranks screen) and on the menu. **Ranks screen**: Ladder (your card with the score breakdown and
progress to the next rank, the whole ladder with your rung), Records (five rarest species with the date
of first find, fastest set completions timed from the layer opening, best expedition), Goals (25
achievements — finds, species, tiers, sets, depths, gold fusions, relics, expeditions — with progress
and dust rewards, scrollable), and the Expedition button. No other players, no invented rows; the
screen says so.

**Excitement.**
- *Lucky streak* (instead of near-miss teases, which would mislead): after 150 finds in a row without
  a 1 in 100+, the next find is guaranteed 1 in 100+, chosen among those fossils in exactly their
  printed proportions (not luck-scaled). Gauge left of the boost button counts down; rule in a tip;
  the find is badged "Lucky streak!". Tested: never fires early, conditional distribution χ²-checked
  on every layer.
- *Combo fever*: each tap fills a fever meter by your combo; full (240) = 8 s FEVER: ×2 tap damage, ×2
  dust, combo frozen; pulsing orange frame, title, roar sound, haptic.
- *Chains*: tap breaks within 1.5 s: +10 % dust per link up to ×2, floating "Chain ×1.3".
- *Bigger reveals*: mythic adds shockwave rings and a tier banner; singular adds an eclipse ring, a
  second flash, more confetti; distinct haptic patterns per tier (none / none / medium / 2× medium /
  heavy-medium-success / 2× heavy… / 4× heavy + success).
- *Daily dig*: once per calendar day, streak up to 7: streak × 15 blocks of dust and 3 min of ×2 luck.
- *Goals* pay dust and toast; rank-ups, relics, bosses, cave-ins get their own sound and haptics.

**Honesty.** Every new probability is printed and tested: boss rolls use the luck shown in the status
line (`bossLuck`, = effective luck × 3, capped like all luck), each `Find` carries the luck it rolled
at, `pity` and `block` (twin/golden/boss); offline hauls include extra rolls and list goal dust
separately (never doubled). Nothing about randomness can be bought.

**Save v2** (`migrateV1`, `src/save.ts`): v1 players keep counts, dust, levels, layer, stats, tips,
rng and last-seen; their collection becomes the museum, best grades and the rarest find become
records; `broken` grows to ten layers. Tested with a literal v1 save through the real save store.

**Long-run pacing** (`tests/unit/pacing.test.ts`, 4 seeds × 15 h each profile; fast also holds 0.8 s
on veins, casual 0.6 s; both start an expedition as soon as it opens; daily bonus not used):
| | fast | casual |
|---|---|---|
| layers 5–10 open at (min) | 38–44, 66–74, 92–102, 120–134, 154–168, 190–209 | 93–100, 146–153, 208–217, 282–288, 359–369, 438–444 |
| first expedition | 3.2–3.5 h | 7.3–7.4 h |
| run 2 / run 1 | 0.63–0.69 | 0.25 (one seed finished a rare ×2 set), 0.58–0.67 |
| later runs | 1.6–2.2 h | 1.3–1.4 h (one seed) |
| longest dead stretch, first hour | 9–11 s | 13–22 s |
Tests: all ten layers open (fast ≤ 4 h, casual ≤ 9 h), no layer step over 45 / 100 min, first
expedition 2.5–4 h / 6–9 h, median run-2 ratio 45–90 %, no run under 30 min, no 60 s gap in hour one.

**Cost** (Magma Vents and First Seas, assistant max, fever, 12 real touches/s, this shared machine at
~6–7 FPS headless): own scene JS 2.5–3.6 ms per idle frame, 1.8–2.2 ms per frame while tapping,
3.1–3.5 ms per tap (Deep Sea 2.7 / 1.9 / 2.5; Magma with `?fx=0` 2.1 / 1.7 / 2.7). Every touch
counted (120/120). Bundle 415/550 KB gz.

**Not done, and why.** Near-miss teases (showing a rare that "almost" dropped) would misrepresent the
roll — replaced by the lucky streak. No leaderboard: no server, and fake rows are not allowed; the
records board is your own bests. Turkish names for the new fossils are original descriptive names.

**Core candidate: `platform.submitScore`.** What it would need: a board id per game (`fosil:score`),
an integer score (the progress score here, monotonic within a save but able to drop on a v-next
rebalance), an optional tag/metadata (rank id, expeditions), a "best only" policy, a result
(`submitted | offline | unsupported`) that never throws, queueing while offline, and a matching
`showLeaderboard(boardId)` that is a no-op on the web platform.

## Built: polish round (motion and feel)

Presentation only: no rule, odds, number or save field changed, and `src/sim/**` is untouched.
Shared helpers live in `src/fx/Motion.ts`; everything new respects reduced motion and `?fx=0`.
- **Calm camera.** `calmShake` caps every shake at trauma 0.5 (about 5 px) and stops shakes from
  adding up: a break + a find + a fusion shake as much as the biggest of them. No full-screen
  colour or white flash is left anywhere: fever, relic, boss phase and the 1 in 10,000+ flip glow
  at the screen edges (`edgeFlash`, nested frames of plain rectangles: a stretched screen-sized
  image tore while the camera shook) and, for the flip, light bursts from behind the card.
  Grand-reveal confetti and the mythic/singular shockwave rings stay behind the card and the odds.
  The block's hit kick is integrated in small steps and held within 6 degrees, so several hits in
  one slow frame can no longer throw it far over.
- **Found and fixed on the way (presentation only).** A purchase that opened a layer raised the
  rank and finished goals without any event (the sim reports none for `buy`), so the rank-up later
  showed an older badge and the new layer got no banner: `afterBuy` reads the change off the sim
  and presents it like a find would. A rank-up never shows a rank lower than the one held.
- **Dig.** Chips fly away from the pick's swing with a contact star where it bit; the stretch of
  crack that just opened is drawn bright and fades; dust rolls out along the floor after a break;
  the HP bar eases (drains fast, fills for a fresh block) and its line turns gold and beats when
  one hit is left; dust and dig power count up (about 25 text updates a second at most); coins
  shrink into the dust icon; the block drops in when you arrive; the Upgrades button hops when
  something new is affordable; a bought row lights up.
- **Reveal.** A card never sits lower than the block (a glint low on the site used to put its odds
  under the messages); it lands with a small squash; a first find rings in its tier colour; a rare
  card leaves sparks in the last-find strip.
- **Museum.** Daylight and drifting dust; the set bar fills and counts; cases give under the finger;
  the detail view eases in and out, with rays behind rare pieces. Species found since your last
  visit wear a "New!" ribbon, their tab carries a dot, and the dig's Museum button shows how many
  wait (presentation memory in `src/fx/seen.ts`, outside the save).
- **Ranks, menu, popups.** Lamp light and gold dust on the ranks page, the badge lands, score and
  bars count up, your rung breathes; fireflies and pit dust on the menu, drawer bars fill; the
  away-time dust counts up and coins fly to the counter on claim; today's daily pip is stamped in.
- **Test hook.** `act('fxPreview', { kind: 'reveal' | 'rank' | 'fusion', odds })` plays a ceremony
  without touching the sim (screenshots).

## Built: map and rush round (depth map, weak spots, Dig Rush)

Spec: `docs/superpowers/specs/2026-11-22-fosil-harita-hucum-design.md`. No new layer, fossil,
tier, upgrade or currency; loot tables, printed odds and every luck rule are untouched. Nothing
here is needed for progress: the scripted pacing players use none of it and their tables above
are byte-for-byte what they were (see "Streams" below).

**Weak spots** (`WEAK` in `src/sim/data.ts`, rules in `src/sim/dig.ts`). While you dig, a target
appears on the block face: the first one 4 s into a brand-new dig, then 6–9 s after the last one
went, visible 2.2 s, in one of nine cells of the face and never the cell of the one before. A tap
within 0.17 of it (block-relative, the faint disc drawn under the mark) is a **precise hit**: ×4
damage for that tap. Precise hits in a row are the **sharp eye**: ×4, ×4.5, ×5, ×5.5, ×6 (five in
a row) and it stays at ×6; a spot left to expire resets it, a normal tap in between does not.
Missing costs nothing. It stacks with what the tap already had (fever ×2, a charged strike on a
hard vein). A spot never appears while a glint is up and makes way if one appears (the sharp eye
is kept); a Star Crater meteor block has its star core instead and shows no weak spot. The
assistant and time away never use it. Damage only: luck, tables and every roll are exactly as
before (tested: the luck of a find from a precise hit is the luck shown before the tap, and such
finds follow the printed table). One-time tips: the first weak spot, the sharp eye at two in a row.

**Dig Rush** (`RUSH`). A stopwatch button right of the block, offered once Topsoil has 4 species
(a 2.5 taps/s player gets there within 90 s on every seed tested), no ad. 45 s of play on the
current layer. Rush blocks have 20 % of the layer's normal block health (at least 1) and pay the
normal dust of a block; only plain and golden blocks appear (golden at the usual 1 in 20 after 150
finds: ×1.5 health, two fossils, ×5 dust); vein, unstable, twin, cave-in, boss, pressure, meteor
and echo blocks rest, and so do relic fragments. Every break rolls the layer's normal table at
the tap luck on screen (charm × sets × boost × combo, capped as always): no hidden bonus, the
status line says "finds roll at luck ×N" with the number of the luck chip. Fever, chains and weak
spots work. The assistant stands back and no new glint appears for those 45 s. Rush blocks are
counted on their own: they do not harden the stratum (the hp ramp), do not move the boss on, and
the block you were digging (with its damage, even a boss half done) is set aside and comes back.
You cannot travel during a rush; leaving the dig screen or the app ends it (what it broke counts).
Finds are real finds: museum, fusion, goals, lucky streak. The result card lists blocks, the
personal best (most blocks in one rush, kept in the save), dust, finds rarest first (four kinds,
then "+N more"), the sentence "Every find was rolled at the tap luck on screen" and the time to
the next rush.

*Cooldown*: one rush per 3 h of wall-clock time, counted from its start. The save keeps the
latest wall-clock time it has ever seen (`rush.seen`, only moves forward; pure rule `cooldown()`
in `src/sim/clock.ts`), and the wait is counted from that: a clock wound back does not shorten it,
winding back and forth over the same hours earns nothing, only time beyond the latest ever seen
counts. (As with away time, a clock wound forward and left there gets what was due at that time.)

*Balance guard* (`tests/unit/rush.test.ts`, players in `tests/unit/rushPlayer.ts`: the tapping
and shopping of the two pacing profiles, kept on one layer). From the same save, one rush against
four minutes of normal play on that layer; "aiming" = also tapping every weak spot:
| player, layer | blocks in one rush | = minutes of normal play (blocks) | by finds | by dust |
|---|---|---|---|---|
| fast, layer 1 (when the rush is first offered) | 225 | 3.4–3.5 (aiming 3.3) | 3.2–3.3 | 0.4–0.5 |
| fast, layer 3 | 225 | 2.0–2.1 | 2.0–2.1 | 1.7 |
| fast, layer 6 | 225 | 2.2 | 1.6 | 1.8–2.0 |
| casual, layer 1 | 82 | 3.1 (aiming 2.9–3.0) | 2.9 | 0.7–0.9 |
| casual, layer 3 | 81 | 1.8–1.9 | 1.8 | 1.9–2.6 |
| casual, layer 6 | 82 | 1.3–1.4 | 1.0 | 1.5–1.6 |
Tested: never more than 4 minutes by blocks, by finds or by dust, always more than its own 45 s;
one rush per 3 h is under 3 % of the play it interrupts. Normal blocks take these players about
3–4 taps, so a rush block (a fifth) breaks on every tap: the best is, in practice, how fast you
tap for 45 s. (The spec expected "one break a second"; at these health values that would make a
rush worth less than normal play, so the share stays at a fifth and the guard holds it.)

**Depth map** (`src/scenes/MapScene.ts`, model `mapBands` in `src/fx/model.ts`). Opened from the
dig screen (the round Map button left of the block, or the layer name between the arrows, which
stay) and from the menu (top left). The whole dig in cross-section: dusk sky and the surface with
the shaft head, then every layer as a band in its own strata colours. Open layers are carved
galleries with their ambient life in miniature (spores, snow and icicles, embers and ferns,
bubbles and a leviathan, fireflies, amber drops, salt glints, geode crystals, magma embers, discs,
marine snow, stars, shards), the name, the rarest species found there with its odds, set progress
(n/12, green with a tick when complete) and the layer's twist (icon and name). Locked layers are
solid rock in the dark with a lock and the dig power that opens them; the next one down also shows
your dig power against it. The shaft with its ladder is dug down to the deepest open layer; the
current layer is lit, its frame breathes, your miner stands in it under "You are here". After an
expedition a signpost at the surface carries the depth marker ("Expedition 1 · stratum 2 · rock
×1.6") and the lock values are those of that stratum. Drag or wheel to scroll (a flick glides);
the sky moves at half speed and what stands at the back of a gallery lags a little (parallax);
bands slide in from alternating sides on entry. Tapping an open band travels there: the strata
sheet covers the map and runs off on the dig screen (`src/fx/Travel.ts`, shared with the arrows);
tapping the current band goes back to the dig; a locked band says what opens it. The map reads
the sim through the read-only view and asks only for `travel`; the sim does not tick while it is
open (as on the title screen), so no glint or weak spot passes unseen.

**Honesty.** Luck per roll source is unchanged; a rush find is a `tap` find (`Find.rush` marks
it) rolled at `luck`, the HUD chip. `tests/unit/weak.test.ts` and `tests/unit/rush.test.ts`
check both against the value on screen before the action and χ²-check the finds against the
printed table at the luck each find carries. Nothing about randomness can be bought; the rush
needs no ad.

**Streams** (`tests/unit/streams.test.ts`). Weak spots and the rush draw from their own rng
streams (`rng.fork('weak')`, `rng.fork('rush')`: derived from the seed by label, consuming
nothing; their states are saved beside the main one). The main stream is never touched by them:
a weak spot draws its place and the wait after it together, a rush draws its golden blocks and
its fossils from the rush stream. Tested with values recorded from the sim before this round (the
seeded fx session and a fresh dig end in the recorded rng state, finds, dust and collection), by
the same weak spots showing however the dig is played, by precise hits and by a whole rush
leaving the main rng state where it was. The pacing printout is identical line for line.

**Save** (still v3, no migration: additive fields with defaults, repaired by `sanitizeSave`).
`weak` { in, gap, spot, cell, streak, hits, rng } and `rush` { left, blocks, dust, rolls, found,
fresh, held, best, count, readyAt, seen, rng }. A save from before the round loads with nothing
lost, the first weak spot scheduled, no best and the rush on offer (tested through the real save
store with the two fields deleted). A rush that was running when the app closed is over on load:
its blocks count for the best, the block that was being dug is back.

**Look and feel.** No new shake source and no flash: a precise hit is a star, a ring, chips and a
rising tick (one step higher per sharp-eye step); rush blocks break without the break shake and
without hit-stop; the last 10 s pulse the clock and the frame and tick each second. The rush puts
the site in a warm light (a tint over the site only, two slow rays, rising sparks, a gold frame)
with a start banner; the rush button becomes the clock (a ring that drains), Blocks and Finds take
the place of the Map button; Museum, Upgrades, Daily, the boost and travel wait until it is over.
The result card counts blocks and dust up and stamps a new best. Reduced motion: no slide-in, no
breathing, no pulses, no sparks; `?fx=0`: no sparks, pulses or spin. All texts in `en` and `tr`.

**Test hook.** Dig: `state()` adds `weak` (screen position, life, multiplier), `sharp`, `precise`,
`rush` (open, ready, active, left, blocks, finds, best, count, wait), `rushCard`, `travelling`,
`ui.map`, `ui.rush`, `ui.rushClaim`; `act('map')`, `act('rush')` (the buttons' own handlers),
`act('waitWeak', seconds)` (lets time pass in steps until a weak spot shows), `act('tapWeak')`
(a tap on it through the dig handler), `act('close')` also closes the rush card. Map: `state()`
gives `from`, `scroll`, `maxScroll`, `window`, `bands` (with screen positions), `ui.back`;
`act('scroll', px)`, `act('scrollTo', layer)`, `act('band', layer)`, `act('back')`. Menu:
`act('map')`. `tests/e2e/harita.spec.ts` plays all three by real touch and reloads.

**Not done, and why.** The weak spot stays where it is when its block breaks (it rides on the
next block): on Topsoil and in a rush blocks break faster than a spot lasts, and a spot that
vanished with every break could hardly ever be hit. A rush does not survive closing the app (it
ends; its blocks count). The map shows no layer the game does not have and no other players.
Bundle 467/550 KB gz.
