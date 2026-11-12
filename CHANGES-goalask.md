# Goal picker, Task 51: a one-time question for people who already use Wordtrail

Most of the goal picker was already in the app (CHANGES-goal.md, CHANGES-learn-gate.md): the first-run card, the Settings switches, the Learn / IELTS tab, the exam card, Standard | Learn. This change fills the one gap in Task 51: **existing users get a gentle one-time prompt, not a blocking screen.**

## What changes for the person
- **Existing users** (onboarding finished before, goal never chosen): My Library opens with a calm card "How do you use Wordtrail?" with Enjoy stories / Learn English / Prepare for IELTS and **Not now**. It sits at the top of My Library (the phone list, or the desktop Saved page), not on Downloads. Nothing is blocked.
- **A choice** is saved exactly like the Settings switches (same code). The card never comes back. The reader's Learn button setting is not touched.
- **Not now** saves only "question done". The app stays exactly as it was (Standard). It is never asked again. Settings > Reading > Learn mode still turns learning on later.
- **"Skip for now" in first-run onboarding** now also means "do not ask again" (before, the goal stayed unset and nothing marked it). A person who skipped is not asked again later.
- **The earlier toast** ("Learning tools are now optional... Turn on") is not shown to someone who already answered or skipped the question. A person who has saved words and has not answered still gets that toast once, and the card too (two soft nudges in two places).

## Switching goals, both ways
Nothing is deleted by any answer or switch. Saved words (every field), review schedule and progress are not touched; the exam date and target are kept when learning or the exam is switched off and on again (tested with six switches in a row, and with the real Settings switches in Chromium).

## Files
- New: `src/js/169n-goal-ask.js`, `src/css/99e5-goal-ask.css`, `tools/goal_ask_check.js`, this file
- Changed: `build.py` (2 lines), `src/html/10-body-views.html` (`#gl-ask`), `src/js/080-ui-shell-favourites.js` (`shelfHooks.ask`, 2 lines), `src/js/169l-goal.js` (`legacyNote` guard), `src/js/300-wiring.js` (Skip for now), `src/i18n/bn.json` (10 strings, for review), `MODULES.md`, `DEPENDENCIES.md`
- To go back: remove the new files, their `build.py` lines, `#gl-ask`, the `shelfHooks.ask` lines in 080, and the two small guards in 169l and 300.

## Not done
- No Bengali native review of the 10 new bn strings.
- The Settings control stays two switches (Learn mode, Prepare for IELTS) as set by the Standard | Learn gate, not the three rows in the first mock-up.
