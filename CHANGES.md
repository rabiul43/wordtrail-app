# Changes in this version

## Seek bar touch target (audit P1-B)
- src/css/50-new-reader-tabbar-settings.css: seek thumb 28px (Firefox 22px), touch row 44px, thumb re-centred (margin-top -.75rem). Track look unchanged.

## Desktop and tablet layout (audit P0-A), second version
- Book rows on Home / Collections become wrapped cover grids from 900px (two rows, "See all" shows the rest).
- From 1100px one player bar runs along the bottom: on Home the mini player gets back/forward 15 s, play and a seek bar (NEW src/js/296-desktop-bar.js, registered in build.py; one line added to updateSeekUI in 150-player-reader.js); in the player the dock becomes the same bar. The wave-dots row (`.viz`) is hidden in the bar.
- Player: a track list under the cover (new `#dt-tracks` in the markup), cover and title stay in view.
- NEW src/css/98-desktop-layout.css, added at the end of the CSS list in build.py. All rules sit inside min-width media queries; the phone layout is unchanged.
- src/html/10-body-views.html: a small logo (`.tb-brand`) inside `#tabbar`. Hidden on phones.
- Left rail from 700px, full sidebar from 1200px (rail inside the player), mini player as a bar along the bottom, player split into cover | text from 1100px (cover and title stay in view while the text scrolls).

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

## New Home header
- Home header is now one row: logo + Wordtrail, search field (filters + search icons on the right), round account button (photo / first letter / person icon; tap opens Account).
- Tablets and computers (700px and wider) always use it. Phones show the logo only and can switch back to the classic header in Settings > Appearance > "New Home header" (`P.hdrNew`, default on).
- Files: `src/css/99-home-header.css` (new, listed in `build.py`), `10-body-views.html` (`.sb-brand`, `#btn-go-q`, `#sb-avatar`), `00-head.html` (early `data-hdr`), `090` (`applyHdr`), `290`, `295` (`acAvatar`), `300`, `30-sheets-settings.html` (`#in-hdr`).
