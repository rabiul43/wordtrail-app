# Tracks sheet, Modern design (phones)

Built from `wordtrail-tracks-concept.png`. Only under Settings > Reading > App design > **Modern** (`<html data-design="modern">`, phones below 700 px). Classic and Storytel-style render pixel-for-pixel as before (checked by screenshot diff of idle / downloading / nothing-saved states).

What Modern shows
- Header: big serif "Tracks", sub title "Book title · N tracks", round close button, no divider line.
- Pill Previous / Next.
- Summary card (replaces the Download book box and the book-progress strip): progress ring "have/N", title, size line, one segment per track (grouped when there are more than 36), and the buttons.
  - nothing saved: Download book
  - some saved: "N of M tracks downloaded", Download remaining · k, Remove
  - downloading: "Downloading track X of M…", MB saved, "about N min left" (from this session's speed), "on Wi-Fi" only when the browser says so, Pause, Cancel
  - paused: Resume · k, Remove
  - all saved: "All M tracks downloaded", Remove download
  - offline: no download buttons
- Filter chips: All N / Downloaded n / Not saved n (resets to All each time the sheet opens; an empty filter shows a short note).
- Rows: number, title, duration, mark. The loaded track is a gold card with bars, "Playing · 8:32 left" (or "Paused") and a progress bar. Mark = circle with arrow (not saved), green check (saved), progress ring + "Downloading · 55%" (busy), dashed ring + "Waiting", red arrow + "Failed · tap to retry".

New behaviour: **Pause** (Modern only). It stops like Cancel but keeps the half-saved bytes (they are already checkpointed, so Resume continues with a Range request) and does not drop the tracks saved so far.

Files
- `src/html/20-sheets-player.html`: `#trk-sub`, `#trk-m` (card), `#trk-flt` (chips), all with `hidden`; `src/html/10-body-views.html`: symbol `i-m-arrowd`.
- `src/js/280-downloads-progress.js`: `dlPause`, `DL.pausing/t0`, `trkMPaint`, `trkMRowPaint`, `trkFilterPaint`; `paintTrack` is now a thin wrapper around the old body (`paintTrack0`). Every new function returns at once unless `isModern()`.
- `src/js/300-wiring.js` (buttons, chips), `270` (filter reset on open), `150` (Playing/Paused label on play/pause).
- `src/css/99i-explore-design.css`: one block at the end, every rule under `html[data-design="modern"]`, colours from theme tokens (works in Dark, Black, Sepia, White, High contrast). The one fixed colour is the "saved" green (`--trk-ok`, darker on light themes).

Notes
- New words ("Pause", "Resume", "Not saved", ...) have no translations yet, so they show in English in other app languages until added to `src/i18n/`.
- `tools/tangle_check.py` reports one new coupling from this work: `280 -> 090 (isModern)`. The 3 other items it lists were already failing before.
