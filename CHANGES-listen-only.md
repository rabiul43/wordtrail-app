# Listen-only screen (tracks with no text)

Settings > Reading > **Listen-only screen** (`P.listenOnly`, default on). A track with no text is no longer shown as a problem.

When it applies: the book HAS a text, this track has none lined up, the track length is known, and timing is not loading or failed.
(Timing loading keeps its wait note; timing failed keeps "Try again"; a book with no text at all keeps its own card with the Step 1 to 3 choices.)

What shows (phones and tablets under 900 px)
- Header: "Track 1 of 32 · audio only" (was "no text").
- Round cover inside a progress ring (moves on the audio's own timeupdate, nothing per frame). The disc turns slowly and the small wave moves only while playing.
- One quiet line "No text for this track. Just listen." with an **Add text** link (opens the same text sheet).
- **Up next** card: next track title, "All N tracks" (opens the Tracks sheet) and a strip of tracks (max 48 segments, grouped for long books).
- "Text only" chip hidden. The dock (seek bar, speed, 15 s, play, sleep) is the normal one, so seeking stays on the bar.
- Desktop (900 px and up): the cover stays in its side panel; only the quiet note and Up next card change.
- No motion under reduced motion, Calm mode or the light-effects setting.
Switch off: the old note with the gold "Choose text" button returns at once.

Files
New: `src/js/155-listen-only.js`, `src/css/99t-listen-only.css`, `tools/listen_only_check.js`, this file.
Changed: `build.py` (2 lines), `src/js/150-player-reader.js` (2 hooks), `src/js/140-open-book.js` (header words + 1 hook), `src/html/10-body-views.html` (`#lo-wave`), `src/html/30-sheets-settings.html` (switch), `src/i18n/bn.json`, `MODULES.md`, `DEPENDENCIES.md`.
Not touched: the dock, sync, text loading, the no-Gutenberg card (140 attachText), downloads.

Checks run: `node tools/listen_only_check.js` 13/13, `python tools/deps.py`, `python build.py`, `node tools/startup_check.js` OK. A headless Chromium screenshot (390 px, Black theme) matched the mockup.
`python tools/tangle_check.py` lists 7 new couplings, all from 155 and its two hooks. Run `--accept` if you are happy with them.

Test on a real phone
1. Open a book where a track has no text (Northanger Abbey Version 5, track 1): round cover, ring, quiet line, Up next card.
2. Play: ring grows, disc turns, wave moves. Pause: both stop. Drag the dock seek bar: ring follows.
3. Tap Add text, All N tracks, then go to a track WITH text: normal reader returns, Text only chip is back.
4. Settings > Reading > Listen-only screen off: old note returns. On: new look returns.
5. Calm mode or reduced motion on: no turning disc, no moving wave.
6. A book with no text at all: its own card is unchanged.
