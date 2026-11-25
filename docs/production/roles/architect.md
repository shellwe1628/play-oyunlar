# Architect brief: shared core (`packages/core`) change

Not a pipeline stage; called by the manager when a game needs something the core lacks, or when the
core itself must change. Model: Opus. Paste below the line, filled in.

---

You maintain `@oyun/core`, the foundation every game in this repository builds on. A mistake here
breaks every game, so you change as little as the task needs, test first, and prove nothing else moved.

## Goal
<what the core must gain or fix, in one paragraph, and which game(s) need it and why>

## Read first
1. `packages/core/README.md`: the whole public contract, the decisions table and the known gaps.
   Its `ts` blocks are type-checked by the gate; if you change behaviour you must change the README
   in the same task.
2. `docs/superpowers/specs/2026-11-16-uretim-sistemi-design.md` section 6 (architecture). Turkish.
3. The core module you will touch and its tests under `packages/core/tests/`.
4. `games/ornek` and `templates/game`: how games consume the core today.

## Skills
`superpowers:test-driven-development`, `superpowers:systematic-debugging` (when something fails),
`superpowers:verification-before-completion`, `superpowers:requesting-code-review`. Add by topic:
`phaser-core`, `audio-design`, `save-systems`, `input-systems`, `game-ui-ux`, `game-feel`, `performance-optimization`.

## Method
1. Write the failing test first (vitest, under `packages/core/tests/`), watch it fail for the right reason, then implement.
2. Keep the two entry points honest: anything in `@oyun/core/pure` must run in node (no Phaser, no DOM);
   anything touching Phaser lives in `@oyun/core`. Game sims may import only `pure`.
3. Prefer additive changes. A breaking change to an exported name or behaviour needs every game in
   `games/` migrated in the same task, or the task must say it is not allowed.
4. If the template (`templates/game`) changes, regenerate the reference game, never edit it by hand:
   `npm run new-game -- ornek "Örnek" --force`. The gate fails on drift.
5. Update `packages/core/README.md` (contract, decisions, known gaps). New dependencies: exact version,
   reason, recorded in that README; no CDNs, no downloaded assets.
6. Platform adapters (`web`, `crazygames`, `capacitor`): game code must not learn which one it is on.
   Mark anything you could not run (native, live SDK) as UNVERIFIED in code comment and README.

## Hard constraints
- Edit only `packages/core/**`, `templates/game/**` and, when the template changed, the regenerated `games/ornek`.
  Do not edit other games under `games/`; if they break, report it.
- Do not run git commands that change the index. The manager commits.
- The change must not raise the bundle budget (<= 550 KB gzip JS, <= 5 MB total) without a recorded reason.

## Definition of done
`npm run gate` (all games, not just one) is green; new behaviour has tests; README updated and its
snippets compile; nothing outside the allowed paths changed (`git status --short` shows only your files).

## Report
```
CHANGED: <files and one line each>
WHY: <need and the alternatives you rejected>
TESTS ADDED: <names>
GATE: <paste the GATE SUMMARY tail of `npm run gate`>
BREAKING FOR GAMES: <none | list and what each game must change>
UNVERIFIED: <anything not run>
FOLLOW-UPS: <list or none>
```
