# Wordtrail music library (read this when you forget)

The app's background music is **not** in GitHub. It is processed on your PC and hosted on **Cloudflare Pages**.

- Music address: `https://wordtrail-music.pages.dev/`
- Cloudflare Pages project name: `wordtrail-music`
- The app reads the address from one line, `MUS_HOST`, in `src/js/sound/music-library.js`
- Quality: MP3, about 190 kbps VBR, 44.1 kHz, loudness -18 LUFS, clips cut at 150 s
- Size when this guide was written: 388 clips, about 1,038 MB

This replaces the old GitHub / `wordtrail-data` way. `tools/music_prep.py` and `tools/check_audio_data.py` belong to the old way: you do not need them for the steps below.

## How it works (one minute)

1. Your original MP3s sit in mood folders on your PC.
2. `process_music.py` makes a clean copy of every clip in a folder called `processed`.
3. `upload_to_cloudflare.py` uploads the whole `processed` folder to Cloudflare Pages.
4. The app reads `music.json` (the list) and the clips from `https://wordtrail-music.pages.dev/`.

```
Background Music\
    process_music.py
    upload_to_cloudflare.py
    credits.json            (only if needed, see "Credits")
    peace\  dread\  danger\ ...   <- your ORIGINAL music, one folder per mood
    processed\                    <- made by the script: this is what gets uploaded
        music\<mood>\clip.mp3
        music.json   credits.txt   report.txt   _headers   .cache.json
```

**Keep your originals.** They are the only full-quality copy. The `processed` folder can be rebuilt from them at any time, but the originals cannot be rebuilt from `processed`.

## Mood folders

The app knows these moods: `neutral`, `peace`, `dread`, `danger`, `sorrow`, `merry`, `tension`, `wonder`, `romance`, `chase`.

Two of your own folder names are renamed by the script: `epic` becomes `danger`, `mystery` becomes `tension`. That is why `processed\music` has fewer folders than your music folder. This is correct.

## Needed once

- Python 3 and ffmpeg (ffmpeg and ffprobe must be on PATH)
- Node.js (for `npx wrangler`)
- Log in to Cloudflare: `npx wrangler login` (click Allow in the browser)

## Add music

1. Copy the new MP3s into the mood folders, for example `peace\New Song.mp3`.
2. Open cmd in the `Background Music` folder (File Explorer: click the address bar, type `cmd`, press Enter).
3. Check first, nothing is written:
   `python process_music.py --dry-run`
4. Process:
   `python process_music.py`
   Only new files are processed. You can stop it with Ctrl+C and run it again.
5. Open `processed\report.txt` and read it (skipped files, duplicates, files with no artist).
6. Upload the **whole** `processed` folder:
   `python upload_to_cloudflare.py "C:\Users\testr\Music\Background Music\processed"`
   Use the real path of your `processed` folder. Wait for **DONE**.
7. Check on your phone: `https://wordtrail-music.pages.dev/music.json` shows the list.

What the script does to each file: fixes the name (`Dark%20Walk.mp3` becomes `dark-walk.mp3`), cuts clips longer than 150 s, evens out the loudness, removes tags and cover pictures, finds the loop point, and writes `music.json`.

What it skips: broken files, files that are not audio, silent clips, clips under 30 s, exact duplicates, and copies of the same song (`Song (1).mp3`, `Song - Copy.mp3`). Skipped files are listed in `report.txt`.

## Remove music

1. Delete the file from its mood folder.
2. Run `python process_music.py --prune-stale` (this also deletes its clip in `processed` and removes it from `music.json`).
3. Upload the whole `processed` folder again (step 6 above).

## Always upload the whole folder

Each deploy replaces the whole site. If you upload only the new files, the old clips disappear from the site. Cloudflare only sends files that changed, so a full upload after a small change should be quick (not verified for every case).

## Credits (important: CC BY needs the credit)

- The artist comes from the file's own tag. Kevin MacLeod files get `CC-BY` automatically.
- Files with no artist tag are credited to Kevin MacLeod by default and listed in `report.txt` under "No artist tag". **Check them.**
- For any other artist, create `credits.json` next to `process_music.py`, using the ORIGINAL file name, then run the script again:

```json
{ "Some Song.mp3": { "by": "Artist Name", "lic": "CC0" } }
```

- Never use music licensed NC (non-commercial) or ND (no derivatives).
- `processed\credits.txt` is the list for your About page. Update the page when you add music.

## Change the quality

- Default is about 190 kbps VBR (close to the original).
- Smaller files: `python process_music.py --kbps 128`
- Back to default: `python process_music.py --kbps 190`
- Changing quality redoes every clip, then upload again. The app needs no change.

## Other script options

| Option | What it does |
|---|---|
| `--dry-run` | look and report, write nothing |
| `--prune-stale` | delete clips in `processed` whose source file is gone |
| `--max-seconds N` | cut clips longer than N seconds (default 150) |
| `--min-seconds N` | skip clips shorter than N seconds (default 30) |
| `--jobs N` | clips processed at the same time (default up to 6) |
| `--by NAME` / `--lic LIC` | artist and licence for files with no tag |
| `--root FOLDER` / `--out NAME` | other music folder / other output folder name |

## If the power goes off or the internet drops

Run the same command again.

- `process_music.py`: finished clips are not done twice.
- `upload_to_cloudflare.py`: it also retries by itself up to 40 times. I believe wrangler skips files it already uploaded, but this was not verified; the worst case is that it uploads everything again.

## Limits and sizes

- Cloudflare Pages: 25 MiB per file and 20,000 files per deployment. A clip is about 2-3 MB, so this is fine.
- I found no total-size limit in the docs. The full 1,038 MB uploaded without problems.
- The app keeps `music.json` for 24 hours. A new clip can take up to a day to show on a phone that already has the old list.

## Move to another host later

1. Upload the `processed` folder to the new host. It must send the CORS header from `processed\_headers` (`Access-Control-Allow-Origin: *`).
2. Change the one `MUS_HOST` line in `src/js/sound/music-library.js` (keep the `/` at the end).
3. Run `python build.py` and deploy the app.

## If something looks wrong

| Problem | What to do |
|---|---|
| "ffmpeg not found" | install ffmpeg and make sure it is on PATH |
| Upload says not logged in | run `npx wrangler login`, then upload again |
| No music in the app | open `https://wordtrail-music.pages.dev/music.json` on the phone; if it fails, upload again |
| Music list loads but a clip does not play | open `https://wordtrail-music.pages.dev/music/<mood>/<file>.mp3` in the browser to see the error |
| A new clip is not in the app | wait up to 24 hours, or clear the site data on the phone |
| Wrong credit shown | fix `credits.json`, run `process_music.py` again, upload |
| Want a clean start | delete the `processed` folder and run `process_music.py` again (all clips are redone) |

## Still on GitHub (not part of this guide)

`ambient.json`, `openings.json`, `home.json`, `catalog.json`, the book data and similar files are still read from the GitHub data repo. If that account stays suspended, those parts of the app will not load. Moving them is a separate job.
