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
