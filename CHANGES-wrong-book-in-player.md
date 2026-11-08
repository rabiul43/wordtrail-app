# Fix: the player showed the previously opened book

Bug (screenshot): open a book whose track list is slow to load. The top bar named the new book, but the cover and the big title below, the times and the "left in book" bar still belonged to the book opened before.

Cause: `openBook` (140) paints the new title in the top bar at once, but the cover, big title, times and progress are painted by `updateHeader()`, which needs `S.book`, and `S.book` still points at the old book until the track list has arrived.

Fix:
- `openingIdentity(b)` (140) paints the new book's cover, title, author, resets the times and hides the old progress bar, right when the player opens. Also used when the app reopens the last book after a refresh (300).
- If opening fails (no tracks, no connection) the player is repainted for the book that was open before (`updateHeader` + `updateSeekUI`).
- Related race found while looking: opening book A (slow) and then book B (fast) let A take over the player when it finally loaded. Each `openBook` now takes a number (`openSeq`); one that is no longer the newest stops quietly after its waits.
- Checks: tools/unit_check.js (76 pass). The race fix is not covered by an automatic check (it needs a whole book open); try it by hand.
