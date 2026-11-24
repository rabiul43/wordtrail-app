# Find the exact ambient clip in the dashboard

Status: written and syntax-checked only. Not run against the real bucket or listened to.

## What changed

Dashboard (`index.html`, Ambient tab)
1. Search now also matches author, license, title, the file address and the word "live". `-`, `_` and `/` count as spaces, so
   "heavy rain" finds `heavy-rain`. Example: type `tosha73` or `CC-BY`.
2. New filter "★ Live clips only" in the status dropdown (Ambient only): the clips the app is playing right now.
3. Link from the app: opening `<dashboard>/#amb=rain&f=<file>&u=<address>&by=<author>` goes to the folder, scrolls to the
   clip, flashes it and shows a message ("Found: Rain · Clip 3 · tosha73 · LIVE"). It also selects the clip, so K / D / B work at once.
   If the exact file is not in the list it shows a search for the sound name and author instead. Works when the dashboard is already
   open, or before you connect (it jumps once you have).

App
4. `src/js/sound/music-playback.js`: in the sound sheet strip, each ambient name (Wind, Rain, Fire) is a link to the dashboard.
   `src/css/80-progress-v10.css`: a dotted underline for those links.
   Owner only: the links stay hidden until you tap the word "Ambient" in the strip 5 times quickly (a message says "Dashboard links ON"; 5 taps again turns them off). `?dash=1` / `?dash=0` in the address still works too. Normal readers
   never see them. The address comes from the new `hosts.json` key "dashboard": the page where you open the dashboard (the `wordtrail-admin` repo), NOT the admin Worker (the Worker only answers API calls and shows "unauthorized"). Empty = no links.

## How to apply
- Replace the dashboard `index.html` (and `admin/index.html` if that is the copy you deploy) and redeploy the admin Worker.
- Copy the two `src/` files over the repo ones, run `python build.py`, deploy.
- In the app, open the Sound sheet and tap the word "Ambient" 5 times quickly.

## Not tested / assumptions
- The link finds the clip by the file address, then by the file name. This works only if the file names in `recordings.json`
  match the clips in `ambient-candidates.json` / `ambient-index.json`. If they do not, you get the fallback search, not the exact clip.
- `COV_ADMIN` (from `100-home-covers.js`) is used inside `music-playback.js`; they share one scope, but run the app once to confirm.

## Replace live clip (dashboard)

Delete on the clip the app is playing no longer shows a warning. It opens a box: "This clip is live". It lists the other clips of the
same folder (kept first, then same author, then best score; clips already marked Delete come last), each with a ▶ to listen.
"Replace and delete" makes the chosen clip live (ambient-index.json, backed up once per session) and marks ONLY the old clip Delete.
The other clips stay as they are (the older Make best still marks every other clip Delete). Nothing is erased until Clean-up.
If the folder has no other clip, the box says so and changes nothing. A "Replace live clip" button also sits next to Delete in the focus view.
Tested only with a stub (ranking, backup, index write, marks); not with the real bucket.
