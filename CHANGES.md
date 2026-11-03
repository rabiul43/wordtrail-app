## Sound > Opening tab made clearer for new users
- The tab "Intro chime" is now "Opening". One switch, "Opening sound", controls everything on it; the title sound, volume, narration wait and preview sit in an indented group that is HIDDEN (not greyed out) while the switch is off, with one line saying why.
- A one-line summary at the top gives the order of events: title sound, then opening music, then narrator. It also says nothing plays when a book is resumed.
- The volume uses the same icon, filled track and % readout as the music volume (`osVolPaint`); its label no longer wraps.
- "Title sound" explains itself; its "Off" choice is now "None". "Narration after the opening" is now "Start reading after the opening".
- The round play button is now a labelled "Preview" button under "Try it now". The old "This book: Gothic (real clip, ...)" line reads "This book gets the Gothic mood . Music by Kevin MacLeod" (or "Made on your device").
- "Hear each mood" is now "Compare all opening moods", with a chevron and a one-line explanation inside.
- Files: `src/html/28-sheet-sound.html`, `src/css/96-sound-tabs.css`, `src/js/sound/opening-sound.js`, `sound-tabs.js`, `sound-core.js`.
- Bengali: the changed English strings fall back to English until `src/i18n/bn.json` is updated (listed in BN-REVIEW.md style).

# Changes in this version

## Download card: "Also save background music"
- src/js/281-book-download-card.js: a checkbox row on the "Listen offline" card. Ticked before Download, the music is saved after the audio finishes (not after Cancel or a full disk) and the size line shows both ("~824 MB + ~39 MB music"). On a book that is already saved, ticking it saves the music at once. The choice is remembered (`P.dlMusic`, off by default). Remove on the card removes the audio only: music clips are shared by all books.
- src/js/sound/music-offline.js: `musBookMoods` (neutral + the book's mood tags from moods.json + its genre, mapped to music moods), `musBookPlan` (a few clips per mood spread from quiet to busy, at most 40 MB per book, clips already saved cost nothing, never past the 100 MB keep limit), `musBookRun`; the clip saving loop is now `musSaveClips`, shared with the Music panel's "Download music for offline".
- src/js/sound/music-library.js: while offline, a mood with no saved clip borrows the nearest mood that has some (`musOfflineMood`, `musCacheScan`), so unsaved moods are not silent. `musGenreMood(b)` in music-moods.js now takes a book.
- Moods are read from the text while it plays, so the card can only save the moods a book is LIKELY to use. The number to check on your phone: the clip lengths in music.json decide the MB shown (16 KB per second is assumed, the same as the Music panel).

## Background worker: a stuck call no longer waits for ever
- src/js/040-worker-newreader.js, `BG`: the worker does one call at a time and only errors fell back to running the work on the main thread. A call stuck on bad data (a parse, a segment search, an alignment) never answered, and everything queued behind it waited too ("Preparing the text…" for ever). Now a watchdog runs while calls are waiting: if no answer arrives for 30 s, the worker is dropped (`fail()`, as for an error) and every waiting call runs here instead. The clock restarts at each answer, so a long queue of normal calls is never cut off, and it is not a fixed limit per call (a call waiting behind others is not counted as slow). After a hang the worker stays off for the rest of the visit (same as after an error); turning the setting off and on resets it.
- Checked with the real `BG` code and a fake worker (the limit scaled to 1.5 s): a worker that never answers makes two waiting calls run here after the limit and a later call run here at once; a normal worker still answers through the worker. `build.py`, `unit_check.js` (45) and `startup_check.js` pass. Not tested with a real stuck parse.

## Book text: a quiet combined request no longer holds the loading bar for 40 s
- The combined Worker request (`fetchBundle`, src/js/133-open-progress-saved-state.js) resolves the track list first and the Gutenberg text later in the same stream. If the stream went quiet after the track list, `getGutenberg0` waited for the text promise until the stream ended or the 40 s abort. Now it waits through `bundleWait`: the text promise records when the stream last delivered anything (`text.seen`, updated on every chunk), and if nothing has arrived for `BUNDLE_QUIET` (10 s) the wait gives up with null, so the usual routes (own copy, then the staggered routes) start. A slow but moving stream is still waited for; a finished one returns at once. The 40 s abort itself is unchanged.
- Checked with the real `bundleWait` code in a small timing test: silent stream gives null after 10 s, a slow stream that delivers at 14 s gives the text, a finished promise answers at once. `build.py`, `unit_check.js` (45) and `startup_check.js` pass. Not tested against the real Worker.

## Book text: a route that answers but then sends nothing no longer stalls the download for 30 s
- src/js/070-network-data.js, `fetchTextRace`: `alive` was set as soon as a route's headers arrived, which stopped any further route being added. If the body then never came (connection open, no bytes), the download waited for that route's 30 s (or 20 s) timeout. Now every answer and every chunk updates `lastProgress`, and a check every second adds the next route when nothing has answered, or when the answering route has sent no bytes for `TEXT_BODY_WAIT` (5 s). A healthy download still uses one route. Chunks are now always read through the stream reader (same text as before) so progress can be seen even when the caller shows no progress bar.
- Checked with a mock `fetch` (real function code): a route that sends headers and then nothing is replaced by the next route after about 5.5 s (before: up to 30 s); a normal download still uses one route. The progress bar itself is not changed. Not tested on a real network.

## Downloads: one retry when the saved-books list cannot be opened at start-up
- src/js/030-helpers-offline-audio.js, `dlReady`: if opening the audio database failed once at page start, `dlOk` became false for the whole visit and the saved-books map stayed empty, so a downloaded book was fetched from the network (and failed offline). It now tries once more after 1.2 s, and only then gives up. A browser without IndexedDB gives up at once. (A real "blocked" needs a database upgrade; the schema is at version 1, so the likelier causes are a busy or briefly failing database.)

## Player: a ring on the play button while the audio is buffering
- The play button kept its pause icon with no sign of a wait while the narrator audio buffered. Now, when `waiting` or `stalled` leaves the audio without data for 0.5 s, a ring turns around the main, mini and new-reader play buttons (class `buffering`, `aria-busy`), and goes away on `playing`, `canplay`, pause, end or error. The icon is unchanged (the listener still wants to hear it); a quick seek never shows the ring; saved copies never show it. src/js/205-audio-stall.js, styles at the end of src/css/97-controls-sheet.css (a still ring with reduced motion).
- Checked with a simulated audio element (7 cases) and the earlier stall simulation (14). Not seen on screen: check the ring is not clipped on the mini player and the new reader button.

## Update bar: the listening position is saved before "Reload"
- src/js/298-pwa.js: the "New version ready" Reload button now calls `persist()` before `location.reload()`, so the position is saved by the tap itself and does not depend on `pagehide` firing. Nothing in the app or sw.js reloads the page by itself (no `controllerchange` handler; `skipWaiting` / `clients.claim` do not navigate pages), so the bar is still only an offer.

## Opening sound: the wait for the opening can no longer hold the narrator for good, or end another book's wait
- src/js/sound/opening-sound.js, `osHoldBegin`: (1) the narrator was held until the opening's own timer was set, after `osPlay`; `osPlay` awaits `ctx.resume()`, which can stay pending on a suspended audio context, so no timer existed and only a tap on play released the narrator. A safety timer (8 s) now starts with the wait and is replaced by the normal one when the opening starts. (2) The `catch` called `osHoldEnd(true)`, which ends whatever wait is current; if the listener had paused and opened another book meanwhile, a late error from the old wait ended the new book's wait. It now acts only if the wait is still its own (`OSND.hold === hd`).
- Not changed: the 2.5 s `OSND.until` only controls when the background music may start; it does not release or extend the narrator wait.

## Audio: a broken saved copy can no longer leave the player waiting
- When a saved (blob:) track fails, the error handler in src/js/150-player-reader.js calls `dlBroken`, which reloads the track from the network (`loadAudio` sets `S.loadingAudio` again and `loadedmetadata` or the next error clears it). If `dlBroken` itself threw, nothing cleared the flag, so `nowT()` kept returning the saved position. The call is now wrapped: on a throw `S.loadingAudio` and `S.pendingSeek` are cleared. The normal path is unchanged.

## Audio: a stalled connection no longer freezes the narrator silently
- The narrator audio ignored `stalled` and `waiting` (only the sound files listened to them). On a weak mobile connection the play icon stayed on, the highlight loop kept ticking and the voice was silent, with no message and no retry. NEW src/js/205-audio-stall.js (registered in build.py after 200): if the audio should be playing but has no data for 8 s, one message is shown ("Weak connection. Waiting for the audio…") and the same track is loaded again at the same spot (through the existing `pendingSeek` / `loadedmetadata` path in 150). Up to 3 tries, 8 s, 12 s, 16 s apart; then it says the connection is too weak and stops. When the browser comes back online it tries once more; tapping play also starts fresh.
- Not retried: a paused or finished track, a track that is still loading after a track change or seek, a track that is moving forward slowly, and saved copies (`blob:`), which are local.
- Checked with a simulated audio element (14 cases: timing, position kept, one message, 3 tries then stop, online retry, recovery, paused, blob, loading, slow but moving). `build.py --no-min`, `unit_check.js` (45) and `startup_check.js` pass. Not tested on a real phone with a weak connection. The two new message texts are not in `src/i18n/bn.json` yet.

## Smart mix: automatic checks
- New `tools/smart_mix_check.js` (18 checks, no browser, no npm install): `node tools/smart_mix_check.js`. It runs the real `src/js/sound/smart-mix.js` inside a small pretend app, so it tests what ships. It covers the plan (dead-zone, 1.5 dB step, 6 dB first move, -15 .. +9 dB limits, slider offset, "both", dip lift), a closed loop that settles without swinging, the dip setting keeping its effect, the speech-band measure (a pretend analyser with a real spectrum), the trim of each scene and clip, learning from other books, saving, the 150-note limit and letting go of analysers.
- Checked that the checks can fail: widening the band, dropping the dip lift, a 3 dB step, a 9 dB first move, a +12 dB limit, no disconnect, no note limit and remembering every source each make at least one check fail; the real file passes all 18. Exit code 1 on a failure, 2 if the file cannot be loaded.
- Run it after any change to Smart mix, together with `build.py --no-min`, `unit_check.js` and `startup_check.js`.

## Smart mix: a longer look at each reading
- The analysers Smart mix reads (`smxTap` for the music and ambient buses in src/js/sound/smart-mix.js, `enh.mon` for the voice in src/js/150-player-reader.js) now use 2048 samples (about 43 ms) instead of 1024 (about 21 ms). Each reading is a little steadier and the speech band is cut out more cleanly. The analyser used by the sound-wave display (`vgraph`) is not changed.
- Checked in headless Chromium with the speech-band measure: 1 kHz and 2 kHz still read exactly their RMS (-9 / -23 dB); 100 Hz now reads -81 dB and 8 kHz -140 dB (outside the band; before: -69 and -135). `build.py --no-min`, `unit_check.js` and `startup_check.js` pass.

## Smart mix: the listener's own dip setting keeps its effect
- Smart mix read the music and ambient level after the dip under the narrator and aimed it at a fixed distance under the voice, so a deeper or lighter "Music dip" setting was quietly undone (the music got quieter, Smart mix turned it up again). Now the dip is taken out of each reading (`smxDuckDb`, from the gain of `MUS.duck` / `AMB.duck`) and the target is raised by the dip the bus normally has (`SMX_NOM`: music 0.28 = the Normal setting, ambient 0.68). src/js/sound/smart-mix.js.
- With the Normal dip the result is the same as before, so saved trims stay valid. A Quiet dip leaves the music about 4 dB louder under the voice while the narrator speaks, a Strong dip about 5 dB lower. With the duck switched off nothing is taken out or added.
- For the ambient bus this also removes the wander caused by the scene-driven dip (dialogue dips deeper than description). The 800 Hz / 3 kHz carve that goes with the dip is not removed from the reading, only the gain part; that part is small next to the gain.
- Checked in a closed-loop simulation with the pure function: the same trim (+6.1 dB) for Quiet, Normal and Strong dips and the level under the voice moves by +4.1 / 0 / -4.9 dB with the setting; duck off settles near the target. `build.py --no-min`, `unit_check.js` and `startup_check.js` pass. Not tested with real audio.

## Smart mix: no analyser left behind
- When a bus was rebuilt (`MUS.duck` or `AMB.master` became a new node), the listening-only analyser stayed attached to the old node, which kept feeding it. Now `smxTap` first lets go of the old one (`smxUntap`, src/js/sound/smart-mix.js), and switching Smart mix off removes both analysers.
- Checked with stub nodes: the same node twice makes one connection; a rebuilt bus disconnects the old node and connects the new one; switching off disconnects and clears. `build.py --no-min`, `unit_check.js` and `startup_check.js` pass. Not tested on a phone.

## Smart mix: old per-book notes are cleaned up
- Every book left a note `wt:smx:<id>` in the phone's storage, forever. Now the ids are kept in a list (`wt:smxidx`, newest last) and only the last 150 books keep their note; older notes are removed (`smxIndexTouch`, src/js/sound/smart-mix.js). Notes written by older versions are added to the list once when the page starts (`smxIndexInit`); `wt:smx:global` is never removed.
- These notes are not part of the account sync (its categories in src/js/295-account-sync.js do not match `wt:smx:`), so removing them cannot change anything in the cloud.
- Checked with a stub storage: old notes adopted, 165 notes cut to 150 with the oldest removed, other keys (`wt:prefs`, `wt:smx:global`) untouched, a book heard again moves to the end. `build.py --no-min`, `unit_check.js` and `startup_check.js` pass.

## Smart mix: what it learned is saved when the listener stops
- The per-book trims were saved at most every 10 s, only right after a move. A listener who paused or closed the app a few seconds after a change lost it. Now `smxSave` (src/js/sound/smart-mix.js) also runs on a pause, when the page is hidden (`visibilitychange`) or closed (`pagehide`), and when another book opens, so the last seconds of learning are kept.
- It saves only when something changed (`SMX.dirty`: a trim moved, or a remembered scene came back), so a pause with nothing new writes nothing. It saves under `SMX.book` (the book the trims belong to), not `S.book`, which may already be the next book.
- Checked with a stub store: nothing saved when clean, saved once when dirty, no repeat write, saved under the old book's id. The `audio` element (src/js/040-worker-newreader.js) exists before the sound files load. Not tested with a real pause or page close.

## Smart mix: the music and sound sliders stay free
- Before, switching Smart mix on set the two sliders to their usual position and locked them, so a listener who wanted a little more music had to switch Smart mix off. Now the sliders work all the time as "a little more or less than balanced": the target of each bus already followed its slider (`smxPlan`), so only the lock was in the way.
- Removed: `smxLock` (src/js/sound/smart-mix.js). Added: `smxFree`, which once puts back the slider values that the old version saved in `P.smxSaved` and removes that note, so nobody keeps a slider at a value they never chose. The sliders are no longer disabled or greyed by Smart mix.
- Text: the two Smart mix descriptions in src/html/28-sheet-sound.html no longer say the sliders are locked ("It sets the balance by itself. The music and sound sliders still work: move one for a little more or less than balanced."). The Smart mix text was not in bn.json, so no translation changed.
- Checked with the pure function: a slider at 20 / 40 / 60 / 80 % settles at about 6 dB lower / balanced / 3.5 dB higher / 6 dB higher than the balanced mix. Not tested with real audio.

## Smart mix: every scene and clip has its own trim
- One trim for the whole book was wrong for some scenes: a storm and a quiet forest are not equally loud. Smart mix now follows what is playing on each bus (`SMX.src`, src/js/sound/smart-mix.js): for the music the clip's file name, for the ambient sounds the (up to three) loudest sounds of the scene (so a change of intensity or night mode is not a new scene).
- When a source ends, the trim it settled on is remembered (needs 3 decisions; at most 12 sources per bus, the oldest go first). When a remembered source comes back its trim is put back at once. A new source is re-read quickly: 2 s of the crossfade ignored, then 2 s of readings (8 instead of 16), with the larger first move allowed.
- The trims are saved with the book (`wt:smx:<id>` gets `s: { mus: {...}, amb: {...} }`; `m` and `a` are now the average of them). The "learned from other books" average (`smxLearn`) uses that average too. Old saved books (only `m`, `a`) still load.
- Finding while reading the code: the music clips are already levelled by their LUFS gain (music-bus.js, -18 LUFS), so the music needed little; the ambient scenes are where this helps. A pre-measurement of the ambient scenes was not added: they are mixed from several sounds and change with intensity, so a measurement at load would not stay true.
- Checked with stubs: first entry keeps the book trim, a new scene gets a quick re-read, a returning scene gets its trim back at once, same scene at a slightly different level is not a change, a source left after fewer than 3 decisions is not remembered, the 12-entry limit. Not tested with real audio.

## Smart mix: a new book starts from what other books settled on
- A book Smart mix has never heard used to start at 0 dB trim and needed about 4-6 s of readings, then a first move of up to 6 dB, which was audible. Now it starts from `wt:smx:global`: a running average (last 8 books, each bus within +-6 dB) of the trims earlier books settled on. A book with its own saved trim (`wt:smx:<book id>`) still uses that.
- A book is counted once, when the listener leaves it (another book, or `pagehide`), and a bus only counts if it had at least 5 decisions, so a bus that was off, or Smart mix switched off, teaches nothing. Functions: `smxGlobal`, `smxLearn` in src/js/sound/smart-mix.js.
- Checked with a stub store: one count per book, a quiet bus ignored, an outlier held at the +-6 dB limit. Not tested with real audio.

## Smart mix: music and sounds are balanced as a pair
- When music and background sounds are both heard, each target sits a little lower (`SMX_BOTH`: music -2 dB, sounds -1 dB), so together they add up to about -18 dB under the voice, where one alone would sit. Before, each was aimed at its own distance and together they ended about 1.5 dB too loud.
- `smxPlan` has a new last argument `both`. "Both" means both buses had enough readings at the moment of the decision (so a silent ambient scene does not lower the music).
- Checked with the pure function: sum of the two targets = -18.2 dB under the voice. The 1.5 dB dead-zone means a start that is already within it moves only a little, so the effect shows mostly when the mix is off by more. Not tested with real audio.

## Smart mix: levels are measured in the speech band
- `smxDb` (src/js/sound/smart-mix.js) now reads the analyser's spectrum and counts only 300 - 4000 Hz (`SMX_BAND`), for the voice, the music and the ambient bus alike. Rumble and bass no longer count as much as the band that carries the consonants. The scale is calibrated to plain RMS, so the gates (-48 / -75 dB) keep their meaning. Without a float spectrum it falls back to the old whole-signal RMS.
- Checked in headless Chromium: a sine at 1 kHz and 2 kHz reads exactly its RMS (-9 / -23 dB); 100 Hz reads -69 dB and 8 kHz reads -135 dB (outside the band).
- Effect: bass-heavy music or ambient is turned up less aggressively to "keep up" and is no longer turned down for rumble the ear does not mind; hiss and mid-range noise now count in full. Because voice and background have different spectra, the distances `SMX_REL` (-18 / -22 dB) may need a small retune after listening on a phone. A rumble-only scene is lifted at most +9 dB (`SMX_LIM.hi`).

## Smart mix: the voice is measured as the listener hears it
- Smart mix used to read the narrator from `vgraph`, which taps the raw audio before the enhancement chain. The presets add make-up gain (clear +2 dB, restore +2.6 dB, lowq +3.5 dB, night +5.6 dB) and compression, so the voice was louder than Smart mix thought and the music sat too high.
- `enhBuild` (src/js/150-player-reader.js) now adds a listening-only analyser `enh.mon` after the limiter. Smart mix (src/js/sound/smart-mix.js) reads the voice there, and no longer adds the evener's gain by hand, because the heard tap already contains it. If `enh.mon` is missing it falls back to the old way (vgraph + evener gain).
- Effect: with an enhancement preset on, the music and sounds now settle lower (by about the preset's make-up gain). With the preset off nothing changes. Not tested with real audio on a phone.

## Opening tab: "Narration after the opening"
- New switch in the Opening (Intro chime) tab, off by default (`P.openWait`). When on, and a book starts from the beginning with the opening on, the first `audio.play()` is held. The opening plays alone (title sound, then music); the narrator starts when the music is halfway down its fade (about 22 s with the chime, 21 s without), so the music sinks under the first words.
- Tap play during the wait = skip the opening (it fades in 0.8 s) and start the narrator now. A pause, another book, no sound (volume 0, sound blocked) or a failed opening ends the wait; with no opening the narrator starts at once. A short toast says "Opening first. Tap play to skip."
- src/js/sound/opening-sound.js: `osGateInstall` wraps `audio.play` and `audio.pause`; `osHoldWanted`, `osHoldBegin`, `osHoldEnd`; `osOnEmptied` ignores the book's own source change while the narrator waits.
- src/js/140-open-book.js: `osArm` now runs before `loadAudio` (it used to run after), because the autoplay `play()` inside `loadAudio` must already know the opening is armed. Nothing else in openBook changed.
- sound-screen.js / sound-core.js: `openWait` joins the sound reset keys and the switch sync. bn.json: 3 new entries.
- While the narrator waits, the play button still shows "play" (the audio really is paused); stats, sleep timer and the story music do not run yet.
- Needs the browser to allow `play()` from a timer. Chrome on Android normally does after a tap; if refused, the app shows "Tap play to start." and a tap starts the narrator.
- Test: `python build.py --no-min`, the three checks in tools/, `python tools/i18n_check.py bn`. Not tested on a real phone.

## Opening tab: title sound (chime or page turn)
- src/js/sound/opening-sound.js: a short sound plays just before the opening music: two soft bells (C6, G6) or a page turn (swish, paper, soft thud), both made on the device. The music starts 1.3 s (chime) or 0.9 s (page turn) after it. Everything that depends on the opening's length (the background music waiting, the final stop timer) moved by the same amount. Stopping or pausing fades the title sound too.
- Choice in the Opening tab: "Title sound" = Chime (default) / Page turn / Off. Changing it plays a short try-out. Saved as `P.openChime`; reset with the other sound settings. Off = exactly the old behaviour.
- The title sound is part of the opening, so it only plays when a book starts from the beginning and follows the Opening switch and volume. The "Hear each mood" previews leave it out; the "hear" button next to the switch includes it.
- src/css/96-sound-tabs.css: 44 px select. src/i18n/bn.json: 4 new Bengali entries.
- Test: `python build.py --no-min`, the three checks in tools/, `python tools/i18n_check.py bn`. Not heard on a phone.

## Opening tab: "Hear each mood"
- src/html/28-sheet-sound.html: a collapsed "Hear each mood" list under the Opening (Intro chime) note.
- src/js/sound/opening-sound.js: one row per mood (Gothic, Mystery, Romance, Adventure, Fantasy, Children, Science fiction, Classic drama, Calm) with the clip title and artist this book would get, the current book's mood marked "This book", and a play/stop button. Tap again to stop; tapping another mood switches; two quick taps play only the last.
- A preview does not mark the clip as played (the background music is not affected) and does not make the music wait. The old "hear" button next to the switch is also a preview now.
- src/css/96-sound-tabs.css: 44 px buttons and summary. src/i18n/bn.json: 5 new Bengali words (Hear each mood, Gothic, Science fiction, Classic drama, Calm).
- Test: `python build.py --no-min`, the three checks in tools/, `python tools/i18n_check.py bn`. Not seen on a phone.

## Opening sound: smoother ending
- src/js/sound/opening-sound.js: the opening now holds, then sinks over 6 s along a soft cosine curve (24 small steps), instead of 4.5 s along a straight line. New constant `OS_FADE = 6`.
- Background music may now start halfway down the fade (about 3 s before the opening ends, never earlier than 6 s), so the two do not overlap loudly.
- The fade is made of normal ramps, so pausing or stopping in the middle still cancels it cleanly. The fade-in (1.5 s) is unchanged.
- Test: `python build.py --no-min`, then the three checks in tools/. Not heard on a phone yet.

## Opening sound: real clips from the music library
- src/js/sound/opening-sound.js: each book mood (Gothic, Mystery, Romance, Adventure, Fantasy, Children, Drama, Sci-fi, Calm) now plays a real clip. A clip listed in `openings.json` on the music host (optional) wins; otherwise a clip from `music.json` is taken from the calmer half of a matching library mood (Gothic = dread, Mystery = tension, Romance = romance, Adventure = danger/chase, Fantasy = wonder, Children = merry, Drama = sorrow, Calm = peace). The same book always gets the same clip. If nothing can be loaded, the old made-on-the-device sound plays.
- `openings.json` is now read from `MUS_HOST` (Cloudflare), not GitHub. Saved copy key changed to `wt:osmap2`.
- Only the first 24 s of a clip are kept in memory after decoding. Clips use the same `wt-music` cache as the background music, so offline music downloads also cover openings.
- The opening clip is marked as just played, so the background music does not start with the same song.
- src/js/sound/music-playback.js: the Now playing "Opening" row also shows title and artist (CC BY credit).
- Test: `python build.py --no-min`, `node tools/unit_check.js`, `node tools/startup_check.js`, `node tools/music_mood_check.js`. Not tested on a phone with the real Cloudflare music list: open a book from the start with Sound on and Opening on.

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

## Book colour stays after closing the book
- The app keeps the accent colour of the last opened book on every screen (Home, Library, Stats, tab bar) after the book is closed, until another book is opened. Before, `showView` cleared it when leaving the player.
- Remembered across restarts: `wt:accLast` (hue/saturation of the last book) and `wt:accCss` (ready-made colours + theme key). An early script in `src/html/00-head.html` paints `wt:accCss` before the app loads, only if the theme matches; `restoreAccent()` (`100`, called in `300`) repaints it exactly.
- Settings "Book colors" off = default gold everywhere; on again = last book's colour returns.
- The accent fades for 0.45 s when the book changes (`@property` + `html.acc-fade` in `10-base-layout.css`; off for reduced motion and calm mode).
