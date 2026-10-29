# Changes in this version

## One AudioContext for the whole app (audit P13)
- 150-player-reader.js (`vizPrime`): the sound wave and Audio enhancer made their own `AudioContext`. They now take the shared one, `audioCtx()` from ambient-engine.js, the same context ambient, music and the opening sound use. Two contexts meant two audio threads and double wakeups, which costs most battery on iOS.
- Needed so the narrator is not cut off: `audioSuspendSoon` (ambient-engine.js) stops the shared context when ambient is silent and music is idle. It now also asks `AMB.narr()`, which 150 sets to "the narrator is playing through the graph", so the context is not suspended under a playing narrator. A paused narrator lets it suspend; `play` already resumes it.
- The narrator's "context stopped, wake it" handler is added with `addEventListener('statechange')` instead of `onstatechange =`, so it never replaces another listener on the shared context (music keeps its own).
- New field `narr: null` on `AMB` (ambient-scenes.js). It is a hook, so ambient-engine.js does not depend on the player file.
- Not changed: the short-lived contexts used only to decode audio (140, 050, 170, 180, 265). Each is closed right after use, so they are never running at the same time as the main one.
- Test: `python build.py --no-min`, then `node tools/unit_check.js`, `node tools/startup_check.js`, `python tools/tangle_check.py`. One new file dependency is intended: 150 -> ambient-engine (`audioCtx`). The other tangle failures (the two older dependencies, the `before-P11` / `before-P12` copies) were there before this change.
- Not tested on a real iPhone: play with sound wave or enhancer on, ambient and music off, then pause and play again, and lock the screen.

## Less double ticking while playing (audit P12)
- 150-player-reader.js: the `timeupdate` handler called `tick()` about 4 times a second, on top of the loop that already calls it about 20 times a second (or every frame with the sound wave). It now skips that call while the loop ran in the last 250 ms and the page is showing.
- Kept on purpose: a hidden page (screen off) pauses the loop, so `timeupdate` still ticks there. That is what ends a track at its cut point, stops the chapter sleep timer and prefetches the next track in the background. It also still ticks if the loop ever stalls. The first `timeupdate` after a seek or track change (resnap) is unchanged.
- New name `loopAt` (one line next to `raf`).

## Scroll restore no longer leaves 3 listeners behind (audit P11)
- 080-ui-shell-favourites.js (`uiInit`): the "reader scrolled themselves" listeners (touchstart, wheel, keydown, mousedown) used `once`, which only removes the one that fired, so the other three stayed for the whole session. They are now all removed as soon as the scroll restore ends. Behaviour is unchanged.
- The other tap/key listeners were checked: each is added once at startup, or removes itself (`musGestureArm`, the review menu). Nothing else grows with session length.

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

## Scene detection, round 2 (fewer wrong scenes, a score, an optional free AI)
- src/js/231-scene-scoring.js -> SC_SKIP rules (figure of speech, colour, oath, name, verb use), ambName / ambOath / ambSkip; sticky place (ambPlacePick: moved, or clearly ahead for 3 paragraphs); chapter setting (ambBgAdd / ambBgMake / ambBgApply); each score also records the word that gave it (hw); SC_CHANGE also catches "came into", "stepped out into"
- src/js/233-scene-chapters-label.js -> the chapter scan keeps a small summary (place, weather, time, mood); ambAutoStep: word cuts from corrections (ambFixWords), the free AI (ambAiApply / ambAiAsk, off by default)
- src/js/232-scene-test.js -> corrections store their trigger words and a device-only paragraph snippet (wt:ambfixtxt); "Export all corrections"; the test prints one score ("182 of 200 correct", per kind) and the paragraphs that got better or worse than the baseline; cases with "| chapter" and "real-" ids
- src/js/sound/sound-screen.js, src/js/sound/sound-presets.js, src/html/28-sheet-sound.html -> switch "Ask a free AI when unsure", button "Export all corrections"
- src/dev/scene-tests.txt -> new cases for every skip rule, sticky place, chapter setting; "real-" cases made by tools/pick_paragraphs.py (scanner-tools)
- 231-scene-scoring.js (round-1 scan report) -> 4 more SC_SKIP rows: "like a lightning stroke", "morning visit / evening dress", "had haunted her" (mood), "their ghosts will haunt me"; scanner-tools/scan_books.py now flags a scene start only when the figure-of-speech pattern is within 60 characters of the word that started it, and no longer treats time words flipping back as a mistake
- tools/scene-ai-worker/ (new) -> the free Cloudflare Worker for the AI option (README.md inside); its address is the new "scene" entry in hosts.json (empty = off), added to build.py
- DEPENDENCIES.md, MODULES.md -> refreshed with tools/deps.py

## P10: little timers that never stop
- Three timers ticked all day, even with nothing playing: smart mix (250 ms), sound balance (500 ms), scene label (1 s). They now come from one helper, `idleTimer()` / `idleTimersSync()` in `src/js/sound/sound-core.js`, and run only while audio plays and the page is visible (or while the Sound sheet is open). Play, pause, seek, show/hide and the Sound sheet opening start and stop them; each runs once more on stopping so its display is final.
- Governed by the existing Settings > Advanced "Save battery while playing and in the background" switch (off = old always-on behaviour).
- Files: `src/js/sound/sound-core.js`, `smart-mix.js`, `sound-screen.js`, `src/js/300-wiring.js`. Checked in headless Chromium: idle page has only the 10-minute mood timer; play starts the timers, pause stops them, no errors. Not tested with real audio on a phone.

## P3: page header leftovers
- Removed the unused `<link rel="preconnect" href="https://librivox.org">` (LibriVox is only a fallback; the catalog and lists come from the local catalog). The archive.org DNS prefetch stays (covers).
- The saved settings (`wt:prefs`) were parsed five times by the inline scripts in `src/html/00-head.html`; now parsed once into `window.__wtP` and reused by the theme, nav/header, fonts, diagnostics and lite-graphics scripts. Same results, also with missing or broken settings.
