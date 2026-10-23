# Adding or changing music (read this when you forget)

The app reads its music from the **data repo** (`wordtrail-data`), not from this repo. This repo only holds the helper tools.
Both folders sit side by side, for example `C:\Users\testr\Music\test\wordtrail-app` and `...\wordtrail-data`.

## Add new music

1. Open a terminal in the **wordtrail-app** folder (File Explorer: click the address bar, type `cmd`, press Enter).
2. Put each MP3 in the folder of its mood:  `wordtrail-data\music\_inbox\<mood>\`
   Moods: `neutral`, `peace`, `dread`, `danger`, `sorrow`, `merry`, and the optional finer ones `tension`, `wonder`, `romance`, `chase`.
   (Missing folders? run `python tools\music_prep.py --init --data-dir ..\wordtrail-data`.)
   Good clips are 60-120 seconds. Aim for 3 or more per mood.
3. Credits: if the artist or licence differs from Kevin MacLeod / CC-BY, create `wordtrail-data\music\_inbox\credits.json`:
   `{ "file-name.mp3": { "by": "Artist", "lic": "CC0" } }`
4. Build (needs ffmpeg). It keeps every clip and credit already in music.json, adds the new ones, and works out the energy value:

       python tools\music_prep.py --build --data-dir ..\wordtrail-data

5. Check the result and read the warnings:

       python tools\check_audio_data.py --data-dir ..\wordtrail-data

6. In `wordtrail-data`: commit and push `music.json` and the new files in `music/`. The app uses them from then on. No change or deploy of the app is needed.

## Other jobs

- Only add the energy value to an existing music.json (nothing re-encoded): `python tools\music_prep.py --energy-only --data-dir ..\wordtrail-data`
- Credits list for your About page: printed at the end of `--build`.
- Opening sounds: put them in `openings.json` in the data repo; the checker lists which of the nine opening moods have no clip.

## If something looks wrong

- "ffmpeg not found": install ffmpeg and make sure it is on PATH.
- A bad build: `music.json.bak` is the file as it was before the last build or energy run. Copy it back over `music.json`.
- The checker prints what to do next at the end of its report.
