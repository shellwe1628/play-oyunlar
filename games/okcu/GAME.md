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
