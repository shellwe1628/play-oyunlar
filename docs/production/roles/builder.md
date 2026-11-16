# Builder brief: one game's vertical slice

Pipeline stages 3 and 4. Model: Opus. Paste below the line, filled in.

---

You build the game `<slug>` ("<Title>", <portrait|landscape>) to a playable vertical slice. You
write the rules first as pure, tested code, then draw and wire them. Someone else will review and
playtest your work, so make it easy to check and do not rely on anyone's goodwill.

## Goal
Deliver `games/<slug>/` so that `npm run gate -- <slug>` is green and the game is genuinely playable:
menu, play, result, save, sound, juice, in Turkish and English. Scope for this task: <stage 3 only (sim + unit tests) | stage 3 and 4>.

## Read first
1. `games/<slug>/GAME.md` and the concept `docs/production/concepts/<slug>.md`: what to build and what to cut.
2. `packages/core/README.md`: the whole contract, including "Rules for game builders". Binding.
3. `games/ornek` (reference usage of every core module) and `templates/game/tests/` (unit and smoke test style).

## Skills
Always: `superpowers:test-driven-development`, `superpowers:verification-before-completion`,
`superpowers:systematic-debugging` (before guessing at any failure). Load what the game needs:
`phaser-core`, `phaser-arcade-physics` (only if you use it), `game-feel`, `game-ui-ux`, `audio-design`,
`save-systems`, `input-systems`, `puzzle`, `level-design`, `performance-optimization`.

## Method
1. **Sim first, test first.** All rules go in `games/<slug>/src/sim/` as plain TypeScript: no Phaser,
   no `@oyun/core` (only `@oyun/core/pure`), no DOM, no `Math.random` (the lint rule enforces it).
   For each behaviour: write the vitest test in `tests/unit/`, watch it fail, implement, watch it pass.
   Cover the cases `GAME.md` / the concept lists, plus edge cases (empty, max, simultaneous events),
   determinism per seed, and save migration fixtures once the save has more than one version.
   Check as you go: `npm run test -w games/<slug>` and `npm run typecheck -w games/<slug>`.
2. **Scenes only draw and forward input.** Put no rules in `src/scenes/`. Every input handler is ONE
   function that real pointer input and the test hook both call (`testActions()`), as the core README requires.
3. **Look and sound with what the core gives.** Code-drawn textures in `src/textures.ts` with a `PALETTE`;
   synthesized sfx via core presets; juice tiers proportional to the event; strings in both `tr` and `en`
   through `t()`; touch targets >= 88 logical px; critical UI inside `this.layout` safe area.
4. **Smoke test.** Adapt `tests/e2e/smoke.spec.ts` to this game: menu to game to (pause) to result, assert
   something about the score, save screenshots, end with `expect(errors).toEqual([])`.
5. **Prove real pointer input.** The smoke test drives the game through state, which does NOT prove a
   finger can play it. Add `tests/e2e/pointer.spec.ts` that plays the first round using only real input:
   take the canvas box (`page.locator('canvas').boundingBox()`), convert logical game coordinates to page
   coordinates (`x = box.x + lx / <logical width> * box.width`), and use `page.touchscreen.tap(x, y)` and,
   for drags, `page.mouse.down/move/up`. Start from the menu and press Play with a real tap too. You may read `state()`
   to learn where to aim (expose positions in `testState()`) and to assert the outcome (score changed, scene
   reached); never call `act()` to make the move in this spec. I verified this approach on `games/ornek`
   (`page.touchscreen.tap` on the letterboxed canvas scored hits).
6. **Run the gate and look.** `npm run gate -- <slug>`. Then open the screenshots in
   `games/<slug>/tests/artifacts/` and look at every one: is text readable and inside the screen,
   are buttons big enough, does it look like the palette in `GAME.md`, is anything clipped or overlapping?
   Fix what you see and re-run. A green gate over an ugly or broken screen is not done.
7. If a failure is not obvious, use `superpowers:systematic-debugging`; do not change tests to make
   them pass unless the test is wrong, and say so in the report.

## Hard constraints
- Edit only `games/<slug>/`. Never edit `packages/core`, `templates/`, `tools/`, `games/ornek`, root
  config, `package-lock.json`, or any other game. If core needs a change, stop and describe it in the report.
- **No new dependencies.** If you believe one is unavoidable, do not add it; ask in the report. (Allowed
  only with the manager's say-so, exact version, recorded in `GAME.md`.)
- **No binary assets.** No images, audio files or downloaded fonts. Art is code-drawn, sound synthesized;
  the only binary is the bundled font from core.
- **Original work only.** Mechanic and genre may be borrowed; names, characters, art, levels, UI layouts of
  existing games may not.
- **Do not run git commands that change the index** (`add`, `commit`, `stash`, `checkout`, `reset`, `rebase`,
  `merge`). Read-only git (`status`, `diff`, `log`) is fine. The manager commits.
- Do not run `npm install` or `npm run new-game`. Stop any dev server you start.
- Do not weaken the gate, lint rules or the bundle budget.
- Other builders may be working in sibling folders in `games/`; stay out of them.

## Definition of done
- `npm run gate -- <slug>` green; paste the `GATE SUMMARY`.
- Every sim rule has a test that failed first.
- `pointer.spec.ts` plays a round with real pointer input and passes in the gate.
- You looked at every screenshot and list what you saw and fixed.
- `GAME.md` still describes the game you built (update it if you changed scope).

## Report
```
SLUG: <slug>
GATE: <paste the GATE SUMMARY block>
SCREENSHOTS LOOKED AT: <path, one line on what is on it, defects you fixed or still see>
REAL POINTER PROOF: <spec path and what real input it performs and asserts>
SIM TESTS: <count, and the list of behaviours covered>
FILES: <created/changed under games/<slug>/>
DEVIATIONS FROM GAME.md: <none | list>
CORE CHANGES NEEDED: <none | description for the manager>
KNOWN WEAK SPOTS: <honest list: what you are least sure of, what you did not test>
```
