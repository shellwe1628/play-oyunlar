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
