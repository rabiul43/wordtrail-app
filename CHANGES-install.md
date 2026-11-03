# Install button (Settings > Basics > Install Wordtrail)

Copy these 3 files over your good project (same folders; they build on the bookspeed zip), then run `python build.py` and `python tools/deps.py`:
- src/html/00-head.html          (+1 small script: keeps the browser's install offer)
- src/js/298-pwa.js              (install logic)
- src/js/290-backup-maintenance.js (the Settings row and its show rule)

Test (needs https, e.g. your Cloudflare site; not a local file):
- Android Chrome: Settings > Install Wordtrail > the browser's install dialog.
- iPhone: the row shows "Tap Share, then Add to Home Screen."
- After installing, opened from the home screen: the row is gone.
