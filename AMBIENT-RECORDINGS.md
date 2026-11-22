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
