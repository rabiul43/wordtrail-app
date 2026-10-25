# Changes in this version

## Desktop and tablet layout (audit P0-A)
- NEW src/css/98-desktop-layout.css, added at the end of the CSS list in build.py. All rules sit inside min-width media queries; the phone layout is unchanged.
- src/html/10-body-views.html: a small logo (`.tb-brand`) inside `#tabbar`. Hidden on phones.
- Left rail from 700px, full sidebar from 1200px (rail inside the player), mini player as a bar along the bottom, player split into cover | text from 1100px.

## 1. Fonts served from our own site (item 9)
- tools/fetch_fonts.py -> fixed the Fraunces entry (Google rejected it). Then: python tools/fetch_fonts.py, python build.py, commit src/fonts/.

## 2. Book text: one download source at a time (item 10)
- src/js/070-network-data.js -> TEXT_ROUTES, textRouteOrder, fetchTextRace
  - The route that worked last time is asked first and alone; the next route is added only if it fails or stays silent for 1.5 s.
  - Removed the duplicate route 'allorigins-json'.

## 3. Book text: our own small copy on Hugging Face is asked first
- src/js/070-network-data.js -> BOOK_TEXT_REPO, getHfText, one call in getGutenberg0 (before the public routes)
  - Reads rabiul43/Book_Text at texts/<id / 1000>/<id>.txt.gz; if it is not there, nothing changes.
- wordtrail_book_text_kaggle.ipynb (new, not part of the app) -> fills Book_Text from Kaggle; Telegram message every 50 books.
- tools/prep_texts.py (new) -> same file layout from a folder of .txt books on your own computer (optional).

## 4. One bad piece of data no longer stops a book from loading (item 17)
- src/js/133-open-progress-saved-state.js -> takeJsonLines (new), fetchBundle
  - A line of the /book stream that is not valid JSON (or is null / a number) is skipped; the next lines still arrive, so the tracks and the text still load.
  - A line that cannot be used (e.g. the device is out of space for the text) is skipped instead of ending the stream.
  - If the stream ends with no usable track list the request now answers "empty" at once, so the other routes start without waiting.
- src/js/070-network-data.js -> normBook, lvGetOnce
  - An empty or broken entry inside a book's track list or author list is left out; the rest of the book is kept.
  - One book that cannot be read is skipped; the other books in the same answer still show (before, one bad book made the whole route fail).
- tools/unit_check.js -> 13 new checks, including the real fetchBundle run against a pretend stream with broken lines.
