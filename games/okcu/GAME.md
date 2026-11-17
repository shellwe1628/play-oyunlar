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
  archer idles on its ledge, the wave-1 archer already stands on its ledge, the logo,
  "Pull back & let go!" and a looping ghost-thumb drag hint sit in open sky. The first drag
  anywhere fires and starts wave 1; the title fades out and the HUD (health bar, wave, coins,
  pause) fades in. Upgrades / Daily / mute are small pills at the top of the title only.
- **Aiming**: drag anywhere (not on a button). Pull vector = opposite of the shot; length
  30 px (dead zone) → 300 px logical maps to power 0 → 1. Releasing inside the dead zone
  cancels with a soft click (no dud arrow). Dotted arc (15 dots × 0.032 s, ×1.6 per Eagle Eye)
  from the real launch point every frame; a rubber band under the thumb coloured by power.
  Only the first pointer aims; a second finger is ignored; pointer-up-outside, game-out,
  window blur, `pointercancel` and `touchcancel` all cancel the draw. A release up to 0.3 s
  before the arrow is nocked is buffered and fires when ready.
- **Sim** (`src/sim/`, pure, fixed 1/120 s tick): Verlet bodies (`body.ts`: points, sticks,
  min/max distance joint limits, PD "muscles" toward a pose, pins, circle-vs-box ledges with
  friction/bounce), the 11-point archer + part map + pose (`ragdoll.ts`), exact ballistic
  arrows and swept capsule hit tests (`arrow.ts`: ternary search of a convex distance, so no
  tunnelling at any speed), damage table (`combat.ts`), cards (`cards.ts`), permanent
  upgrades/cosmetics/save shape (`meta.ts`), wave director and difficulty curves
  (`waves.ts`), the whole game (`world.ts`: enemy brain, wave flow, apples, bombs, shields,
  knockouts, dangling, coins, revive) and the scripted players (`aimbot.ts`).
- **Enemies**: plain archer (purple hood), shield bearer (blue, steel cap, planted wooden
  shield: 3 hits or 2 heavy hits knock it away), jumper (green, headband, hops to a free
  ledge every 2.6–4.2 s), bomber (dark grey, orange goggles, lobs fused bombs that can be
  shot out of the air), armoured boss (red, ×1.45 size, gold breastplate and horned helmet,
  glowing eyes + pulsing ring mark the head as the weak spot, fires two arrows). Each type is
  introduced alone with a banner line. An enemy that is about to shoot shows a red "!".
- **Waves**: three rotating 4-ledge layouts + a boss arena, sky palette changes every five
  waves (day, sunset, dusk, night, mint dawn). Clear → "Wave cleared!" + coin burst →
  three cards slam in → tap one → the next archers drop in from the sky.
- **Feel**: string creak ticks while drawing (pitch rises with power), snap + 18 px camera
  push on release, whistle, thunk + white impact ring + splinters + damage number + body
  flash, the body whips around the hit point (impulse to nearby points, muscles drop to 6 %
  and recover at 160 %/s), 40–70 ms hit-stop on body hits; headshot: 0.22 s of 18 % slow
  motion, zoom ×1.16 toward the head, "ping", "HEADSHOT!". Knockout: boing, whole-body kick
  + hop so they tumble/flop off or dangle by a hand from a ledge corner (1.4–2.4 s), arrows
  stay stuck (also in you, max 10 per body), poof into tinted feathers after 2.4 s, coins
  arc to the counter with rising ticks. Getting hit: red vignette, shake, heavy haptic,
  "-28". Haptics on release (light), hits (medium/heavy), knockouts (success), death (error).
- **Death** → 1.7 s slow flop → result screen (wave reached, best wave, coins, knockouts and
  headshots) → **Play again** goes straight back to the title-as-first-shot (no logo).
  Result also has Upgrades, Revive (rewarded, once per run, half health), Double coins
  (rewarded) and a home icon. Interstitial: at most every second finished run, on Play again.
- **Shop** (`ShopScene.ts`): five permanent upgrades and six cosmetics (hat + scarf colour).
- **Daily run**: Daily pill on the title; seed `hashSeed('okcu-daily-YYYY-MM-DD')`, best per day saved.
- Strings: Turkish and English for everything (`src/strings.ts`). Sounds: 23 synthesized
  presets (`src/sfx.ts`). Art: all code-drawn (`src/scenes/art.ts`, `icons.ts`, `textures.ts`).

### Deviations from the concept (and why)

- **The player is never knocked out by one headshot** (head = 45 damage). An instant loss
  from one enemy arrow felt unfair in balance runs; "enemy arrows do the same to you" holds
  for arms (aim wobble 3 s) and legs (stagger) and the head is the biggest hit.
- **Helmeted veterans from wave 14** (chance +20 %/wave): their head hit is 1.6× a body hit
  instead of a knockout. Without it a careful player with multishot one-shot everything and
  runs never ended (a scripted careful run went past wave 240).
- **Enemy health, damage and tempo scale hard** (health ×(1+0.6(w−1)), ×1.12^(w−10) after
  wave 10; damage ×1.09^(w−1); draws down to 0.5 s; first-draw grace 0.8 s → 0 by wave 17).
  Needed for the balance targets and to end runaway builds.
- **Card caps**: heavy 5, double 2, split 2, shield 2, vampire 3 (others as listed below);
  when every card is maxed the run skips the pick and goes straight on.
- **Arm hits make the player's shots wobble** (±0.07 rad sine sway, also shown by the arc
  preview) rather than spoiling a single shot.
- **The second result button is Upgrades, not Menu**; the title is a home icon. "Menu" is
  rarely wanted in a one-tap-retry game and five buttons did not fit.
- **"New best!" is not shown for a run that ends on wave 1.**
- **Apple magnet** makes apples bigger targets (+110 % hit radius) and heal more (+60 %)
  instead of pulling them toward the player (simpler to read).
- **Test-hook extras** beyond GAME.md: `reroll`, `extra`, `pause`, `shop`, `daily`,
  `perf-reset` and `timescale` (slows game time for frame captures; never used by the gate).

### Tuning numbers

| What | Value |
|---|---|
| Sim tick | 1/120 s, Verlet, 6 constraint iterations, damping 0.996/tick |
| Arrow gravity | 1500 px/s² (ragdoll gravity 1900 px/s²) |
| Player arrow speed | 620 px/s (power 0) → 1750 px/s (power 1); reload 0.5 s (×0.72 per Quick Draw) |
| Enemy arrow speed | archer 1050, boss 1180, bomb 780 px/s (×1.12/1.25/1.4 if the arc is blocked, then high arc) |
| Archer size | ×1.25 (boss ×1.81); head radius 26, torso 17, limbs 7–8 (× size) |
| Damage to enemies | head 50 + knockout (boss: ×2.6 weak spot, no knockout), body 40, arm 24 (+0.05 rad aim error), leg 24 (+0.45 s stagger, shove 20 px × impulse; off the edge = fall knockout) |
| Boss armour | head(weak) ×2.6, body ×0.2, limbs ×0.18 |
| Damage to the player | head 45, body 28, arm 18 (+3 s wobble), leg 18; × enemyDamageMul = 1.09^(wave−1); bomb 26 × same within 85 px |
| Enemy health | archer 40, shield 45, jumper 40, bomber 45, × (1 + 0.6(w−1)) × 1.12^max(0, w−10); boss 300 + 160 per later boss |
| Enemy aim error (σ) | angle 0.02 + 0.2·0.72^(w−1) rad (w1 0.22, w5 0.074, w10 0.028), speed 0.015 + 0.06·0.8^(w−1) |
| Enemy timing | draw max(0.5, 1.2 − 0.05(w−1)) s, cooldown max(0.6, 1.4 − 0.07(w−1)) + 0–0.6 s; first draw after max(0, 0.8 − 0.05(w−1)) s + i × 0.6·clamp((20−w)/12) |
| Wave sizes | 1: archer · 2: 2 archers · 3: shield · 4: jumper · 5: boss · 6: bomber · then min(4, 2 + ⌊(w−6)/2⌋) mixed; boss every 5th (+escorts from wave 15) |
| Player | 100 health (+15 per upgrade level), +12 heal per cleared wave, apples every 9–14 s heal 25 |
| Cards | heavy ×1.3 dmg ×1.35 shove (max 5) · double +1 volley 0.12 s later (max 2) · split +2 arrows ±0.065 rad (max 2) · fire 8+6n dps for 2.5+0.5n s (max 4) · bounce +1 (max 3) · pierce +1 (max 3) · quick reload ×0.72 (max 4) · vitality +25 max hp (max 6) · magnet radius +110 %, heal +60 % (max 2) · bubble 1 block per wave (max 2) · eagle eye arc +60 % (max 2) · snack hits +3 hp per hit (max 3) |
| Permanent upgrades | cost = round(base × growth^level): health 25 × 1.55^L (max 8), damage +10 % 30 × 1.6^L (max 8), coins +20 % 35 × 1.6^L (max 6), second reroll 60 (once), starting card 90 (once) |
| Coins | knockout 3 + ⌊w/2⌋ (+2 headshot, +25 boss); wave clear 2 + w; × coin upgrade |
| Cosmetics | classic (0), beanie (best wave 5), feather cap (10), top hat (15), horned helm (20), crown (25) |

### Measured balance (30 seeds each, `tests/unit/world.test.ts` asserts it)

- **Careless** (σ 0.08 rad aim, ±25 % launch-speed error, aims at chests, a shot every
  0.6 s after reload, takes the first card offered): clears wave 1 in 30/30 runs; wave
  reached median **5**, mean 6.6, quartiles 5–8, range 3–12; 18/30 runs end at wave ≤ 5
  (mostly the first boss). First knockout within 3 shots in 30/30 (mostly shot 1–2).
- **Careful** (σ 0.012 rad, ±2 % speed, solves the arc with a lofted shot at the crown of
  the head, same pace, prefers heavy/vitality/quick/bubble/double…): median **11**, mean
  10.8, quartiles 9–12, range 8–16. First knockout on shot 1 in 30/30.
- Wave-1 enemy hit rate on a player who stands still is between 15 % and 75 % (asserted);
  it rises by wave 12.
