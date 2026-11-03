# Share link opens the book

Copy these 4 files over your good project (same folders), then run `python build.py`:
- src/js/301-open-shared-link.js  (NEW)
- src/js/131-book-stats-share.js  (Share now sends ?book=ID; defines DEEP_ID)
- src/js/300-wiring.js            (2 small edits: shared link beats "resume last book"; opens link after the first-run welcome)
- build.py                        (one new line for 301)

Then run: python tools/deps.py   (refreshes DEPENDENCIES.md and MODULES.md)

Test: open a book page > Share > copy the link > open it in a new tab: the book page opens, and ?book=... disappears from the address bar.
