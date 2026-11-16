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
- **Museum**: four layer tabs, set progress and bonus, 2×6 grid (names wrap to two lines, copies
  badge, grade pips), silhouettes for undiscovered fossils (odds always printed), detail view.
- **Time away**: every scene saves on going to the background and credits away time on return (and
  at boot). The haul is applied and saved at once; the dig screen shows "dust added" with a
  "Great!" button (and "Double dust (ad)"); finds at 1 in 1,000+ made while away get a real reveal
  after the popup. Finds made while the museum is open are saved immediately and revealed on return.
- **Save**: whole sim in core's versioned store; immediate on new species, any 1 in 100+ find,
  purchases, travel, unlocks, scene changes, background, `pagehide`/`beforeunload`; otherwise at most
  every 2 s. The stored last-seen time never moves backwards (`src/sim/clock.ts`), so winding the
  clock back and forth earns nothing until real time passes it.

**Honesty: luck per roll source** (`tests/unit/honesty.test.ts` checks each against what the sim
exposes for display immediately before the action):
| source | luck applied = shown as |
|---|---|
| tap | `luck` (HUD chip) = base × combo *before* the tap; the tap raises the combo after rolling |
| glint | `glintLuck` = base × combo × 10, fixed when the glint appears; its label is refreshed from it |
| assistant | `assistantLuck` = base luck, no combo; finds are marked "Assistant · luck ×N" |
| offline | `offlineLuck` = upgrades × set bonus, no combo, no rewarded boost; shown in the popup |
The rewarded boost is wall-clock: time away uses it up. Every find carries the luck it was rolled at.

**Loot tables (exact)**, integer weights summing to 12,000,000 per layer (1.2 M-roll empirical test):
- Topsoil: 4 5 6 8 10 15 30 40 50 100 400 1,200
- Ice Age: 2 5 6 12 50 60 150 250 600 1,500 4,000 12,000
- Cretaceous: 2 4 6 25 50 64 200 500 2,500 4,000 20,000 120,000
- Deep Sea: 2 3 12 16 64 300 800 2,500 5,000 50,000 250,000 1,000,000
Luck ×L multiplies every fossil at 1 in 100 or rarer by exactly L; commons/uncommons keep ≥ 10 %.

**Numbers** (`src/sim/data.ts`). Power of a copy = tier power (1, 2, 5, 12, 40, 150, 800) × layer
scale (1, 6, 40, 250) × grade (1, 4, 16, 64). Dig Power = (1 + collection) × pick. Block HP =
base × (1 + ramp·k)², base 4 / 6,000 / 150,000 / 4.5 M, ramp 0.28 / 0.009 / 0.004 / 0.003. Unlocks
at power 300 / 20,000 / 1.4 M. Upgrades: pick 15 × 1.6^l (+0.25 ×/lvl), lucky charm 60 × 2.4^l
(+0.25 luck/lvl, max 12), assistant 30 × 1.8^l (0.1 digs/s per lvl), night shift 150 × 3^l (away cap
30 min + 15/lvl, max 6). Set bonuses: Topsoil luck ×1.25, Ice Age assistant ×1.5, Cretaceous +30 min
away cap, Deep Sea power ×2. Away time: 50 % of the assistant rate, hard cap 2 h (max night shift
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
| layer 2 within 2 (fast) / ~3 (casual) min | 0.6–1.1, median 0.9 | 1.8–2.9, median 2.4 |
| layer 3 within 12 (fast) / ~15 (casual) min | 5.0–7.4, median 6.9 | 11.9–14.6, median 13.3 |
| layer 4 within 30 min | 22.1–29.1, median 25.4 | not reached in 40 min |
| Topsoil set ~3–5 min | median 4.3 (100 seeds), 59/100 within 6 | leaves Topsoil at once |
| first 1 in 10,000+ ~15–25 min | median 18.9; 17/60 none in 40 min | 23/30 none in 40 min |
| longest gap without new fossil / fusion / purchase (first 20 min) | 5.5–12.5 s | 14.7–34.8 s |

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
