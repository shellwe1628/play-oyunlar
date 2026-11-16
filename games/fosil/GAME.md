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
  left" HP bar, combo meter (luck ×1 → ×2), Dig Power / Dust / Luck readouts (luck always shows the
  multiplier that applies right now; tapping it explains the rule), glints every 20–40 s for 3 s
  showing the luck they roll at, layer travel arrows (locked layers say what power opens them),
  last-find strip, rewarded "2× luck 60 s", and an upgrade drawer that stops below the HP bar so
  the block stays visible and tappable.
- **Reveal** (`src/scenes/Reveal.ts`), scaled by printed odds: < 1 in 100 = pop out of the block
  with its odds and a tick (alternating sides so rapid finds never overlap); 1 in 100+ = card back
  flips to the rarity card, light rays, sparkles, rising chime, medium haptic, digging continues;
  1 in 10,000+ = everything stops: darkening + slow camera push-in while debris hangs in the air
  (~1 s), flip with full-screen tier-colour flash, heavy shake, hit-stop and heavy haptic, the name
  pops, the odds number slams in with a boom, "rolled at luck ×N", confetti, long chime, then
  "tap to continue".
- **Museum**: four layer tabs, set progress bar and its bonus, 2×6 grid with silhouettes for
  undiscovered fossils (odds always printed), copies found and grade pips; tap a card for a large
  detail view (grades, power each, fuse rule, luck rule).
- **Offline haul**: on start and on return from background, the assistant's capped haul is
  applied immediately and shown in a popup (Collect / Double dust (rewarded)).
- **Save**: whole sim in core's versioned store; written immediately on new species, any find at
  1 in 100+, purchases, travel, unlocks, set completion, scene changes, going to the background
  and `pagehide`/`beforeunload`, and otherwise at most every 2 s while digging. Load repairs junk
  values and derives set bonuses from the collection.
- tr + en strings (48 original fossil names each), synthesized sfx (`src/sfx.ts`), haptics only
  through `platform.haptic`, juice through core.

**Loot tables (exact).** Weights are integers summing to 12,000,000 per layer, so "1 in N" is the
exact base probability (`tests/unit/loot.test.ts` proves it on 1.2 M seeded rolls per layer:
every fossil with ≥ 20 expected hits within 5σ, χ² < 40; a 2 % skew of the roll makes it fail).
- Topsoil: 4 5 6 8 10 15 25 50 60 100 250 1,000
- Ice Age: 2 5 6 12 50 60 150 250 600 1,500 4,000 12,000
- Cretaceous: 2 4 6 25 50 64 200 500 2,500 4,000 20,000 120,000
- Deep Sea: 2 3 12 16 64 300 800 2,500 5,000 50,000 250,000 1,000,000

Tiers: common < 10, uncommon < 100, rare < 1,000, prized < 10,000, legendary < 100,000, mythic
< 1,000,000, singular = 1,000,000. **Luck rule**: luck ×L multiplies every fossil at 1 in 100 or
rarer by exactly L; commons/uncommons shrink in proportion; L is capped per layer so commons and
uncommons always keep ≥ 10 % (cap ≈ ×60–×170 depending on layer, only reachable by glints).

**Numbers** (`src/sim/data.ts`). Power of a copy = tier power (1, 2, 5, 12, 40, 150, 800) × layer
scale (1, 6, 40, 250) × grade (1, 4, 16, 64). Dig Power = (1 + collection) × pick. Block HP =
base × (1 + ramp·k)² with base 4 / 6,000 / 150,000 / 4.5 M and ramp 0.25 / 0.009 / 0.004 / 0.003;
dust per block = base (1 / 30 / 1,000 / 30,000) × √(hp/base). Unlocks at power 450 / 40,000 /
1.4 M. Upgrades (cost = base × growth^level): pick 15 × 1.6^l (+0.25 power ×/lvl, max 80), lucky
charm 60 × 2.4^l (+0.25 luck/lvl, max 12), assistant 30 × 1.8^l (0.1 digs/s per lvl, max 25),
night shift 150 × 3^l (away cap 30 min + 15/lvl, max 4). Set bonuses: Topsoil luck ×1.25, Ice Age
assistant ×1.5, Cretaceous +30 min away cap, Deep Sea power ×2. Offline = 50 % of the assistant
rate, hard cap 2 h. Combo +0.05 per tap, drains 0.4/s after 0.45 s idle.

**Measured pacing** (`tests/unit/pacing.test.ts`, 20 seeds, tap 5/s, glint after 0.6 s, buy the
cheapest of pick/luck/assistant when affordable, finish a layer's sets up to 1 in 2,000 but go
deeper 4 min after the next layer opens):
| target | measured |
|---|---|
| Topsoil set in ~3–5 min | median 3.55 min; 15/20 seeds by 4.6 min (fastest 0.8), 5/20 leave it unfinished |
| Layer 2 within 2 min | every seed, 0.9–1.2 min |
| Layer 3 within 12 min | every seed, 7.2–9.4 min |
| Layer 4 within 30 min | every seed, 22.9–28.1 min |
| first 1 in 10,000+ around 15–25 min | median 20.5 min; range 5.2–36.1; 7/20 seeds none within 40 min |
| no 60 s without new fossil / fusion / upgrade (first 20 min) | worst gap on any seed 11.0 s |

**Deviations from the concept, and why.**
- Topsoil holds one *prized* fossil (1 in 1,000) so its set takes minutes, not seconds; legendary
  and rarer start in the Ice Age. Topsoil has no "1 in 2" (the Ice Age, Cretaceous and Deep Sea do).
- Odds are exact divisors of 12,000,000, hence a few non-round values (1 in 16, 64).
- A tap breaks at most one block (overkill is lost); otherwise late power makes rolls unbounded.
- Fusion stops at gold; gold copies keep counting.
- "Double an offline haul" doubles the haul's dust, not its fossils (a fossil copy is a roll).
- The fourth set bonus (Deep Sea) is power ×2; the concept listed only luck, auto-dig, offline cap.
- The 1-in-10,000+ reveal pauses the sim while it plays, so the combo does not drain while you watch.
- No result screen: the game is continuous, so the smoke test ends with a reload-and-compare
  instead of reaching a result scene (core's rule 3 assumes rounds).
- Museum card labels are 24–28 px (below core's 34 px guideline) to fit 12 cards per layer;
  the tap-for-detail view repeats everything at 30–56 px.

**Unresolved**: in this headless renderer full-screen dimming overlays (e.g. alpha 0.93) come out
visibly lighter than their alpha; text that must be read over an overlay therefore sits on an
opaque panel. Not checked on a real device.

**Candidates for core** (built locally): a checked `at(arr, i)` accessor for
`noUncheckedIndexedAccess`; Turkish locative suffix + grouped/short number formatting
(`src/sim/format.ts`); a session save cadence (throttle + flush on pagehide/pause); an invisible
≥ 88 px `hitZone`. **Finding for core**: Phaser clamps delta to 16.7 ms while the window is
unfocused, which is always true in headless Chromium, so on a loaded machine game time in the
smoke test runs several times slower than wall time.
