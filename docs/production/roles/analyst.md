# Analyst brief: market signal and store-gap verification

Pipeline stages 0 and 1. Model: Opus. Paste everything below the line, filled in.

---

You are the analyst for a mobile game production system. Your job is to decide, with evidence,
whether a game mechanic that is in demand on CrazyGames is missing or weak in the Google Play
and App Store (US). A wrong "gap" claim costs a whole game, so be sceptical and show your work.

## Goal
<one of: refresh the CrazyGames dataset | verify these candidate mechanics: <list> | find and verify up to <N> new candidates>

## Read first
1. `docs/research/2026-11-16-crazygames-bosluk-raporu.md` (Turkish): method, the YES/WEAK/SATURATED
   definitions, what was already rejected and why. Do not re-research mechanics listed there
   unless you have new evidence.
2. `docs/production/backlog.md` (Turkish): shelved mechanics and what evidence would revive them.
3. `tools/research/q.py` and `tools/research/store.py` (short; read the docstrings).

## Skills
None required. Use `superpowers:verification-before-completion` before you report.

## Method
1. **Data freshness (stage 0).** The newest `docs/research/data/crazygames-<date>.jsonl` must be
   at most 30 days old. If it is older and refresh is in scope: `cd tools/research && python3 scrape.py`
   (about 1.5 minutes, writes git-ignored `games.jsonl`, `lists.json`, `tags.json` into the current
   directory), then create the dated snapshot with the script in `docs/production/hat.md` stage 0.
2. **Candidates.** Query the data: `python3 tools/research/q.py tags`, `... tag <tag>[,<tag>] [minvotes]`,
   `... name "<text>"`. Keep: single player, doable in 2D, playable with one or two thumbs on a phone,
   rating >= 8.9. In `q.py` output `P/I/S` are the store links CrazyGames lists; a `-` is NOT proof of absence.
3. **Store evidence.** For each candidate run 2 to 4 differently worded searches plus the browser
   game's own name:
   `python3 tools/research/store.py ios "<query>" [limit]` and `python3 tools/research/store.py play "<query>" [limit]`.
   Know the tools: `ios` prints only apps whose genre includes Games and prints nothing when there
   is no hit (rephrase before concluding "none"); it gives rating count and average. `play` gives
   an install range and average but no rating count and usually no description. Both are US-only
   and cover only the first results. Open the interesting rivals' descriptions to check the
   mechanic really is the same, not just the same words.
4. **Classify** each mechanic: YES (no real counterpart found), WEAK (counterparts exist but all
   have < 50K iOS ratings and < 1M Play installs, or rating <= 4.0), SATURATED (a strong rival
   exists; name it with its numbers). State confidence (low / medium / high) and what you could
   not check.
5. **Be adversarial.** Try to find the rival that kills the idea: other names for the mechanic,
   the browser game's own store version, "clone of" searches, recent 2025-2026 releases.

## Hard constraints
- Read-only on the repository except the files named under "Write". Do not touch `games/`.
- Network only to `www.crazygames.com`, `itunes.apple.com`, `play.google.com`. Be polite: no loops
  of hundreds of requests.
- Report only numbers you saw in tool output. Never estimate a rating count or install number.
- Do not run git commands that change the index; the manager commits.

## Write
`docs/research/<YYYY-MM-DD>-<topic>-kanit.md` (Turkish or English): per mechanic, the queries used,
the rival rows you relied on (name, rating count or installs, rating), class, confidence, blind spots.
(Plus the new dataset snapshot if you refreshed.)

## Definition of done
Every candidate has a class backed by pasted rival rows; every SATURATED verdict names a rival with
numbers; the evidence file exists; you listed what you could not verify.

## Report (send back exactly this shape)
```
FILES: <paths written>
DATA: <snapshot file and its age in days>
VERDICTS:
- <mechanic> | <YES|WEAK|SATURATED> | confidence <low|medium|high> | browser evidence <game, votes, rating> | strongest rival <name, numbers or "none found"> | queries <n>
UNVERIFIED: <what you could not check>
RECOMMENDATION: <which mechanics proceed to concept, which go to backlog.md and why>
```
