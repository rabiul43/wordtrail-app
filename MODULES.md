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
| `030-helpers-offline-audio.js` | 328 | helpers, feature guide registry, offline audio, Download management |
| `040-worker-newreader.js` | 149 | background worker, new reader |
| `050-audio-clips.js` | 358 | audio clips |
| `060-position-bookmarks.js` | 241 | position recovery |
| `070-network-data.js` | 556 | network, local catalog, text-analysis data, reading level, which books are pre-synced, moods.json and similar.json, best version |
| `080-ui-shell-favourites.js` | 234 | toast, status, views, feature guide, remember the last tab and scroll position, favourites |
| `090-synced-stats-book-search.js` | 701 | Synced tab, Listening dashboard, Reading analytics, Offline search inside books |
| `100-home-covers.js` | 280 | home constants (featured IDs, genres, cache TTLs), cover art, Standard Ebooks covers, per-book accent colour, cover style |
| `101-home-tiles.js` | 163 | tiles, "Show more" tile, skeleton tiles, pull to refresh, fill a row, stale-while-revalidate helper |
| `102-home-sections.js` | 215 | one book per row per screen, Featured, Recently added, genre chips and results |
| `103-browse-filters.js` | 250 | browse filters (length, mood, language, narrator, level, sort, minimum rating), filter panel. Declares `LF` |
| `104-see-all-suggestions.js` | 137 | "See all" button and page, empty/error states, recent searches, live suggestions while typing |
| `105-home-loaders.js` | 209 | home loaders (book of the day, trending, new this week, collections shelves), genre shelves, Customise home |
| `110-collections.js` | 238 | Collections tab |
| `120-search-recommendations.js` | 568 | home search and recents, search filters, Search by meaning, "Because you listened to ...", mood rows, time-of-day card |
| `130-book-detail.js` | 193 | Book detail page, Follow an author, Wikipedia bio and background, similar books |
| `131-book-stats-share.js` | 151 | Book stats on the details page, start/finish sending, share button |
| `132-author-page-resume-card.js` | 95 | Author page, large "pick up where you left off" card |
| `133-open-progress-saved-state.js` | 226 | opening progress, combined /book request, saved state of a book, heartbeat |
| `134-version-picker.js` | 271 | in-player version picker, 20-second sample by another reader, moving the position to the new recording |
| `135-ratings.js` | 492 | Ratings and one-line reviews: 1-5 stars and an optional 140-character review per signed-in user per book, the average, star breakdown and latest reviews on the book page, `ratePrompt` for the Finish card, and the per-session ratings summary for tiles and lists (`rtSumLoad`, `rtInfo`, `rtChipText`), `rtCmp` (order by rating, used by the Top rated sorts and the minimum-rating filter in `100`), the Account-tab lists "Your ratings" and "Finished, not rated yet" (`renderMyRatings`; kept in `wt:myrt`, synced), the All reviews page (`openReviews`, `drawReviews`; a layer on the book page via `DET.rv`), and the review menu (report sheet `#sheet-report`, `rtReport`; edit/delete own review). Firestore `ratings/{bookId}` (rules in `firebase/firestore.rules`). Uses `acLoad`, `acInfo`, `acSignIn`, `acDb` from `295` |
| `140-open-book.js` | 726 | opening a book, parsed-book cache, plan + reader, intro/outro cuts, free chapter summaries |
| `150-player-reader.js` | 721 | Finish-and-Continue card (with the "How was it?" rating box from `135`), following the highlight, word-level highlight, Dialogue marking, audio, Sound-wave visualizer, Audio enhancer |
| `160-learning-tools.js` | 346 | sentence translation, book vocabulary, Review, Pronunciation, reading-only mode, gesture hint |
| `170-sync-points-drift.js` | 344 | sync points, pause map, drift auto-correct |
| `180-sync-alignment.js` | 468 | background alignment, Precise timing from speech recognition, Whole-book alignment |
| `190-sync-finish-retry.js` | 645 | finished sync saved and shared, match percentage per track, retry one track, "Sync this book" / syncNow |
| `200-player-controls.js` | 488 | how sure the highlight is, sleep timer, speed, media session, shake to extend the sleep timer, lock screen, keep the screen on while a book is open, Highlights, notes and quote cards, app language and right-to-left layout (words live in `src/i18n/<code>.json`, one file per language (joined into `#i18n-data` by `build.py`; check with `python tools/i18n_check.py xx`); engine also translates numbers with units (`units` in the language file: "5h 10m", "45 min ago"), optional native digits (`digits`, Settings > Reading), placeholder/aria-label/title and loads Noto Sans Bengali lazily for bn; Bengali review list in `BN-REVIEW.md`) |
| `230-scene-words.js` | 350 | scene detection: places, weather, time and mood tables, the word lists |
| `231-scene-scoring.js` | 226 | negation and endings, weather strength, quoted speech, genre priors, choosing and keeping a place/name |
| `232-scene-test.js` | 150 | Scene test (Settings > Developer) |
| `233-scene-chapters-label.js` | 111 | chapter titles and look-ahead, scene label on the mini-player |
| `246-controls-search.js` | 69 | Controls sheet search box (Enter opens the one match), section nav that follows the scroll, keep highlighted line in view |
| `247-player-menu.js` | 112 | Player menu: the three-dot button opens a dropdown (Timing, Text and reading, Live translation, Tracks, Settings, then "More" that opens Listen / Book / Fix rows in place, and "All controls" for the Controls sheet). Rows pass their tap to the existing buttons (markup `#dmenu` in `30-sheets-settings.html`, styles at the end of `97-controls-sheet.css`) |
| `250-characters.js` | 501 | characters |
| `260-audio-effects.js` | 367 | Finer speed, silence skipping, voice boost, Loudness evener, Mono and left/right balance, lock screen / notification artwork, "Skip intro" button |
| `270-sheets-nextup-back.js` | 276 | sheets, Pre-sync, Next up, Back button / swipe-back |
| `280-downloads-progress.js` | 728 | download a book for offline listening, auto-download the next tracks, chapter progress, whole-book progress |
| `290-backup-maintenance.js` | 337 | Backup and restore, sync dashboard |
| `295-account-sync.js` | 488 | Account sign-in (Google, Firebase) and cloud sync of settings, favourites, bookmarks, progress. Uses `storeHook` from `030` |
| `298-pwa.js` | 61 | Registers the service worker (`src/pwa/sw.js`) after the page loads, and keeps the browser/status-bar colour (`theme-color`) equal to the current theme's background |
| `300-wiring.js` | 715 | wiring |
| `999-app-close.js` | 2 | Closes the app closure `})();` |

## Sound files (`src/js/sound/`)

All sound code lives in one folder, **one feature per file**, named by feature (`music-`, `ambient-`, `opening-`, `story-`, `sound-`). They are slices of the same closure as everything else; the order is set in `build.py`. The first group loads right after `200-player-controls.js`, then the scene files (`230`-`233`), then the last five (`sound-presets` to `sound-tabs`) before `250-characters.js`.
Which file to open: add a **music mood word** -> `music-moods`; add a **story trigger word** -> `story-rules` (and its sound in `story-sounds`); add an **ambient sound** -> `ambient-scenes` (list) + `ambient-layers` or `ambient-synth` (how it is made); change the **Sound screen** -> `sound-screen`, `sound-presets`, `sound-tabs` and `src/html/28-sheet-sound.html`.

| File | Lines | What is inside |
|---|---|---|
| `sound/music-state.js` | 48 | Music: the `MUS` state object, local test mode |
| `sound/music-moods.js` | 98 | Music: scene mood -> music mood, the finer moods and their word lists (en/bn), genre mood. Edit here to add mood words. `tools/music_mood_check.js` tests this file |
| `sound/music-bus.js` | 64 | Music: loudness normalising, volume and audio bus, ducking under the narrator |
| `sound/music-library.js` | 123 | Music: music.json (manifest), queue, choosing the next clip, fetching and caching clips |
| `sound/music-playback.js` | 271 | Music: scheduling and crossfades, resume after a pause, switching mood, stop, play/pause |
| `sound/music-offline.js` | 136 | Music: "Download music for offline" |
| `sound/music-wiring.js` | 77 | Music: engine health, the Music switch, first-time hint, quick controls, `musicInit` |
| `sound/music-credits.js` | 47 | Music: credits list (title, artist, licence) |
| `sound/ambient-scenes.js` | 77 | Ambient: `AMB` state, `AMB_SOUNDS` (the list of sounds), groups, scenes and rules from `amb-map.json`, book suggestion, scene cards |
| `sound/ambient-synth.js` | 72 | Ambient: sounds made on the device: noise, reverb, raindrops, rain, rolling thunder, room mix |
| `sound/ambient-engine.js` | 68 | Ambient: indoor/outdoor detection, `audioCtx` (the ONE AudioContext of the app), `ambBuild` |
| `sound/ambient-layers.js` | 106 | Ambient: how each sound layer is made (`AMB_LAYER`), layer on/off |
| `sound/ambient-recordings.js` | 119 | Ambient: real recordings instead of generated sound |
| `sound/ambient-mix.js` | 45 | Ambient: apply the mix, volume, master, save the mix, reset on a new book |
| `sound/ambient-ducking.js` | 85 | Ambient: dip under the narrator's voice |
| `sound/ambient-events.js` | 132 | Ambient: slow movement, random one-off sounds (birds, creaks, bell, crackle, thunder) |
| `sound/opening-sound.js` | 155 | Opening (intro chime): mood of a book, clips, synth fallback, play on start |
| `sound/story-rules.js` | 74 | Story sounds: which word triggers which sound (`CUE_RULES`). Edit here to add a trigger word |
| `sound/story-sounds.js` | 177 | Story sounds: how each sound is made (`CUE_SOUND`) |
| `sound/story-engine.js` | 66 | Story sounds: categories, finding trigger words, playing them on the audio's own clock |
| `sound/story-transitions.js` | 65 | Story sounds: door, gate and footstep sounds when the place changes |
| `sound/ambient-intensity.js` | 32 | Ambient: intensity, the levels really played (`ambLive`), night and time of day |
| `sound/sound-presets.js` | 81 | Sound screen: hear a sound, quick presets and undo |
| `sound/sound-core.js` | 39 | Sound screen: master switch and volume (`sndOn`, `sndMul`, `sndPaint`, `sndApplyAll`) |
| `sound/sound-cache.js` | 59 | Sound: size cap, keep list and clear for saved music and recordings |
| `sound/sound-screen.js` | 164 | Sound screen: reset, mixer rows, "My own words", `ambSync`, `ambInit` |
| `sound/sound-tabs.js` | 47 | Sound screen tabs (Ambient, Music, Opening, Story), the dot on a tab when a layer is on, the dimmed look while Sound is off (styles in `src/css/96-sound-tabs.css`) |

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
| `97-controls-sheet.css` | Controls sheet polish: section nav, panel arrows over the 4-tile row, 3-column Read and Book tiles, bigger slider buttons and tick labels |

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
| `src/html/28-sheet-sound.html` | The Sound sheet (`#sheet-amb`: tabs Ambient, Music, Intro chime, Sound effects). Loaded just before `30-sheets-settings.html` |
| `src/dev/scene-tests.txt`, `scene-baseline.html` | Developer scene tests only. Left out of the public build; `python build.py --dev` includes them |
