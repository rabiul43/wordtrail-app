# Changes in this version

## Player: collapse / expand the left panel (desktop, from 1100px)
- NEW round chevron button `#dt-side` on the inner corner of the cover. It hides the whole left panel (cover, title, track list); the text column then takes the full width and centres itself. While collapsed, the same chevron stays at the left edge of the text to bring the panel back.
- The choice is remembered on this device (`wt:dt-side`, not synced or backed up) and applies to every book. Default is open. The `[` key does the same while a book is open and nothing is being typed (listed in Keyboard shortcuts).
- `aria-expanded`, `aria-controls` and a changing label on the button; the hidden panel is `visibility: hidden`, so its tracks cannot be tabbed into. Animation is off with `prefers-reduced-motion`. RTL mirrors the chevron. Phones and tablets are untouched (the panel does not exist below 1100px).
- Files: 10-body-views.html, 20-sheets-player.html, 98-desktop-layout.css, 296-desktop-bar.js, i18n/bn.json (3 strings).
- Test: `python build.py --no-min`, then `node tools/unit_check.js`, `node tools/startup_check.js`, `python tools/tangle_check.py`.


## Search page: no Continue listening card, clearer "filters hide everything"
- While a search is showing results, the Continue listening card (`#recents`) is hidden together with the other home rows (`syncHomeRows`, 110). It returns when the search box is cleared.
- When results exist but the Level / read-along filter hides every one, the empty state now says "Your filters are hiding these results" with a "Clear filters" button that clears just those filters and shows the results (120, `showBooks`). Other empty states are unchanged.
- Files: 110, 120, i18n/bn.json (3 strings), tools/account_tidy_check.js (3 more checks).

## Account tab tidied into sections
- Order now: profile and sync card, "Your activity" (Saved books and Recently listened as two tiles), Authors you follow, Your ratings, Finished, not rated yet, Listening stats (unchanged), History, About, then Data and privacy at the bottom.
- Authors you follow, Your ratings and Finished, not rated yet each show their first 3 books with "See all" / "Show less". Finished, not rated yet is now its own section (`#acct-fin`, same `.acct-rt` class, so Calm mode still hides it).
- NEW Data and privacy: Export my data (presses the Settings > Backup button, works signed out too), Delete my cloud data (moved here from inside "What to sync"), and Delete account (red, two confirmations). Delete account removes the cloud data, then the sign-in (`acUser.delete()`). If Firebase asks for a recent sign-in, the person is told to sign in again and repeat the tap. Ratings and reviews already published stay (the confirmation says so). Not tested against a real Firebase account.
- Not built: "Signed-in devices". The app keeps no device list in the cloud, so there is nothing to show.
- The Settings shortcut is gone from Account (Settings is in the tab bar and side bar). Help moved to the bottom of Settings: Feature guide (with its New badge), How to use, Keyboard shortcuts (mouse or trackpad only). They are also found by Settings search.
- Files: 10-body-views.html (template), 090, 080 (badge moved: `guideUnseen`), 130, 135, 290, 295, 20-home-library.css, 98b-desktop-polish.css (comment), i18n/bn.json (13 strings), BN-REVIEW.md, tools/account_tidy_check.js (NEW), tools/tangle_baseline.json, MODULES.md / DEPENDENCIES.md.
- Test: `python build.py --no-min`, then `node tools/account_tidy_check.js`, `node tools/unit_check.js`, `node tools/startup_check.js`, `python tools/tangle_check.py`.

## Downloads is its own page (no duplicate chip)
- The "Downloaded" chip is gone from My books (it was the same page as the Downloads tab). My books now has Saved and Synced books; the Downloads tab opens the same list with its own title "Downloads" and no chips.
- `showTab('downloads')` is an alias like 'synced' (sets `shelfMode = 'dl'`). The Downloads tab now lights up on that page; the My books tab always opens on Saved or Synced, never on Downloads. A reload comes back to Downloads (`wt:ui` tab "downloads").
- Files: 10-body-views.html, 080, 280, 300, 20-home-library.css, i18n/bn.json ("Downloads"), BN-REVIEW.md, DEPENDENCIES.md / MODULES.md.

## Logo = Home, and a slim app bar on every screen
- The logo is a real link now (`<a data-home>`): Library header, the new slim bar, and the open side bar. One click handler (`appBarInit`, 080) calls `goHome()`: from the book page, See all, Collections, My books or Account it returns to the Library (and empties an open search); on the Library it empties an open search, or scrolls to the top. Ctrl/Cmd/middle click still opens the app in a new tab.
- NEW slim app bar `#appbar` (logo + name, search icon, account button) on every Home-area screen except the Library (which keeps its own header) and never in the player. `showView()` in 080 shows it (`appBarShow`) and sets `<html data-appbar>`. The search icon (`appBarSearch`) goes to the Library and puts the cursor in the search field. Sticky, same column as the pages, so the logo and the account button stay in the same place on every screen.
- Account button: `acAvatar` (295) now paints every `.sb-avatar` (Library header and slim bar); the one for the open Account page gets `aria-current="page"` and a ring.
- Side rail / sidebar (from 700px): the menu button (`#nav-toggle`, same id) and the logo + name are now two separate controls. The menu button still opens and closes the sidebar; while the sidebar is open the logo + name is the Home link. The slim bar drops its own logo while the sidebar shows it (same rule as the Library header).
- Files: 10-body-views.html, 99-home-header.css, 080, 295, 300, i18n/bn.json (one new label, "Wordtrail home"), BN-REVIEW.md, DEPENDENCIES.md / MODULES.md (python tools/deps.py).

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

## Side rail (tablet / computer)
- From 700px wide the left bar is a narrow rail by default (icon over label, open page filled with an accent bar on its left edge, Account at the bottom). The menu button at the top opens it into a sidebar with the logo and name; the choice is remembered (`P.navOpen`, `<html data-nav="rail|open">`, `applyNav()` in `090`, click in `300`, early attribute in `00-head.html`).
- The player always keeps the narrow rail. Phones keep the bottom tab bar.
- Styles: end of `src/css/99-home-header.css`. The old "full sidebar from 1200px" rules in `98-desktop-layout.css` and the `.tb-brand` logo block were replaced (`#nav-toggle` in `10-body-views.html`).

## Author page on large screens (900px and wider)
- Same banner idea as the book page: full-width hero with the author's cover fan on the left (bigger), a soft blurred cover backdrop on the right, name, years and "7 books · 42 h" on one line, a 3-line bio teaser ("Read more", Wikipedia credit kept), and a "Start with <shortest unheard book>" button next to Follow.
- "All books" is a cover grid on desktop, with the sort chips on the heading row. The old "Start here" card and "About the author" section are hidden on desktop (the banner holds them); phones keep them.
- Files: `src/js/132-author-page-resume-card.js` (drawAuthor: new `.aut-hero`, `.aut-info`, `.aut-meta`, `.aut-bio`, `.aut-actions`, `.aut-start-btn`, `.aut-grid`, `.det-bg`), `src/css/98-desktop-layout.css` (new block "desktop author page"), `tools/tangle_baseline.json` (132 now uses `tileNode` from 101).
- Nothing else is touched: every new rule is scoped to `.aut-*` and sits inside `@media (min-width: 900px)`. Below 900px the extra elements are hidden or `display: contents`. Checked by screenshots of the real build: phone author page, phone book page and desktop book page are pixel-identical to before.

## Home: "Continue listening" becomes a full-width banner (one book in progress, 900px and wider)
- When only one book is in progress (`#recent-list.rc-solo`), the card spans the page: bigger cover (11rem), the cover blurred behind on the right, bigger title, progress bar, Resume button and "x h left" in one row.
- With two or more books the hero keeps the existing layout (hero left, "Also in progress" right).
- Files: `src/js/132-author-page-resume-card.js` (resumeHero: `.rs-bg` backdrop, `.resume-left` time left), `src/css/20-home-library.css` (new block after the wide-screens rules). Phones and 700-899px are unchanged (screenshots of the real build are pixel-identical for 1 and 2 books at 390 and 800px, and for 2 books at 1440px).

## Book page: "Ratings and reviews" now sits below "About this book"
- `src/js/131-book-stats-share.js` (drawDetail): order is now About, Ratings and reviews, the Wikipedia background section, then More like this. Same order on every screen size. Nothing else changed.

## Offline screen polish
- Removed the "You're offline" popup (offsheet); the bottom strip is the one offline indicator.
- No duplicate top note on the offline home.
- Downloads tab lights up while the offline home shows.
- New empty state: headline, short text, Retry connection button.
- Settings > Storage: the book list no longer widens the tab past the sheet (grid column minmax(0,1fr)); long titles wrap to 2 lines; Remove button is 44px tall.
- Music now follows what is heard (musNarrating): it waits while a recording loads or stalls, stops when a new recording starts loading, and starts when the voice does.
- Offline home: the "Showing downloaded books only" line under the status bar is removed (also hidden by CSS as a safeguard).
