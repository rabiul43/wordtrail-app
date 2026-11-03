# Speed remembered per book (includes the share-link files from the previous zip)

Copy these files over your good project (same folders), then run `python build.py`, then `python tools/deps.py`:
- src/js/260-audio-effects.js   (per-book speed code, "Remember speed" switch)
- src/js/140-open-book.js       (1 edit: apply the book's speed when it opens)
- src/js/300-wiring.js          (init call marked automatic; shared-link edits)
- src/js/120-search-recommendations.js, src/js/132-author-page-resume-card.js ("time left" uses each book's speed)
- src/html/20-sheets-player.html (switch row in the Playback sheet)
- share-link files (131, 301, build.py) from the previous zip, already included here

Test: open book A, set 1.5x. Open book B (it starts at 1.5x), set 1.0x. Open A again: 1.5x. Open C: 1.0x.
Switch off: Playback > Remember speed for each book.
