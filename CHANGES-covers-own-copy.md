# Covers: load from our own copy first (Task 3)

## What changed
- `src/js/100-home-covers.js`: new block "our own copy of every cover" (`covLoad`, `covOwn`, `COV_*`). `coverFill` now tries, in order: my override, the program's best pick, the other pictures of our copy (se, ol, pg, lv), then the old sources (LibriVox art, Internet Archive, Open Library), then the tinted title box. A picture of our copy that has not loaded after 5 s (`COV_WAIT`) or fails is skipped. The old sources keep their old behaviour. A book that is not in `index.json` (or when the lists cannot be read) uses the old sources exactly as before.
- Lists: `covers/index.json` and `covers/overrides.json` are read once per visit, saved in the phone's database (`covidx` for 12 h, `covovr` for 20 min; an older saved copy is used when the network fails). A cover drawn before they arrive waits up to 2.5 s, then starts with the old sources.
- `src/pwa/sw.js`: `isCover` also accepts `/datasets/<owner>/<repo>/resolve/main/covers/<folder>/<id>/<source>.webp` (works on huggingface.co and on the wordtrail-hf Worker). Covers are cache-first and renewed quietly after 14 days, as before. `COVER_MAX` 600 -> 1000 (about 25 MB at 25 KB each).
- `tools/cover_copy_check.js` (new): 17 offline checks with fake lists and fake pictures.
- The app version is the build stamp written by `build.py` (shown in `dist/version.json`), so a new build is already a new version.

## File formats the notebook (Task 1/2) and dashboard (Task 4) must follow
- `covers/index.json`: `{"v":1,"b":{"<LibriVox id>":"se,ol,lv"}}`. The string lists the pictures that exist; the FIRST is the program's best pick. Other keys (for example the Gutenberg id) are ignored by the app.
- `covers/overrides.json`: `{"v":1,"b":{"<LibriVox id>":{"best":"ol","off":["lv"]}}}`. `best` is shown first; names in `off` are never shown (step one of Remove).
- Pictures: `covers/<floor(id/1000)>/<id>/<source>.webp`.

## Two settings at the top of the new block
- `COV_REPO = 'rabiul43/Book_Covers'`: change it if the covers go in `wordtrail-packs` instead (then the paths in the notebook get a prefix too).
- `COV_OVR_URL`: change it if `overrides.json` lives in the admin worker's storage instead of Hugging Face.


## Fix after the dashboard (Task 4): the app now reads the REAL files
The first version of this change assumed file shapes that the notebook and dashboard do not use. Corrected:
- `covers/index.json` really is `{"v":1,"made":...,"order":[...],"n":..,"total":..,"b":{"<id>":["<best>","se,ol",<gutenberg id>]}}`. The app now reads that list form (best pick, pictures that exist) and still reads the plain `"se,ol"` form. Before this fix, every book was skipped, so the own copy was never used.
- My choices are NOT on Hugging Face. The dashboard saves `{"version":1,"books":{"<id>":{"best":"ol","removed":["lv"]}}}` in the admin Worker's storage (`covers/overrides.json`), and the app reads it from the Worker's public address `<admin>/public/cover-overrides.json`. `removed` is the same as `off` inside the app.
- New address in `hosts.json`: `"admin"` (empty = my choices are not read). `build.py` has the matching slot `__WT_HOST_ADMIN__`.
- `tools/cover_copy_check.js`: 28 checks (was 17), including the real shapes. The new checks fail on the old code.
- The service worker needed no change.
- How fast a dashboard change reaches a phone: the Worker address is cached for about 5 minutes, and the app keeps its own copy for 20 minutes (`COV_OVR_TTL`).
