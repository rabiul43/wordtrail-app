# Ambient and music going silent, coming back, going silent again

Seen at night while listening to a book, probably with the screen off. **The cause below is the most likely one, not proven on a device.**

## Cause

1. The ONE shared AudioContext can become `suspended` or `interrupted` (screen lock, call, notification, another app). The only wake-up (`musCtxHeal`) worked only while music was wanted. Ambient-only had none: its only resume was in `ambSync()`, which runs on narrator audio events. So ambient stayed silent until a random audio event woke it, then the context was taken away again.
2. Ambient (`ambPlaying`) and music (`musNarrating`) needed `audio.readyState > 2` at every reading. One short buffering dip (`waiting`, `stalled`) faded the ambient out at once, stopped the music (`musicPause`, then `musStop`) and, about 2.6 s later, suspended the context. Every small dip was a full stop and restart.
3. `audioSuspendSoon(ms, key)` kept its timer in `AMB[key]`. Music passes `'sTimer'`, so its timer was `AMB.sTimer`, but `musSwitchMood` cleared `MUS.sTimer`, which was never set. A stale suspend timer was never cancelled. The guard in the timer (`!AMB.on && !musicActive() && !AMB.narr()`) hid this, but it was fragile.

## Fix

**A. A shared wake-up that does not depend on music** (`sound/sound-screen.js`)
- `ctxHeal()` resumes the shared context only while sound is wanted. The rule is the pure function `ctxWantedFor`: Sound on AND the narrator really heard (`ambPlaying()`: not paused, ended, failed, in focus mode or loading a recording) AND (ambient wanted OR music wanted OR the narrator running through the graph). "Ambient wanted" follows `ambSync`: the bed (ambient on, with scenes on or a level above 0) or the effects (cues on).
- It runs on the context's `statechange`, `visibilitychange` (when shown), `pageshow` and the narrator's `playing`.
- If `resume()` is refused or the state does not reach `running`, ONE tap/key listener (`ctxGestureArm`) retries and removes itself, like the old `musGestureArm`.
- A state that flips back at once cannot loop: a second try within 400 ms waits for one delayed retry.
- The `statechange` listener is added ONCE, with `addEventListener`, in `audioCtx()` (`sound/ambient-engine.js`) and calls `CTXH.fn` (set to `ctxHeal` in `ambInit`). The listener in `musicAttach` (and its `onstatechange=` fallback) is gone.
- `musCtxHeal` keeps its rule (`musWanted`: music on, Sound on, narrator heard, a clip sounding or loading) and now calls `ctxHeal`. `musGestureArm`, `musHealInit` and `MUS.gest` are removed: `ctxHeal` serves the same triggers.

**B. Grace for short buffering dips** (`sound/music-bus.js`, used by `ambPlaying` in `sound/sound-screen.js`)
- `sndHeard()` counts a `readyState <= 2` that lasts under 2 s (`SND_HOLD_MS`) as heard. The pure part is `sndHeardCalc(ready, loading, last, now, ms)`.
- `SNDHOLD.at` is the last good reading. Every good reading sets it, and so do `timeupdate`, `playing` and `canplay` while the voice really moves.
- When a reading is held by the grace, one timer re-checks when the grace ends and fires a private `wt-sndhold` event on the audio element, which `ambSync` and the music follower already listen to. So a real stall still stops the sound, and no extra audio event is needed.
- NOT held, as before: pause, ended, error, a recording loading (`S.loadingAudio`), focus mode (`SND.focus > 0`). `pause`, `ended`, `error`, `loadstart`, `emptied` and `abort` clear the stamp, so a new track never inherits grace. The seek rule is unchanged.

**C. Suspend timers** (`sound/ambient-engine.js`)
- `audioSuspendSoon` now keeps its timers in its own store `AUD_SUSP` (`timer` = ambient, `sTimer` = music), and `audioSuspendCancel(key)` cancels one, or both with no key.
- Both are cancelled whenever sound is wanted again: in `ambSync` (when it wants the engine), in `musSwitchMood`, and in `ctxHeal`.
- `MUS.sTimer` and `AMB.timer` were never really used and are removed.

## Files changed
`src/js/sound/ambient-engine.js`, `music-bus.js`, `music-wiring.js`, `music-playback.js`, `music-state.js`, `ambient-scenes.js`, `sound-screen.js`; new `tools/audio_heal_check.js`; `MODULES.md`; `DEPENDENCIES.md` (regenerated with `python tools/deps.py`; it was already out of date before this change, so a few unrelated lines refreshed too).

## Not changed (as asked)
Ducking, smart mix, scene detection, `205-audio-stall.js`. The narrator graph's own `statechange` heal in `150-player-reader.js` stays: it keeps the narrator's sound alive even with Sound off, so the context has two listeners, mine for ambient and music, and that one for the graph. Both call `resume()`, which is harmless on a running context.

## Checks run
- `node --check` on every changed file; `python build.py --no-min`.
- `node tools/unit_check.js`: 76 passed (same as before). `node tools/startup_check.js`: ok.
- `python tools/tangle_check.py`: output identical to before the change: the same one leftover file (`168b-hard-words.js`) and the same 5 older dependencies; no new dependency between files.
- `node tools/audio_heal_check.js`: 27 passed. It runs the REAL functions from the source against a fake clock, a fake audio element and a fake AudioContext. It covers the grace rule and the wanted rule as pure functions, the real stop paths, the heal (resume when wanted, nothing when paused / Sound off / nothing to play / focus mode, one tap listener, no loop), and the suspend timers. Checked that it fails when each fix is taken out (grace off, timer key bug back, narrator-paused rule dropped).
- Real Chromium (headless, desktop): the built app starts without JS errors; opening the Sound sheet and previewing a scene makes ONE context with ONE `statechange` listener; after an OS-style `suspend()` with no book playing the heal correctly does nothing.

## NOT tested
- A real phone: screen lock, a call, a notification, another app taking the sound, Safari's `interrupted` state, whether the browser accepts `resume()` without a tap while the page is hidden.
- A real book playing in a browser with a throttled network (the grace and the heal were tested only against fakes).
- Not covered by design: the opening sound while the narrator is still waiting or paused. The wake-up needs the narrator really playing, as specified, so it does not resume an engine for a paused book.
- The 2 s grace value is a judgement. If dips on your network are longer, raise `SND_HOLD_MS` in `sound/music-bus.js`.

## Manual test
1. Ambient only (Music off): play a book, lock the screen for a few minutes, unlock. Ambient should keep playing, or come back at once on unlock.
2. Same with Music on.
3. Throttle the network (browser dev tools or a weak connection) so the book buffers briefly. A dip under about 2 s should not fade the ambient or stop the music. A real stall longer than that still should.
4. Pause the book: ambient and music stop as before, and the engine is suspended a few seconds later.
