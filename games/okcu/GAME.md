# Noodle Archers (TR: Sallanan Okçular) — concept

Slug `okcu` · portrait 720×1280 · genre: physics / ragdoll action with upgrades

## Why this game exists

The owner played the first batch on a phone: the two slow, thinking-heavy games were
"very bad", the fast tapping one was fine. They asked for games in the style of
CrazyGames' hits and picked physics/ragdoll action and upgrade games. Ragdoll archery
duels are one of the site's biggest single-player genres (the leading title has
2.7M votes at 9.1). This is an original game in that genre: its own characters,
arenas, enemies and upgrade tree.

**The bar: fun inside the first ten seconds.** The first arrow must be in the air
within three seconds of opening the game and the first enemy should flop over within
about ten. If hitting something does not feel great, the build has failed, whatever
the tests say.

## Pitch

You are a wobbly noodle-limbed archer on a ledge. Drag back, let fly, and knock the
rival archers off their perches before their arrows find you. Every wave you pick a
new trick.

## Core loop (a run lasts 3–6 minutes)

- **Aim and shoot:** drag anywhere on the screen to pull the string — the drag
  vector sets angle and power, a dotted arc shows the first part of the flight —
  and release to fire. No buttons. A shot takes well under a second to make.
- **Enemies** are ragdoll archers standing on floating ledges at different heights
  and distances. They draw, wobble, and shoot back with an aiming error that shrinks
  as waves go on. Arrows are real projectiles: they arc, stick where they land, and
  shove what they hit.
- **Where you hit matters:** head = knockout with a beat of slow motion; body =
  solid damage; arm = that archer's aim gets worse; leg = they stagger and may fall
  off the ledge, which also counts. Enemy arrows do the same to you. Your health is
  a short bar; red apples drift across the arena and heal when shot.
- **Waves:** clear every archer to end the wave. Then pick one of three upgrade
  cards. Every fifth wave is a boss: a big armoured archer with a weak spot.
- **Death** ends the run: result screen with wave reached, coins earned, best wave.
  One tap starts the next run.

## Upgrades (the reason to play again)

- **In-run cards** (lost at the end of the run), drawn three at a time: heavier
  arrows, double shot, split shot, fire arrow (burns for a few seconds), bouncing
  arrow, piercing arrow, quicker draw, bigger health bar, apple magnet, shield that
  eats one hit per wave. Cards stack and combine — a late run should look and feel
  wildly stronger than the first wave.
- **Permanent upgrades** bought with coins between runs: starting health, base
  damage, coin gain, a second card reroll, starting with one random card. Costs rise
  on a curve so there is always one purchase within reach after a run or two.
- **Cosmetics** unlocked by milestones (best wave 5, 10, 15…): hats and scarf colours.

## Content for the vertical slice

- One arena with three ledge layouts that rotate, a parallax sky that changes colour
  every five waves.
- Enemy types: plain archer, shielded archer (shield must be knocked away or shot
  around), jumper (hops between ledges), bomber (lobs slow explosive arrows you can
  shoot out of the air), and the armoured boss. Each is introduced alone.
- Twelve in-run cards, five permanent upgrades, six cosmetics.
- Endless waves with a difficulty curve; a daily run seeded by the calendar date.

## Feel (this is most of the game)

- Bright, chunky, friendly: sky-blue to sunset gradients, fat outlines, round-headed
  archers with noodle arms and legs and a coloured scarf that trails. Not stick
  figures, and nothing gory — defeated archers flop, spin and poof into feathers.
- The shot: string creak while drawing, a snap and a short camera push on release,
  the arrow whistles, a meaty thunk and a flash on impact, the target's body whips
  around the hit point. Headshot: 150–250 ms of slow motion, zoom, a bright "ping".
- Ragdolls must be funny: bodies dangle from a ledge by one arm, tumble, bounce.
  Arrows stay stuck in whatever they hit, including you.
- Coins burst out and fly to the counter. Card picks slam onto the screen with weight.
- Haptics through the platform interface on release, hit taken and knockout.

## Flow

App open → title with the archer idling on a ledge and "drag to shoot" → the first
drag anywhere fires and starts wave 1 (the title IS the first shot). Upgrades and
cosmetics are one tap from the result screen and the title, never in the way.

## Sim (pure, in `src/sim/`)

Fixed-step and deterministic. No physics library: ragdolls are point masses joined
by distance constraints (Verlet integration) with angle limits, so the rules stay in
plain TypeScript and can be unit-tested and replayed.
`Ragdoll` (points, sticks, part map: head, torso, arms, legs), ledge and ground
collision, `Arrow` (ballistic flight, segment-versus-part hit test, sticking,
impulse), damage table, status effects, enemy brain (draw time, aim solve with error
by wave), wave director, card effects, permanent upgrades, coins.

Unit tests must cover: ballistic flight against the closed-form arc; hit detection
per body part at several angles and speeds, including fast arrows not tunnelling
through thin limbs; the damage and effect table (head, body, arm, leg); ragdolls stay
stable — bounded energy and no constraint blow-up over tens of thousands of steps,
including when hit hard and when resting on a ledge edge; falling off a ledge counts
as a knockout; every card's effect and its stacking; permanent upgrade costs and
effects; enemy accuracy by wave; determinism; and balance by scripted players over
many seeds: a careless player (aims roughly, 25 % power error) clears wave 1 nearly
always and reaches about wave 3–5; a careful player (solves the arc with small
error) reaches about wave 10–15; the first knockout of a fresh run happens within
the first three shots for both.

## Test hook

`state()`: phase, wave, health, coins, enemies (id, type, alive, position), cards
held, best wave. `act('shoot', {angle, power})`, `act('aimbot', {error})` (the
scripted player), `act('pick-card', index)`, `act('advance', seconds)`.
The smoke test clears wave 1 with the aimbot, picks a card, then stops shooting until
the run ends, and checks the result screen and saved coins. A separate test plays with
real touch drags only: it must knock out at least one enemy by dragging and
releasing, and pick a card by tapping it.

## Monetisation hooks (interface only, no provider)

Rewarded: revive once per run with half health; a fourth card choice; double coins on
the result screen. Interstitial: at most once every two finished runs, never
mid-run.

## Out of scope for the slice

Multiplayer, more arenas, a story, weapon types other than the bow.

---

## Built (vertical slice)

### What exists

- **One scene is the title and the game** (`src/scenes/GameScene.ts`). App open → the player
  archer idles on its ledge, the wave-1 archer already stands on its ledge (its ledge, height
  and the run's layout rotation are seeded per run, so the opening shot is never the same
  rote shot), the logo, "Pull back & let go!" and a looping ghost-thumb drag hint sit in open
  sky. The first drag anywhere fires and starts wave 1; the title fades out and the HUD
  (health bar, bubble pips, wave, coins, pause) fades in. A tap or too-short drag on the title
  makes the archer twitch, pulses the hint and shows "Drag, don't tap!" at the finger.
- **Aiming**: drag anywhere (not on a button). Pull vector = opposite of the shot; length
  30 px (dead zone) → 300 px logical maps to power 0 → 1. Releasing inside the dead zone
  cancels with a soft click (no dud arrow). Dotted arc (15 dots × 0.032 s, ×1.6 per Eagle Eye)
  from the real launch point every frame; a rubber band under the thumb coloured by power.
  Only the first pointer aims; a second finger is ignored; pointer-up-outside, game-out,
  window blur, `pointercancel` and `touchcancel` all cancel the draw. A release up to 0.3 s
  before the arrow is nocked is buffered; any release that cannot fire un-draws the bow.
- **Events** (`world.ts`): the sim queues events until the scene takes them with
  `takeEvents` (exactly once, double-buffered, no per-frame allocation). Input handled before
  a step (a shot) therefore always plays its feedback; the test state counts handled shot
  and wave-start events (`shotFx`, `waveFx`) and the touch test asserts them.
- **Sim** (`src/sim/`, pure, fixed 1/120 s tick): Verlet bodies (`body.ts`: points, sticks,
  min/max distance joint limits, PD "muscles" toward a pose, pins, circle-vs-box ledges; one
  contact response per tick with friction and restitution from the approach speed, slow
  contacts do not bounce so bodies come to rest), the 11-point archer + part map + pose
  (`ragdoll.ts`), exact ballistic arrows and swept capsule hit tests (`arrow.ts`), damage
  table (`combat.ts`), cards (`cards.ts`), permanent upgrades, run banking, cosmetics and save
  shape (`meta.ts`), wave director and difficulty curves (`waves.ts`), the whole game
  (`world.ts`) and three scripted players (`aimbot.ts`).
- **Enemies**: plain archer (purple hood), shield bearer (blue, steel cap, planted wooden
  shield: 2 arrows, or 1 heavy arrow, knock it away), jumper (green, headband, hops to a free
  ledge every 2.6–4.2 s), bomber (dark grey, goggles, fused bombs you can shoot out of the
  air), armoured boss (red, ×1.45 size, gold plate, horned helmet, glowing head = weak spot,
  fans three arrows). From wave 14, steel-capped veterans whose head hit is not a knockout.
  Each type is introduced alone with a banner line; a red "!" shows an archer about to shoot.
  A wave's first volley from each archer never lands a headshot (it counts as a body hit).
- **Waves**: three rotating 4-ledge layouts + a boss arena, sky palette changes every five
  waves; small pale birds and two far-off balloons drift through the upper sky. Clear →
  heal, "Wave cleared!" + coin burst → three cards slam in → tap one → archers drop in.
- **Feel**: string creak ticks while drawing; on release a snap, a whistle, a light haptic,
  the camera pushes along the shot (world kicks back 26 px + 3.5 % zoom punch, springs home),
  a forward muzzle puff and string sparks. Thunk + white ring + splinters + body flash, the
  body whips around the hit point, 40–70 ms hit-stop. Headshot: 0.25 s at 12 % speed, zoom
  ×1.26 on the head held through the slow motion, white screen flash, gold ring, "ping",
  "HEADSHOT!". Damage numbers merge per archer within 0.7 s (one growing number instead of a
  pile) and a hit word shows once per archer per window, above the number. Knockout: boing,
  whole-body kick + hop, tumbles/flops or dangles by a hand, poof into feathers, coins arc to
  the counter. The Bubble card is a visible soap bubble around the archer while a block is
  left. Getting hit: soft red vignette (texture recipe), shake, heavy haptic.
- **Progress is banked as the run goes** (`meta.ts`: `newBank`, `bankStart`, `bankProgress`,
  `bankDaily`, `runOutcome`): the run is counted when its first arrow flies; coins (as a
  delta from what was already banked) and the best wave are written at every wave clear, when
  the pause menu opens, when the app is hidden and when the scene shuts down (quit), and at
  death. The bank travels with the run, so a revive continues it without double counting.
- **Death** → 1.7 s slow flop → result (wave reached, best, coins, "Knockouts n · Headshots
  n", "Daily run · date" for a daily) → **Play again** goes straight back to the
  title-as-first-shot. Result also has Upgrades, Revive (rewarded, once per run, half health),
  Double coins (rewarded) and a home icon. While a rewarded ad is pending every button is
  disabled, and a late answer after the screen was left or restarted grants nothing.
- **Shop**: five upgrades (level bar, affordable prices bright, too dear dimmed, maxed shows a
  green "Max") and six cosmetics in two rows.
- **Daily run**: the Daily pill switches to a seeded run (`okcu-daily-YYYY-MM-DD`, local date).
  **Decision: the daily ignores permanent upgrades**, so everyone gets the same run; the title
  says so ("Same archers for everyone today · no upgrades") and the pill reads "Normal" to
  switch back. Best per day saved.
- **Save**: version 2. v1 → v2 migration merges upgrades over defaults; validation no longer
  rejects a save that lacks an upgrade id, and missing ids are filled on load, so adding an
  upgrade never resets coins or best wave.

### Deviations from the concept (and why)

- **The player is never knocked out by one headshot** (head = 45 × wave multiplier).
- **Helmeted veterans from wave 14** (+20 %/wave): a head hit does 1.6 × a body hit (64 at
  base) instead of a knockout. This rule was dead code in the first build (`e.helmet` was
  never passed); it is wired now and covered by a world-level test, and the balance below
  is measured with it on.
- **Steep late scaling** (health ×(1+0.6(w−1)) and ×1.12^(w−10) after wave 10; damage
  ×1.11^(w−1)) to end runaway builds; **a soft opening** (enemy damage 45 % on wave 1 rising
  to full by wave 5, wide early aim error, long first-draw grace and stagger, the
  no-headshot first volley) so a clumsy first-timer gets through waves 1–3.
- **Card caps**: heavy 5, double 2, split 2, bubble 2, snack hits 3; all maxed → no pick.
- **Shield**: 2 hits, not 3 (the shield wave was a wall for body-aimers).
- **Arm hits make the player's shots wobble**; **the second result button is Upgrades**;
  **no "New best!" badge for a run that ends on wave 1**; **Apple magnet** = bigger, juicier
  apples rather than pulling them.
- **Test-hook extras**: `reroll`, `extra`, `pause`, `shop`, `daily`, `perf-reset`,
  `timescale` (slows game time and the real-time effects for frame captures; never used by
  the gate). `jumpToWave` exists in the sim for tests only.

### Tuning numbers

| What | Value |
|---|---|
| Sim tick | 1/120 s, Verlet, 6 constraint iterations, damping 0.996/tick, friction 0.35, restitution 0.25 (none below 1.5 px/tick) |
| Arrow gravity | 1500 px/s² (ragdoll gravity 1900 px/s²); one `advance` covers at most 0.25 s |
| Player arrow speed | 620 → 1750 px/s; reload 0.5 s (×0.72 per Quick Draw) |
| Enemy arrow speed | archer 1050, boss 1180 (3-arrow fan ±0.05 rad), bomb 780 px/s (faster or high arc if blocked) |
| Archer size | ×1.25 (boss ×1.81); head radius 26, torso 17, limbs 7–8 (× size) |
| Damage to enemies | head 50 + knockout (veteran: 64, no knockout; boss head ×2.6 = 130), body 40, arm 24 (+0.05 rad aim error), leg 24 (+0.45 s stagger, 20 px shove; off the edge = fall knockout) |
| Boss armour | head ×2.6, body ×0.15, limbs ×0.12 |
| Damage to the player | head 45, body 28, arm 18 (+3 s wobble), leg 18; × min(1, 0.45 + 0.11(w−1)) × 1.11^(w−1) (w1 0.45, w2 0.62, w3 0.83, w5 1.35, w10 2.6); bomb 26 × same within 85 px |
| Enemy health | archer 40, shield 45, jumper 40, bomber 45, × (1 + 0.6(w−1)) × 1.12^max(0, w−10); boss 380 + 160 per later boss |
| Enemy aim error (σ) | angle 0.02 + 0.32·0.7^(w−1) rad (w1 0.34, w2 0.24, w3 0.18, w5 0.097, w10 0.033), speed 0.015 + 0.06·0.8^(w−1) |
| Enemy timing | draw max(0.5, 1.6 − 0.08(w−1)) s, cooldown max(0.6, 1.5 − 0.07(w−1)) + 0–0.6 s; first draw after max(0, 1.6 − 0.12(w−1)) s + i × 1.4·clamp((20−w)/16) |
| Wave sizes | 1: archer · 2: 2 archers · 3: shield · 4: jumper · 5: boss · 6: bomber · then min(4, 2 + ⌊(w−6)/2⌋) mixed; boss every 5th (+escorts from wave 15) |
| Player | 100 health (+15 per upgrade level), +18 heal per cleared wave, apples every 9–14 s heal 25 |
| Cards | heavy ×1.3 dmg ×1.35 shove (max 5) · double +1 volley (max 2) · split +2 arrows ±0.065 rad (max 2) · fire 8+6n dps for 2.5+0.5n s (max 4) · bounce +1 (max 3) · pierce +1 (max 3) · quick ×0.72 reload (max 4) · vitality +25 (max 6) · magnet radius ×2.1, heal ×1.6 (max 2) · bubble 1 block/wave (max 2) · eagle eye arc ×1.6 (max 2) · snack hits +3 hp/hit (max 3) |
| Permanent upgrades | health 25 × 1.55^L (max 8, +15 each), damage 30 × 1.6^L (max 8, +10 %), coins 35 × 1.6^L (max 6, +20 %), second reroll 60, starting card 90 |
| Coins | knockout 3 + ⌊w/2⌋ (+2 headshot, +25 boss); wave clear 2 + w; × coin upgrade |
| Cosmetics | classic 0, beanie 5, feather cap 10, top hat 15, horned helm 20, crown 25 (best wave) |

### Measured balance (30 seeds each, asserted in `tests/unit/world.test.ts`)

| Scripted player | Pace and aim | Clears wave 1 | Clears wave 3 | Wave reached: median (mean, quartiles, range) | First knockout ≤ 3 shots |
|---|---|---|---|---|---|
| Slow human | a shot every 2.5–3 s, σ 0.08 rad, ±15 % speed, chests, no dodging | 30/30 | 28/30 | **5** (5.1, 5–5, 3–9) | 29/30 |
| Careless | a shot every ~1.1 s, σ 0.08 rad, ±25 % speed, chests | 30/30 | 30/30 | **5** (7.1, 5–9, 5–12) | 28/30 |
| Careful | a shot every ~1.1 s, σ 0.012 rad, ±2 % speed, lofted crown shots, picks good cards | 30/30 | 30/30 | **13** (11.8, 11–13, 8–15) | 29/30 |

The first boss (wave 5) is where most slow and careless runs end; no scripted player dies on
wave 2 any more (the slow human's lowest is wave 3, in 2 of 30 runs).
