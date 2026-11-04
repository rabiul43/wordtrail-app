# New Home design (Settings > Appearance > "New Home design")

Phones only (under 700 px). On by default. Turn it off in Settings and the previous Home returns.

Files changed
- src/html/00-head.html: sets <html data-home="st"|"off"> before first paint
- src/html/10-body-views.html: adds #st-head (Home title, search and account buttons) and #st-chips (genre chips)
- src/html/30-sheets-settings.html: adds the "New Home design" switch (#in-home) under "New Home header"
- src/js/090-synced-stats-book-search.js: applyHome() and stHomeInit() (chips reuse the existing genre filter)
- src/js/290-backup-maintenance.js: loads the switch state
- src/js/300-wiring.js: saves P.homeNew, re-applies on resize, starts stHomeInit()
- src/css/99c-home-storytel.css: NEW, all the styling, every rule starts with html[data-home="st"]
- build.py: one line to include the new CSS file after 99-home-header.css

Note: hosts.json in the uploaded zip is corrupted (all null bytes), so it is not included. Use your own copy.
