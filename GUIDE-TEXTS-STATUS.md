# Task 6a: the book-text status list

## Files this makes (in `rabiul43/Book_Text`, folder `status/`)
| File | What it holds | Who reads it |
|---|---|---|
| `texts.json` | every book: `"<LibriVox id>":[Gutenberg number or 0,"flags"]` | the app (Task 6c) and the dashboard (6b) |
| `found-gutenberg.json` | numbers found by search, with the title and author they matched: `"<id>":[number,"title","author"]` | the dashboard detail view, and you (to check by eye) |
| `maybe-gutenberg.json` | doubtful matches `"<id>":[number,"title","author","why"]`. NEVER used by the app | the dashboard (to review) |
| `texts-report.txt` | counts and examples | you |
| `_work/search-cache.json.gz` | searches already done (so a stopped run loses nothing) | the notebook only |

Flags in `texts.json`: `h` our own copy is in Book_Text, `p` a timing file exists, `a` the catalog has an archive.org id, `s` the number was found by search (the catalog had none).
Filters: "no text anywhere" = number 0 and no `p` and no `a`. "found by search" = flag `s`.
`catalog.json` is never changed.

## Run it
1. Kaggle: new notebook, File > Import notebook > `wordtrail_texts_status_kaggle.ipynb`.
2. Session options: Internet **On**. Add-ons > Secrets: `HF_TOKEN` ticked for this notebook.
3. Run the one cell as it is (`MODE = "trial"`): 30 books, a table, nothing uploaded. "Wrong must be 0".
4. Optional: set `TRIAL_CHECK = 100`, run again, wrong must still be 0.
5. Set `MODE = "full"`, run. If Kaggle stops, run the cell again.
6. Last lines: `FINAL COUNT CHECK ... ALL GOOD`.

## Safe matching
A number is taken only when the title AND the author's last name clearly agree, the language agrees, the volume/part numbers are equal, and exactly one Gutenberg book fits.
For "Various", "Unknown" and "LibriVox Volunteers" books the title must be exactly the same (at least 2 words) and Gutenberg must also name no author or "Various". Anything less sure goes to `maybe-gutenberg.json`.

## Check without internet
`python tools/texts_status_check.py` (last line must say `0 failed`).
