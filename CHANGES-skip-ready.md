# Skip ready books

A new page in My Library, next to Synced books: the books whose spoken LibriVox notice is ready to be skipped, so you can pick books that will play cleanly.
It only lists books. How skipping works is not changed, and there is no "Skipped the intro" message.

## The list file (notebook skip-intro_v5.ipynb)
- New cell 7c (after 7b, before the upload cell) writes `extras_out/index.json`: `{"v":1,"b":{"<book id>":[chapters with a notice cut, total chapters]}}`.
- A book is listed only when MORE THAN HALF of its chapters have a head cut. The rule is in one place: the `is_ready` function in cell 7c.
- Only files that passed cell 7b are used (held-back files are not counted).
- The upload cell (8) uploads index.json to `extras/index.json` with the other files (extras_report.txt is still left out) and stops with a clear message if cell 7c was not run.

## The app
- `070-network-data.js`: `SKX` downloads `extras/index.json` when the page opens (not at start-up), keeps a saved copy (`wt:skipidx`) and uses it at once.
  A copy older than a day is refreshed quietly in the background. If the download fails, the saved copy is used; with none, the page shows "Not available yet".
  Entries that are not whole numbers, or that say 0 or more chapters than the book has, are ignored. A file with another version number is ignored.
- `282b-skip-ready.js` (new): the page. Rows reuse the Synced books look. Book info comes from saved books, recent books and the catalogue; a book the app does not know shows "Book <id>".
  Order: "Cleanest first" (largest share of chapters) or "A-Z". Tapping a row opens the book as usual (same as Synced books).
- `282-library-hub.js`: a row "Skip ready books" in the My Library list and a tile in the New Library layout (the tile shows the count from the saved copy, or a dash).
- `080-ui-shell-favourites.js`: the new page is shown, hidden and drawn like the other My Library pages.
- `10-body-views.html`: the chip (wide screens) and the page box. `99r-skip-ready.css` (new), `build.py` (2 lines).
- `tools/tangle_baseline.json`: the 8 new links between files were accepted (`python tools/tangle_check.py --accept`).

## New English texts (not translated yet)
See the list in the hand-over message. No file in `src/i18n/` was changed.
