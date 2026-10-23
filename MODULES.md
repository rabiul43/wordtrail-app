# Wordtrail modules

The app is ONE closure: every file in `src/js/` (from `020` to `999`) is a slice of the same function, so all of them share the same names. The order of the files is the order in the final `index.html` (set in `build.py`).

## Shared names (declared once, used everywhere)

| Name | What it is | Declared in |
|---|---|---|
| `$`, `$$`, `h` | query helpers and the element builder | `030-helpers-offline-audio.js` |
| `storeHook` | called after every `store.set` (used by account sync) | `030-helpers-offline-audio.js` |
| `P` | saved preferences (Settings) | `030-helpers-offline-audio.js` |
| `store` | safe localStorage wrapper | `030-helpers-offline-audio.js` |
| `el` | the main screen elements | `040-worker-newreader.js` |
| `S` | state of the book that is open | `060-position-bookmarks.js` |
| `LVL`, `LF` | reading-level data and the home filters | `070-network-data.js`, `103-browse-filters.js` |
| `toast` | small message at the bottom | `080-ui-shell-favourites.js` |
| `Core` | pure text functions | `010-core.js` |

A file may use a name from a file ABOVE it at load time; inside a function it may use any name from any file.

## JavaScript files (`src/js/`)

| File | Lines | What is inside |
|---|---|---|
| `005-settings-tabs.js` | 36 | Small script that shows the Settings tabs and unlocks Developer (7 taps) |
| `010-core.js` | 735 | Pure text functions (no screen code): Gutenberg cleaning, sentences, spoken length, audio alignment, timing plan. Declares `Core` |
| `020-app-open.js` | 4 | Opens the big app closure `(() => {` ... everything below this file lives inside it |
| `030-helpers-offline-audio.js` | 317 | helpers, feature guide registry, offline audio, Download management |
| `040-worker-newreader.js` | 149 | background worker, new reader |
| `050-audio-clips.js` | 358 | audio clips |
| `060-position-bookmarks.js` | 241 | position recovery |
| `070-network-data.js` | 556 | network, local catalog, text-analysis data, reading level, which books are pre-synced, moods.json and similar.json, best version |
| `080-ui-shell-favourites.js` | 232 | toast, status, views, feature guide, remember the last tab and scroll position, favourites |
| `090-synced-stats-book-search.js` | 702 | Synced tab, Listening dashboard, Reading analytics, Offline search inside books |
| `100-home-covers.js` | 278 | home constants (featured IDs, genres, cache TTLs), cover art, Standard Ebooks covers, per-book accent colour, cover style |
| `101-home-tiles.js` | 164 | tiles, "Show more" tile, skeleton tiles, pull to refresh, fill a row, stale-while-revalidate helper |
| `102-home-sections.js` | 215 | one book per row per screen, Featured, Recently added, genre chips and results |
| `103-browse-filters.js` | 250 | browse filters (length, mood, language, narrator, level, sort, minimum rating), filter panel. Declares `LF` |
| `104-see-all-suggestions.js` | 137 | "See all" button and page, empty/error states, recent searches, live suggestions while typing |
| `105-home-loaders.js` | 209 | home loaders (book of the day, trending, new this week, collections shelves), genre shelves, Customise home |
| `110-collections.js` | 238 | Collections tab |
| `120-search-recommendations.js` | 537 | home search and recents, search filters, Search by meaning, "Because you listened to ...", mood rows, time-of-day card |
| `130-book-detail.js` | 193 | Book detail page, Follow an author, Wikipedia bio and background, similar books |
| `131-book-stats-share.js` | 151 | Book stats on the details page, start/finish sending, share button |
| `132-author-page-resume-card.js` | 95 | Author page, large "pick up where you left off" card |
| `133-open-progress-saved-state.js` | 226 | opening progress, combined /book request, saved state of a book, heartbeat |
| `134-version-picker.js` | 271 | in-player version picker, 20-second sample by another reader, moving the position to the new recording |
| `135-ratings.js` | 487 | Ratings and one-line reviews: 1-5 stars and an optional 140-character review per signed-in user per book, the average, star breakdown and latest reviews on the book page, `ratePrompt` for the Finish card, and the per-session ratings summary for tiles and lists (`rtSumLoad`, `rtInfo`, `rtChipText`), `rtCmp` (order by rating, used by the Top rated sorts and the minimum-rating filter in `100`), the Account-tab lists "Your ratings" and "Finished, not rated yet" (`renderMyRatings`; kept in `wt:myrt`, synced), the All reviews page (`openReviews`, `drawReviews`; a layer on the book page via `DET.rv`), and the review menu (report sheet `#sheet-report`, `rtReport`; edit/delete own review). Firestore `ratings/{bookId}` (rules in `firebase/firestore.rules`). Uses `acLoad`, `acInfo`, `acSignIn`, `acDb` from `295` |
| `140-open-book.js` | 720 | opening a book, parsed-book cache, plan + reader, intro/outro cuts, free chapter summaries |
| `150-player-reader.js` | 721 | Finish-and-Continue card (with the "How was it?" rating box from `135`), following the highlight, word-level highlight, Dialogue marking, audio, Sound-wave visualizer, Audio enhancer |
| `160-learning-tools.js` | 346 | sentence translation, book vocabulary, Review, Pronunciation, reading-only mode, gesture hint |
| `170-sync-points-drift.js` | 344 | sync points, pause map, drift auto-correct |
| `180-sync-alignment.js` | 468 | background alignment, Precise timing from speech recognition, Whole-book alignment |
| `190-sync-finish-retry.js` | 645 | finished sync saved and shared, match percentage per track, retry one track, "Sync this book" / syncNow |
| `200-player-controls.js` | 487 | how sure the highlight is, sleep timer, speed, media session, shake to extend the sleep timer, lock screen, keep the screen on while a book is open, Highlights, notes and quote cards, app language and right-to-left layout (words live in `src/i18n/<code>.json`, one file per language (joined into `#i18n-data` by `build.py`; check with `python tools/i18n_check.py xx`); engine also translates numbers with units (`units` in the language file: "5h 10m", "45 min ago"), optional native digits (`digits`, Settings > Reading), placeholder/aria-label/title and loads Noto Sans Bengali lazily for bn; Bengali review list in `BN-REVIEW.md`) |
| `210-sound-mixer.js` | 690 | background sound mixer, real recordings |
| `220-story-sounds.js` | 406 | story sounds |
| `230-scene-words.js` | 350 | scene detection: places, weather, time and mood tables, the word lists |
| `231-scene-scoring.js` | 226 | negation and endings, weather strength, quoted speech, genre priors, choosing and keeping a place/name |
| `232-scene-test.js` | 150 | Scene test (Settings > Developer) |
| `233-scene-chapters-label.js` | 111 | chapter titles and look-ahead, scene label on the mini-player |
| `240-sound-presets.js` | 283 | hear a sound; quick presets |
| `250-characters.js` | 501 | characters |
| `260-audio-effects.js` | 371 | Finer speed, silence skipping, voice boost, Loudness evener, Mono and left/right balance, lock screen / notification artwork, "Skip intro" button |
| `270-sheets-nextup-back.js` | 276 | sheets, Pre-sync, Next up, Back button / swipe-back |
| `280-downloads-progress.js` | 487 | download a book for offline listening, auto-download the next tracks, chapter progress, whole-book progress |
| `290-backup-maintenance.js` | 333 | Backup and restore, sync dashboard |
| `295-account-sync.js` | 480 | Account sign-in (Google, Firebase) and cloud sync of settings, favourites, bookmarks, progress. Uses `storeHook` from `030` |
| `298-pwa.js` | 48 | Registers the service worker (`src/pwa/sw.js`) after the page loads, and keeps the browser/status-bar colour (`theme-color`) equal to the current theme's background |
| `300-wiring.js` | 741 | wiring |
| `999-app-close.js` | 2 | Closes the app closure `})();` |

## CSS files (`src/css/`)

CSS is a layered cascade (later rules win), so the order is fixed. Later "Phase" blocks override earlier ones on purpose. Do not reorder these files.

| File | What is inside |
|---|---|
| `10-base-layout.css` | design tokens, base layout |
| `20-home-library.css` | calm mode, home, rows, phases 4-16 |
| `30-onboarding-sync-card.css` | onboarding, placement quiz, sync card, match percentage |
| `40-player-sheets-chips.css` | player, quick quiz, sheets, shelves, chips, result rows |
| `50-new-reader-tabbar-settings.css` | new reader, tab bar, player dock, settings sections |
| `60-reading-search.css` | reading view, sheets look, search, next-up sheet |
| `70-collections-detail-motion.css` | collections, version picker, book detail, motion, touch targets |
| `80-progress-v10.css` | whole-book progress, v10 fixes |
| `90-reader-sheet.css` | Focus-page player sheet: grip, speed, back/forward 15, play, next track, one segmented bar for the whole book |

## HTML, data and developer files

| File | What is inside |
|---|---|
| `src/html/00-head.html` | `<head>`: boot skeleton, fonts, diagnostics |
| `src/html/10-body-views.html` | `<body>`, icons, the main screens, tab bar, player |
| `src/html/20-sheets-player.html` | pop-up sheets used by the player |
| `src/html/30-sheets-settings.html` | sound mixer, characters, quick controls, Settings sheets |
| `src/html/40-onboarding.html` | toast, audio element, first-run onboarding |
| `src/html/90-end.html` | closing tags |
| `src/data/amb-map.json` | map of ambience sounds (used by the sound mixer) |
| `src/dev/scene-tests.txt`, `scene-baseline.html` | Developer scene tests only. Left out of the public build; `python build.py --dev` includes them |
