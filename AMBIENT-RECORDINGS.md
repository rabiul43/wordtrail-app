# Ambient recordings: the data file and the loudness numbers

Real ambient sounds (rain, wind, cafe ...) are listed in `recordings.json` in the data repo (the R2 bucket named by the
`sounds` address in `hosts.json`). The app downloads the list, then each file when its sound plays (`sound/ambient-recordings.js`).
Music works the same way with `music.json` and its `lufs` field; this file is the ambient twin.

## recordings.json

```json
{
  "rain": { "file": "rain.mp3", "by": "Author name", "license": "CC0",
            "sb": -46.2, "pk": -27.3, "st": -45.1, "sh": 0.28 }
}
```

`file`, `by` and `license` are written by hand. The four numbers are written by `tools/ambient_prep.py`; do not type them.
All levels are dB relative to full scale (0 is the loudest possible, so every number is negative).

| field | what it is | what it is for |
|---|---|---|
| `sb` | speech-band level: 300-4000 Hz, both channels, silence ignored | the loudness the app levels by (like `lufs` for music) |
| `pk` | sample peak of the whole file | a safety cap on the gain |
| `st` | loudest 3 seconds of the speech band | how bursty the sound is (thunder, crackle, crowd) |
| `sh` | share of the energy that sits in the speech band, 0 to 1 | how much the sound hides a voice; used to size the ducking |

The speech band is where consonants live, so it is the part of a sound that hides the narrator. A bass-heavy drone can have a
high plain RMS and still hide very little; a quiet rain can hide a lot.

A file without these numbers still plays: the app falls back to a rough measure taken while the file loads (this is also what a
reader's own test file gets, since it never has numbers).

## Adding or changing a recording

1. Put the audio file in the data repo and add its `file`, `by` and `license` to `recordings.json`.
2. `python tools/ambient_prep.py --data-dir ../wordtrail-data` measures the files that have no numbers yet and writes them in.
   Use `--all` after replacing a file, `--dry-run` to look without writing. Nothing is re-encoded; credits are kept.
3. `python tools/check_audio_data.py --data-dir ../wordtrail-data` lists anything missing (files not on disk, no numbers, no credit).
4. Commit and push the data repo. The app picks it up within a day (it keeps the list for 24 hours).

`file` may be a path inside the data repo or a full web address (the live list uses full R2 addresses). A web address is
downloaded to a temporary file, measured and deleted, so the tool needs internet for those; keep `recordings.json` in the folder
you pass as `--data-dir`.

Needs `ffmpeg` and `ffprobe` on the PATH. `python tools/ambient_prep.py --selftest` checks the measure on made-up sounds
with known levels (needs ffmpeg only, no recordings).

## How the measure works

ffmpeg decodes to 44.1 kHz stereo; a mono file is copied to both sides at full level (ffmpeg's own upmix would lower it by 3 dB).
The sound goes through a 300 Hz high-pass and a 4 kHz low-pass (second order, the same shape as the browser's own filters).
Power is taken in 100 ms blocks with the two channels averaged. Blocks below -70 dB are dropped, then blocks more than 20 dB
under the average of the rest, so quiet gaps do not pull the level down. `sb` is the average power of what is left.

## How the app uses the numbers (sound/ambient-recordings.js)

When a recording loads, `ambRecPrep` levels it with `ambRecGain`:

- With a measured `sb`: gain = reference speech-band level of that sound minus `sb`.
- Without one (the reader's own test file, or a list saved before the numbers were added): the plain level (RMS, both channels) is matched to the
  whole-sound level of the generated layer. This is the old behaviour, but it now reads both channels and has a reference per sound.
- Limits: the gain stays between +36 and -40 dB, and never pushes the loudest sample past +6 dBFS (`AMB_REC_LIMIT`).

The reference per sound (`AMB_REC_REF`, in `sound/ambient-scenes.js`) is the level of the GENERATED layer of the same name, so a sound keeps its loudness when it switches
between generated and recorded (Settings > Audio > Hybrid). Work the numbers out with:

    node tools/ambient_layer_levels.js                         the generated levels
    node tools/ambient_layer_levels.js recordings.json         and the gain each recording needs to match them

The tool runs the real layer code from `sound/ambient-layers.js` against a stand-in audio context and works out each layer's level on paper
(checked against a sample-by-sample simulation, within 0.1 dB). If you change a layer, run it again and copy the numbers into `AMB_REC_REF`;
`node tools/unit_check.js` fails when the table and the layers disagree.

A saved copy of the list in a reader's browser lasts 24 hours. Until it is refreshed, recordings load without the numbers and use the fallback.

## Ducking by spectrum (sound/ambient-ducking.js)

While the narrator speaks, the sounds are dipped and carved at 3 kHz and 800 Hz. That dip used to be the same for every sound. Now it is scaled by how much of
what is playing sits in the speech band: each looping sound counts with its live gain, and a recording counts with its measured `sh` (generated sounds with the share
worked out for their layer, speech band over whole sound in `AMB_REC_REF`). A mix with an average share (0.5) gets exactly the old dip; a share of 0 gets 0.6 of it
and a share of 1 gets 1.4 of it (the gain dip and both carves scale together, in dB). The pause, off and the timing ("dip fast, let go slowly") are not changed.

| recording alone | rain | brown | crowd | engine | wind | drone |
|---|---|---|---|---|---|---|
| share `sh` | 0.70 | 0.79 | 0.62 | 0.49 | 0.14 | 0.01 |
| dip while speaking | -3.9 dB | -4.2 | -3.7 | -3.3 | -2.4 | -2.0 |
| 3 kHz carve | -11.6 dB | -12.4 | -11.0 | -10.0 | -7.2 | -6.0 |

(Today's values, plain mode: dip -3.3 dB, carves -10 dB at 3 kHz and -4 dB at 800 Hz. With "smart" scene dips on, the same factor is applied to those values.)

## Safety limiter (sound/ambient-engine.js)

A burst (thunder, a fire crackle, a crowd laugh) cannot get past a ceiling on the ambient bus, whatever the sliders say. The limiter sits after the mood stage (so the duck,
the carves and the reverb are already in) and before the night shaping and the master volume. It is a soft clipper made with a waveshaper, not a compressor node: browsers add
make-up gain to a compressor, so it cannot be neutral below its threshold, while this curve is exactly the straight line up to the knee.

| bus level (peak) | after the limiter |
|---|---|
| up to 0.5 (-6 dBFS) | unchanged |
| 0.7 | 0.685 (-0.2 dB) |
| 1.0 | 0.84 (-1.5 dB) |
| anything above 1.0 | 0.84 (the ceiling) |

`AMB_LIM` holds the knee (0.5) and the ceiling (0.9, the curve never quite reaches it). Story sounds (`AMB.cue`) join after the limiter and are not touched. If a waveshaper cannot be
made, the bus is connected straight through as before.

## Smart mix as the fine trim (sound/smart-mix.js)

The recordings are levelled before they reach Smart mix (steps above), so Smart mix now only trims. For the ambient bus (the music bus is unchanged) it has a little more
room and a quicker start:

- The lowest ambient trim is -18 dB (was -15); the highest stays +9. Saved trims of older versions are valid as they were.
- The first move for a new book or a new set of sounds is bigger when the starting level is clearly off: up to 8 dB of error it is exactly as before (0.4 of the error), and the
  part of the error above 8 dB counts twice as fast (0.8 per dB), up to 12 dB in one move (was 6). After that the steps are the same small ones (1.5 dB at a time).

| starting level too loud by | 6 dB | 10 dB | 14 dB | 20 dB | 30 dB |
|---|---|---|---|---|---|
| decisions to settle, before | 3 | 5 | 6 | 10 | 17 |
| decisions to settle, now | 3 | 4 | 5 | 6 | 13 |

A decision takes about 4 seconds of narrator speech (2 seconds for a new set of sounds). Smart mix works only when the narrator audio can be analysed; without that, nothing here applies
and the levelling of the recordings and the dip are what protect the narrator.

## Checking a recording before it goes live (tools/ambient_loudness_audit.py)

    python tools/ambient_loudness_audit.py --recordings ../wordtrail-data/recordings.json --compare
    python tools/ambient_loudness_audit.py --dir ./new-recordings        # a folder of files named after the sounds (rain.mp3 ...), measured with ffmpeg

It shows each file's speech-band level, peak, the reference of its sound, the gain the app will apply, and flags any file more than 3 dB from its reference as delivered (the app
then has to change it a lot, which is fine but worth a look), or held back by a gain or peak cap. It needs no network and uses the numbers stored by `ambient_prep.py`.
`--strict` exits with 1 when anything is flagged; `--selftest` checks the tool against the app's own gain function.
