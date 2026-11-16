# Ink Tide (TR: Mürekkep Seli) — concept

Slug `murekkep` · portrait 720×1280 · score 80/100 · mechanic: real-time border-push territory war against bots

## Pitch

Rival ink colonies bleed across a sheet of paper. Choose how much of your ink to
commit, tap a neighbour, and watch your border creep forward cell by cell. Soak the
page before the others do.

## Why this game

Browser demand is large (one 2025 title at 9.7 with 342k votes; the genre's
single-player form has only one small representative). On mobile the direct
equivalents are small or rated ≤ 3.9. The neighbouring "send troops between nodes"
genre IS saturated, so this game must not look or feel like nodes and arrows: there
are no nodes, only continuous borders that flow.

## Core loop (one match ≈ 2–4 minutes)

1. The map is a grid of cells (about 48×72) forming a paper landmass with gaps.
   Each colony starts as a small blot.
2. Every colony has an ink reserve. It grows each tick; growth depends on territory
   size and is fastest when the reserve is around half of its territory-based cap.
   Sitting at the cap wastes growth; spending everything leaves you defenceless.
3. Attack: set the commit slider (10–100 %, default 30 %), then tap any land that
   touches your border — blank paper or an enemy colony. That share of your reserve
   becomes a wave that advances along the shared border, cell by cell.
4. Each captured cell costs ink: blank paper is cheap, enemy cells cost according to
   the defender's ink density (reserve ÷ area), and the defender loses ink too.
   A wave stops when its ink runs out.
5. Win by holding 70 % of the land or being the last colony. Lose when you have no
   cells. A 2× speed toggle is available.

## Bots

Three personalities, combined with a difficulty level that changes reaction interval
and commit ratio:
- **Turtle** — takes blank paper only, keeps a high reserve, hits back hard when attacked.
- **Rusher** — attacks its weakest neighbour early and often.
- **Opportunist** — joins attacks on whoever is already losing ground or has low density.

Bots follow the same rules as the player; no cheating on ink.

## Content for the vertical slice

- Campaign of 8 seeded maps, rising from 2 bots on a small sheet to 5 bots on the
  full sheet. Three stars per map: win; win under a par time; win without ever
  dropping below half of your peak territory.
- Daily map: seeded by calendar date, best time of the day, day-streak counter.
- One power, unlocked after map 3, on a cooldown: **Blot** — tap to ink a small
  circle anywhere touching your territory.

## Feel

- Paper background generated in code (subtle fibre noise, off-white). Colony colours:
  indigo (player), vermilion, moss, ochre, plum, teal.
- Borders bleed: territory edges are soft and slightly irregular, like ink soaking
  into paper; freshly captured cells are darker for a moment and settle.
- Waves are visible as a darker advancing front. A big capture gives a soft "soak"
  sound and a small camera pulse; elimination of a colony gives a splash and a
  desaturating wash over its former land.
- HUD: your reserve as a bar with the cap and the "sweet spot" marked, land share of
  every colony as a stacked strip, the commit slider within thumb reach at the bottom.

## Sim (pure, in `src/sim/`)

`generateMap(seed, size, colonies)`, `MatchSim(map, seed, bots)` with `tick()` at a
fixed 10 Hz, `attack(colony, targetCell, percent)`, wave propagation over the border
frontier, growth, elimination, win/lose, bot decision step. Deterministic per seed.
Rendering must redraw only changed cells.

Unit tests must cover: generated land is connected and every start has room; growth
curve shape (peak near half cap, zero at cap); an attack never spends more than the
committed ink; capture cost rules; a wave stops when out of ink; elimination and win
conditions; same seed → same match; over many seeded matches each bot personality
both wins some and loses some against the others (no dominant or dead bot).

## Test hook

`state()` returns tick, land share per colony, player reserve and cap, phase, map id.
`act('attack', {cell, percent})`, `act('auto-play', {ticks})` (a simple built-in
player policy so the smoke test can finish a match), `act('fast-forward', ticks)`.

## Monetisation hooks (interface only, no provider)

Rewarded: one extra Blot charge per match. Interstitial: between matches only.

## Out of scope for the slice

Online play, alliances, map editor, more powers, real-world maps.
