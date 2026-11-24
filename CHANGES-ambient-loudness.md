# Ambient loudness: recordings and spot clips levelled to a reference (all eight steps, A to H, of the brief)

Status: all steps A to H are done in code. Nothing has been listened to (no phone, no browser here): see "Not tested" and the manual test at the end.

## Cause

`ambRecPrep` levelled each recording by the plain RMS of channel 0 over the whole spectrum, to one absolute target (0.12), with the gain held
between 0.15 and 5. Measured on the 12 real library recordings (speech band 300-4000 Hz, both channels, silence ignored), their speech-band
levels run from -18.6 to -32.7 dB, a spread of 14 dB. Levelling them the old way (estimated from each file's speech-band share) widens it to
about 19 dB: the mid-band sounds (rain, cafe, waves, river, brown) all end near -20 dB, the loud end, while bass-heavy ones (drone, fire, wind,
train) end 7 to 18 dB lower. Generated layers use their own hand-set levels, so the same sound changed loudness when switched between
generated and recorded. Six recordings also peak above 0 dBFS as delivered (river +1.1, train +1.0, fire +0.9, wind +0.6, cafe +0.5, rain +0.2).

## Fix

- A: `tools/ambient_prep.py` measures each recording offline and writes `sb` (speech-band level), `pk` (peak), `st` (loudest 3 s) and `sh`
  (speech-band share) into `recordings.json`, as `lufs` does for music. It downloads web addresses to a temporary file, so it works on the live
  list. A mono file is copied to both sides at full level (ffmpeg's own upmix reads 3 dB low). `--selftest` checks it on made-up sounds.
  `tools/check_audio_data.py` now also checks `recordings.json`. See `AMBIENT-RECORDINGS.md`.
- B: `ambRecPrep(buf, k, meta)` levels to the reference of the sound: speech-band level when `sb` is present, otherwise the plain RMS of BOTH
  channels as before. The 0.15..5 clamp is replaced by +36 / -40 dB limits and a +6 dBFS cap on the loudest sample. The manifest loader now
  passes the numbers through. All new code is inside try/catch; a failure plays the file unchanged.
- C: `AMB_REC_REF` holds, per sound, the speech-band and whole-sound level of its GENERATED layer. `tools/ambient_layer_levels.js` works them out
  from the real `AMB_LAYER` code (verified against a sample-by-sample simulation, within 0.1 dB), and a unit check fails if the table and the
  layers drift apart. Result: a hybrid switch keeps the speech-band level.

- D: spot clips (thunder, bell, creak, clock, heartbeat, steps, doors, slam) were normalised by peak (0.9 / peak), then given a hand-set volume.
  Peak does not describe loudness: a clip with one loud spike came out quiet, a steady one came out loud. Now `ambSpotLevel` measures the speech band
  (300-4000 Hz, both channels, silence ignored, same method as `ambient_prep.py`) of the part that plays, when the clip loads. `ambSpotGain` brings
  it to `AMB_SPOT_REF` (-22 dB, near the cafe bed) plus a small dB offset per sound in `AMB_SPOT_MAP`. The offsets replace `vol` and keep its order
  (0.7 = 0 dB, 0.6 = -1.3 dB, 0.5 = -2.9 dB). The loudest sample is held under the old ceiling (0.9 x vol), so a clip is never louder at its peak than
  before. The level is baked into the buffer, so playback gain is 1. With no usable level (silent or broken clip) it levels the peak as before.
  Measured in the app, not stored: the clips are short, and their index (`ambient-index.json` on R2) is not in this project.

- E: the dip under the narrator was the same for every sound (about -3.3 dB, carves of -10 dB at 3 kHz and -4 dB at 800 Hz), so a mid-band-heavy sound still masked
  the voice and a bass-heavy one was carved for nothing. `ambDuckVec` now takes today's values (`ambDuckBase`, unchanged) and scales the gain dip and both carves by a
  factor from the speech-band share of what is playing: each looping sound counts with its live gain (`AMB.g[k]`), a recording by its measured `sh`, a generated sound
  by the share worked out for its layer. Share 0.5 (average) gives exactly today's dip; share 0 gives 0.6 of it, share 1 gives 1.4 of it, in steps of 0.02. Only speaking
  and unknown are scaled; the pause, off and the timing ("dip fast, let go slowly") are untouched. Read at most every 150 ms; any error keeps today's dip.
  `AMB_REC_REF` moved from `ambient-recordings.js` to `ambient-scenes.js` so ducking can read it without a new file-to-file dependency (tangle_check unchanged).
  Real recordings alone: brown -4.2 dB dip / -12.4 dB at 3 kHz, rain -3.9 / -11.6, engine -3.3 / -10.0 (as today), wind -2.4 / -7.2, drone -2.0 / -6.0.

- F: nothing stopped a burst on the ambient bus. Six recordings peak above 0 dBFS as delivered, and the levelling can add up to +6 dBFS at the loudest sample. `ambBuild` now routes
  the mood stage through a safety limiter before the night shaping and the master volume. It is a soft clipper made with a waveshaper (`AMB_LIM`, `ambLimCurve` in ambient-engine.js):
  exactly the straight line up to the knee at 0.5 (-6 dBFS), a smooth bend above it, and a ceiling the curve never reaches (0.84 at full scale, 0.9 at most). A compressor node was not
  used on purpose: browsers add make-up gain to it, so it is not neutral below its threshold and that cannot be checked without a browser. No oversampling, so below the knee the signal is
  exactly as it was. Story sounds join after the limiter and are not touched. If the waveshaper cannot be made, the bus goes straight on as before. The music side is not touched.

- G: Smart mix is kept as the fine trim, for the ambient bus only (the music side, and every music test, is unchanged). The lowest ambient trim is now -18 dB (was -15, the top stays
  +9; saved trims of older versions stay valid and a saved -17 is no longer cut back to -15). The first move for a new book or a new set of sounds used to be at most 6 dB, 0.4 of the
  error; now, only for the ambient bus and only when the error is over 8 dB, the part above 8 dB counts twice as fast (continuous, no jump), up to 12 dB in one move. Below 8 dB it is exactly
  as before, and later steps are the same 1.5 dB ones. A start 14 dB off settles in 5 decisions instead of 6, 20 dB off in 6 instead of 10 (a decision is about 4 s of speech). The gain is
  modest because the steps after the first are unchanged. The spectral dip of step E does not fight it: Smart mix already takes the live dip out of its reading (`smxDuckDb`), so a deeper
  or shallower dip keeps its effect. Smart mix still needs the voice analyser; with ambient alone and no analyser the fixed balance in sound-core.js still applies only when music and ambient
  are both on, so there the protection comes from the levelling (B, C, D), the spectral dip (E) and the limiter (F).

- H: `tools/ambient_loudness_audit.py` shows, for each recording, its speech-band level, peak, the reference of its sound, the gain the app applies and the level it ends at,
  and flags any file more than 3 dB from its reference as delivered (or held back by a gain or peak cap). It reads the numbers stored in `recordings.json` (no network, no ffmpeg), or measures
  a folder of audio files named after the sounds (`--dir`, ffmpeg). The reference table and the limits are read from the app's source, so the tool cannot drift. `--compare` adds the old
  levelling as an estimate; `--strict` exits 1 when anything is flagged. `--selftest` checks its gain rule against the app's own `ambRecGain` on 648 combinations (largest difference 4e-15 dB).

### The audit on the 12 real recordings (the numbers measured with `ambient_prep.py`; dB, speech band)

| sound | delivered | reference | new gain | ends at | old gain (est.) | old ends at (est.) | old, off its reference |
|---|---|---|---|---|---|---|---|
| night | -29.7 | -31.2 | -1.5 | -31.2 | -2.7 | -32.4 | -1.2 |
| river | -20.1 | -24.7 | -4.6 | -24.7 | 0.0 | -20.1 | +4.6 |
| waves | -20.9 | -24.8 | -3.9 | -24.8 | +1.2 | -19.7 | +5.1 |
| rain | -21.2 | -19.6 | +1.6 | -19.6 | +1.2 | -20.0 | -0.4 |
| crowd | -19.0 | -27.8 | -8.8 | -27.8 | -1.5 | -20.5 | +7.3 |
| cafe | -22.0 | -21.8 | +0.2 | -21.8 | +1.8 | -20.2 | +1.6 |
| engine | -18.6 | -30.6 | -12.0 | -30.6 | -2.9 | -21.5 | +9.1 |
| train | -25.3 | -31.4 | -6.1 | -31.4 | -3.6 | -28.9 | +2.5 |
| fire | -31.0 | -27.9 | +3.1 | -27.9 | -4.4 | -35.4 | -7.5 |
| drone | -32.7 | -31.2 | +1.5 | -31.2 | -5.7 | -38.4 | -7.2 |
| brown | -21.1 | -21.8 | -0.7 | -21.8 | +1.7 | -19.4 | +2.4 |
| wind | -19.7 | -28.3 | -8.6 | -28.3 | -7.3 | -27.0 | +1.3 |

Flagged (more than 3 dB from the reference as delivered): river, waves, crowd, engine, train, fire, wind (7 of 12). Farthest from its reference: as delivered 12.0 dB; after the old levelling
9.1 dB (estimate); after the new levelling 0.0 dB. Spread of the speech-band levels: as delivered 14.1 dB, old levelling 19.0 dB (estimate), new levelling 11.8 dB (the spread of the references).
The "old" columns are an estimate: the old code measured only the left channel with no silence gate and its exact result cannot be reproduced from the stored numbers. The "new" columns are exact
(the same rule the app uses). "Ends at" is the level the rule aims for; it is what the app produces only if the file loads with its stored numbers.

## What changes for the listener (expected, not yet heard)

Gain each real recording gets (dB, relative to how it is delivered): rain +1.6, cafe +0.2, fire +3.1, drone +1.5, night -1.5, brown -0.7,
waves -3.9, river -4.6, train -6.1, crowd -8.8, wind -8.6, engine -12.0. Crowd, wind and engine drop most because the real recordings carry far
more mid-band energy than the generated versions (engine share 0.49 against 0.02). The engine recording may now sound weak in the bass: its
speech band matches the generated engine, but its whole-sound level ends about 15 dB under the generated one. If it does, raise `AMB_REC_REF.engine`.
The reference table is a judgement call: it follows the hand-tuned generated sounds, so rain and cafe sit louder in the speech band than drone and
engine. The brief expected the opposite ordering; changing it means changing `AMB_REC_REF` and the generated layers together.

## Checks run

`python build.py --no-min` ok; `node tools/startup_check.js` ok; `node tools/unit_check.js` 117 passed (76 before, 41 new); `node tools/smart_mix_check.js`
24 passed (18 before, 6 new); `python tools/tangle_check.py` fails exactly as before (same 11 lines; no new failure); `python tools/deps.py --check` was already out of
date and is now up to date (it also refreshed a few unrelated stale line counts).

## Not tested

Nothing in this change was heard. There was no phone, no browser and no audio device. What was checked: the arithmetic and the wiring (117 unit checks, 24 smart-mix checks, the build, the startup
check), the layer model against a sample-by-sample simulation, and the measuring tool on made-up sounds with known levels. What could NOT be checked, and needs a phone:
- That the levels sound right: the reference table follows the generated sounds, the spot-clip target (-22 dB) and the dip scale (0.6 to 1.4) are reasoned choices, not tuned by ear.
- The engine recording (turned down 12 dB; its overall level ends about 15 dB under the generated engine) may sound thin in the bass.
- The soft limiter on bursts (loud thunder at a high slider may sound slightly harsh), with no oversampling.
- That a real browser reads the audio gain nodes as the spectral dip expects, and that Smart mix settles as quickly in practice as in the simulation.
- Mobile browsers, background play, and the first seconds after a book starts (the saved list refreshes within 24 hours).
- The numbers were measured from the MP3 files as downloaded; a different decoder could differ by a fraction of a dB.
- The limiter was checked as maths and as wiring against a stand-in audio context, not heard. A burst above -6 dBFS on the bus is softened (distortion on the peak only); loud thunder at a
  high slider will sound slightly compressed. A soft clipper adds harmonics when it bites, and with no oversampling those can alias; they only occur on bursts. If that is audible on a phone,
  try `oversample = '2x'` in `ambBuild`, or lower the slider.
- The ducking factor (0.6..1.4, average share 0.5) is a reasoned choice, not tuned by ear. With a mix of several sounds the share is power-weighted, so a loud bass sound
  pulls it down. Listen to a book with rain alone, then drone alone, and compare how clearly the narrator comes through while speaking.
- The spot reference level (-22 dB) is a reasoned choice, not fitted to the real clips: the clips and `ambient-index.json` were not available. Clips with a
  low crest factor (steady rumbles) will come out quieter than before, spiky ones about the same. Measure the real clips and adjust `AMB_SPOT_REF`.

- Nothing was listened to. No phone, no browser: the audio graph was not run. The levels come from measurement and calculation only.
- The measure was checked on made-up sounds and the layer model against a simulation, not against a reference loudness meter.
- A list saved in a reader's browser before the numbers existed keeps the fallback for up to 24 hours (it refreshes by itself).
- `recordings.json` with the numbers must be uploaded to R2 for the numbers to reach the app. Until then the app uses the fallback.
- The built `dist/` was not regenerated for release; run `python build.py` yourself.

## Manual test (on a phone)

1. Upload the new `recordings.json` (with the numbers) to R2 and publish the new build. Close and reopen the app once (the list is cached for 24 hours; clear site data to force it).
2. Open a book with a clear narrator. Switch Settings > Audio to recorded sounds ("hybrid" or recordings). Set the ambient slider to the same position for every test (for example 50%).
3. Play each of the 12 recorded sounds ALONE, one after another, with the narrator speaking. For each, note how much it hides the words (not at all / a little / a lot) and whether it feels too quiet.
   Expected: no sound should stand far above the others, rain and cafe may still be the most noticeable, and drone, fire and night should be audible but never in the way.
4. Repeat steps 2 and 3 with a quiet narrator recording and then a loud one.
5. Switch one sound (rain, wind, engine) between generated and recorded at the same slider position: the loudness should not jump. The engine recording may sound thin; if so, raise `AMB_REC_REF.engine`.
6. Play a loud burst sound (thunder) at a high slider, and a spot clip (a bell, a door). Listen for a harsh or squashed sound on the burst.
7. Run `python tools/ambient_loudness_audit.py --recordings recordings.json --compare` before publishing a new recording: it should show no flag you do not expect.

## Merged with the later update (audio wake-up, listen-only, download-ahead)

This change was merged on top of the later version of the project (wordtrail-app_1.zip), by a three-way merge against the first zip. Your changes are all kept:
the shared audio wake-up (`CTXH`, `AUD_SUSP`, `audioSuspendCancel`, the `statechange` listener) in ambient-engine.js, the download-ahead of recordings (`ambRecWarm`, `AMB_WARM`, the 15 s retry
window) in ambient-recordings.js, `ambWarmReady` / `ambWarmKeys` in ambient-mix.js, the `timer: 0` removal from the `AMB` object, the listen-only mode and its checks. Where both changed the same file
the changes were in different places and merged without a conflict, except one line in ambient-scenes.js (the `AMB` object): your version of that line is kept and the reference table sits right after it.
`AMBIENT-RECORDINGS.md` was replaced by the longer version (the copy in the later zip was an earlier draft). `tools/ambient_prep.py` was already identical.
Checks on the merged project: `unit_check.js` 117 passed, `smart_mix_check.js` 24 passed, `audio_heal_check.js` 27 passed, `listen_only_check.js` 13 passed, `startup_check.js` ok, `build.py` ok,
`deps.py --check` ok. `tangle_check.py` prints exactly the same 13 lines as the later version without my changes (a leftover file and 7 new dependencies from the listen-only file; none from this change).
The download-ahead and the levelling work together by design (the saved file is levelled when it is decoded), but that path was not run in a browser.
