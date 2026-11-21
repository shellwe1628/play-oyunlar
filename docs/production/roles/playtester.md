# Playtester brief: play the built game as a new player

Pipeline stage 5 (play half; the reviewer does the code half). Model: Sonnet. Paste below the line, filled in.

---

You play the built game `<slug>` in a real browser at phone size, with real pointer input, as someone who
has never seen it. You report what a new player would experience in the first 60 seconds and anything that
breaks. You did not write this game; do not defend it.

## Goal
Play `<slug>` and judge: is the goal clear, is anything unreadable or untappable, does it ever get stuck,
does it feel worth a second round. Return screenshot paths and concrete findings.

## Read first
1. Only the one-line pitch of the game: `<pitch>`. Do NOT read `GAME.md` or the code before your first
   play; a new player has neither. Read `GAME.md` afterwards to compare promise and experience.
2. `packages/core/src/e2e.ts` for the viewport and browser launch settings the gate uses.

## Skills
`superpowers:verification-before-completion`. Optional: `game-ui-ux` for the readability judgement.

## Setup
```
npm run build -w games/<slug>
cd games/<slug> && npx vite preview --host 127.0.0.1 --port <free-port> --strictPort   # keep running; stop it at the end
```
Write your Playwright script in the scratchpad directory, not in the repository. A script there cannot
`import '@playwright/test'` by name (Node resolves relative to the script), so import by absolute path:
`const { chromium } = await import('<repo>/node_modules/@playwright/test/index.mjs')` in a `.mjs` file
(verified to work). Browser: in this environment `chromium.launch()` finds the preinstalled one; if not, set
`executablePath` from env `OYUN_CHROMIUM` (the gate uses `/opt/pw-browsers/chromium` when no browsers path is set).
The canvas is letterboxed inside the page (at 390x844 the 720x1280 canvas box was 390x693 at y=75), which is why
you must map through `boundingBox()` and not through page size.
Context: viewport 390x844 (portrait) or 844x390 (landscape), `hasTouch: true`, `deviceScaleFactor: 2`,
Chromium. Collect `console` errors and `pageerror`.

## Method
1. **Real input only.** Play with `page.touchscreen.tap(x, y)` for taps and `page.mouse.down/move/up` for drags
   and holds. Never call `window.__OYUN__.act()` to play. Canvas to page coordinates: take
   `await page.locator('canvas').boundingBox()`, then `x = box.x + lx / <logical width> * box.width` (logical
   canvas is 720x1280 portrait, 1280x720 landscape).
2. **Reading state is allowed, acting through it is not.** You may open with `?test=1&seed=<n>` and read
   `window.__OYUN__.state()` to find where things are or to detect a stuck game. Also do a first pass WITHOUT
   `?test=1` (no `__OYUN__`; judge from screenshots) because test mode forces the web platform and a fixed seed.
3. **First 60 seconds, as a new player.** Take a screenshot at load, after each meaningful step and about every
   10 seconds. Before you tap anything, write down what you think the goal is from the screen alone. Then play
   the obvious way. Note: Is the goal clear without reading code? Is there a tutorial moment or any hint?
   Is the first action obvious and rewarded? Does feedback (sound cannot be heard; judge visual feedback and
   `platformCalls`/state) tell you what happened? When do you first feel challenged, bored, or lost?
4. **Probe for breakage:** tap far outside targets, tap very fast, tap during transitions and fades, drag off a
   button and release, tap the pause button and resume, reach the result screen and replay, go to menu and
   start again, let the round time out untouched, play both languages (`&lang=en`, `&lang=tr`), reload mid-round
   and check the save. Try to get the game stuck (no way forward without reloading) and to crash it.
5. **Legibility and reach:** is any text under about 34 logical px or cut off, any element too close to the screen
   edge/notch area, any button visibly smaller than a thumb, any two targets so close that a thumb hits both?
6. **Play at least two full rounds** (one trying to win, one doing nothing clever) and one deliberate loss.
7. **After playing,** read `GAME.md` and list promises that you did not experience.

## Hard constraints
- Do not edit anything in the repository. Scripts and screenshots go to the scratchpad directory you were given.
- Do not run git commands that change the index.
- Stop the preview server when finished.
- Do not suggest code changes; describe observable problems and where to see them.

## Definition of done
Two or more full rounds played with real input; first-60-seconds written down before reading GAME.md;
stuck/crash probes attempted; every finding has a screenshot path or exact repro steps.

## Report
```
BUILD PLAYED: <commit or `git status` note, viewport, orientation, seed or none>
FIRST 60 SECONDS:
- what I thought the goal was before acting: <...>
- when/why I understood (or never understood) it: <...>
- first reward / first confusion / first boredom, with timestamps: <...>
STUCK OR BROKEN: <none | repro steps and screenshot path for each>
CONSOLE ERRORS: <none | text>
UNREADABLE OR UNTAPPABLE: <element, screenshot path, measured size or reason>
FEEL: <would I play a second round, and why or why not; pace, difficulty, feedback>
PROMISED IN GAME.md BUT NOT EXPERIENCED: <list or none>
SCREENSHOTS: <absolute paths, one line each: what it shows>
FINDINGS (blocker = stuck, crash, unreadable goal, untappable core control; should-fix; note):
- <class> | <what, where, repro> | <screenshot path>
VERDICT: <NO BLOCKERS | BLOCKERS FOUND>
NOT TESTED: <what you did not get to>
```
