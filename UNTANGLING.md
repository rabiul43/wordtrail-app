# Untangling the app (long-term plan)

Written from real measurements (`python tools/tangle_check.py --report`), not guesses.

## Where it stands

| | |
|---|---|
| Files in the one big function | 75 (17,655 lines) |
| Names shared between files | 684 (of 1,741 top-level names) |
| Dependencies between files | 640 |
| Dependencies that point at a file loaded LATER | 213 (they only work because the use happens inside a function that runs later) |
| Largest group of files that all depend on each other | **69 of 75** |
| Most-used names | `store` (35 files), `toast` (30), `audio` (28), `guideDoc` (26), `AMB` (26), `savePrefs` (20) |

So the review is right: it is one tangle, not several small ones. Pulling one file out today would drag most of the others with it.

## Why not rewrite it in one go

17,000 lines would have to be reconnected at once, and the only proof it still works would be clicking through every screen. A big rewrite is the most likely way to ship new bugs. The plan below changes one small thing at a time, and each step is checked by the machine.

## The safety net (already in place)

- `tools/tangle_check.py`: every NEW dependency between files must be accepted on purpose (it shows in the diff). Leftover files fail. **The tangle can no longer grow by accident.**
- `tools/startup_check.js`: after any move or reorder, the page's start-up code is run in Node. A name used before its file loads, or a name that no longer exists, fails at once. It does not check what happens after start-up (taps, sync, audio): that is for `unit_check.js` and your browser tests.
- `tools/unit_check.js`: the sync, plan, alignment and book-loading rules.
- `tools/deps.py --check`: no name is declared twice.

## The steps

1. **Done: remove the 8 leftover files** (old copies from before the files were split; every name in them already exists in the built app, and the built page is byte-for-byte the same without them).
2. **Always: shrink the baseline a little each time you touch a file.** If you can make a file need one less thing from another file, do it, run `python tools/tangle_check.py --accept`, and the gain is locked in.
3. **Make the hub names explicit.** `store`, `toast`, `audio`, `guideDoc`, `savePrefs`, `openSheet`, `closeSheets` are what really glue the app together. Put them in one small object declared in one place (for example `App = { store, toast, audio, ... }`) and let features use `App.toast(...)`. This does not move any code yet, but it turns "everything can touch everything" into a short list of named doors.
4. **Practise on the smallest features first.** The table shows how many names each feature takes from the rest of the app ("needs") and how many the rest takes from it ("offers"):

   | Feature | Needs | Offers | Lines |
   |---|---|---|---|
   | `161-live-translate.js` | 6 | 1 | 135 |
   | `095-weekly-report.js` | 6 | 1 | 103 |
   | `145-chapter-recap.js` | 10 | 2 | 73 |
   | `134-version-picker.js` | 12 | 3 | 271 |
   | `295-account-sync.js` | 3 | 11 | 488 |
   | `250-characters.js` | 13 | 7 | 501 |
   | scene detection (`230`-`234`) | 19 | 13 | 906 |
   | `135-ratings.js` | 34 | 12 | 492 |
   | `sound/` (28 files) | 34 | 20 | 2,700 |
   | `280-downloads-progress.js` | 50 | 23 | 728 |

   Start at the top: pull out live translate or the weekly report, using the host object from step 3, and learn what the method costs in practice. Each one removes a few dependencies and proves the safety net works.
5. **Then the big, valuable one: the sound feature.** It is the largest self-contained feature (2,700 lines). It needs 34 names from the rest of the app (the hubs above, plus the player: `wordTimesFor`, `nowT`, `trackDone`, `togglePlay`, and the scene test helpers `amb*`, `sctInit`) and the rest of the app uses only 20 names from it (`AMB`, `MUS`, `sndOn`, `ambOpen`, `ambSync`, `osArm` ...). Give those 34 names one explicit "host" object, change the sound files to use it, and the baseline drops by dozens of dependencies. Only then move the sound code into its own block.
6. **Last: the central pieces** (`140-open-book.js`, `150-player-reader.js`, `300-wiring.js`, `270-sheets-nextup-back.js`). They depend on, and are depended on by, almost everything, so they become easy only after the features around them have been pulled out.

## How to do one extraction safely

1. `python tools/tangle_check.py --report` (note the numbers).
2. List the feature's inward and outward names with `python tools/deps.py --who NAME`.
3. Make the change (host object, then use it). Do not change behaviour in the same step.
4. `python tools/deps.py`, `python tools/tangle_check.py`, `node tools/unit_check.js`, `python build.py --no-min && node tools/startup_check.js`.
5. Run your browser tests and open a book with sound on.
6. `python tools/tangle_check.py --accept` and commit. The baseline diff shows the dependencies you removed.

One step per commit, so any step can be undone on its own.
